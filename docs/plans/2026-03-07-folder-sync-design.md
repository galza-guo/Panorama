# Folder Sync Design

**Goal:** Add a simple, stable, mostly invisible desktop sync flow for shared household finance data using Syncthing as the transport layer, without requiring a hosted server.

## Context

Panorama already stores the shared finance domain in local SQLite and already contains app-side sync foundations such as outbox records, applied event tracking, cursor state, and last-writer-wins metadata. That foundation is a better fit than syncing the live `app.db` file itself.

The product goal is not millisecond sync or zero-conflict collaboration. The goal is:

- first-time setup is simple
- routine usage is automatic
- both users usually see the same current household view
- failures degrade safely and recover automatically when possible

## Why Not Sync `app.db`

Directly syncing the live SQLite database file is not reliable enough for this use case.

- SQLite runs with WAL enabled in this repository, so the durable state is not always represented by a single file.
- Syncthing understands files, not database transaction boundaries.
- Concurrent edits on two devices produce file-level conflicts, not domain-level conflicts.
- Database-file conflicts are hard to explain and hard to recover from.

Instead, Panorama should sync application-level content:

- incremental domain change events for day-to-day updates
- periodic shared-data snapshots for bootstrap and recovery

Each device continues to use its own local SQLite database as the runtime source of truth.

## Scope

### In Scope

- Desktop sync only
- Syncthing-backed shared folder selected by the user
- Automatic export of local shared-data mutations into event files
- Automatic import of remote event files from other devices
- Periodic and on-demand shared-data snapshots
- Join flow for a second device using snapshot + event replay
- Lightweight sync status and recent history in the UI

### Out of Scope

- Hosting or depending on a Panorama sync server
- End-to-end encryption for v1
- Addon syncing
- Secret/keyring syncing
- Login/session syncing
- Mobile-specific sync support
- Fine-grained collaborative merge beyond last-writer-wins

## Shared Data Boundary

The first version should sync only household-visible finance data and required shared settings.

### Sync This

- accounts
- assets
- activities
- goals
- contribution limits
- classifications and assignments
- import mappings/profiles that affect shared bookkeeping behavior
- quotes and market-related shared data already persisted in SQLite
- holdings snapshots and other portfolio snapshots required for consistent shared views
- minimal shared settings such as `base_currency`

### Do Not Sync

- `instance_id`
- sync or auth secrets stored in the OS keyring
- refresh/access tokens and session restoration state
- local UI preferences such as theme/font/window behavior
- addons and addon install state
- logs
- backups

This split keeps the shared household ledger aligned while preserving per-device identity and local ergonomics.

## High-Level Architecture

### Local Runtime

Each device keeps using its own local SQLite database in the existing app data directory. No live database file is shared.

### Shared Folder

The user chooses a Syncthing-managed folder. Panorama treats that folder as a transport mailbox, not as a runtime database.

Suggested layout:

```text
PanoramaSync/
  folder.json
  events/
    <device-id>/
      <event-id>.json
  snapshots/
    <device-id>/
      <snapshot-id>.db
  logs/
    <device-id>/
      <timestamp>.json
```

Rules:

- `folder.json` is created once and then treated as immutable metadata
- each device writes only to its own subdirectories
- devices never edit or delete another device's files
- runtime state about what has already been imported stays local, in SQLite

This avoids shared mutable index files, which would otherwise create avoidable Syncthing conflicts.

## Event Model

Routine synchronization is driven by immutable event files.

Each event file contains:

- `event_id`
- `device_id`
- `entity`
- `entity_id`
- `operation`
- `client_timestamp`
- `payload`
- optional metadata such as app version and schema version

The existing local outbox infrastructure should remain the source of exportable mutations. The new folder-sync layer should adapt pending outbox records into event files written to the shared folder.

### Event Export

When a shared mutation occurs:

1. The application writes the normal local domain change.
2. The existing outbox records that shared mutation.
3. The folder-sync exporter writes an immutable event file into `events/<device-id>/`.
4. Syncthing distributes that file.

### Event Import

On startup, foreground resume, timer tick, or manual retry:

1. The application scans remote device event directories.
2. It ignores events already recorded as applied locally.
3. It applies unseen remote events using the existing LWW policy.
4. It records success or failure in local sync history.

This keeps the runtime behavior idempotent and restart-safe.

## Snapshot Model

Snapshots are not the normal day-to-day sync mechanism. They exist for:

- first-time join
- disaster recovery
- faster recovery than replaying all historical events

Snapshots should export only the shared data set, not the entire device database.

### Snapshot Creation

Create a new snapshot:

- when folder sync is initialized
- periodically after a configurable amount of time or exported events
- optionally after large import batches

### Snapshot Restore

When a new device joins:

1. It locates the newest available shared snapshot.
2. If local shared data already exists, it creates a local backup first.
3. It restores shared data from that snapshot.
4. It imports subsequent remote events.

### Explicit Non-Goal

Version 1 does not support merging two already-diverged independent ledgers. Joining an existing shared folder means adopting the shared ledger from that folder.

## Sync Triggers

After initial setup, sync should be mostly invisible.

The app should automatically run folder sync when:

- the app starts
- the window returns to foreground
- a short periodic timer fires
- a local shared mutation is written
- the user clicks `Check now`

Suggested cadence:

- immediate export after local shared mutation
- import scan every 5-10 seconds while the app is open
- import scan on startup and foreground even if the timer has not fired yet

This is intentionally not real-time. It is optimized for household bookkeeping, not collaborative editing latency.

## Conflict Handling

Version 1 should use the existing last-writer-wins policy:

- newer `client_timestamp` wins
- if equal, higher lexical `event_id` wins

Consequences:

- no field-level merge
- delete vs update follows the same ordering rule
- simultaneous edits resolve predictably, but not collaboratively

To keep the experience understandable, the UI should not expose a complex conflict workflow. Instead, sync history should record plain-language entries such as:

- remote change replaced local version
- older remote change skipped

## Failure Handling

### Shared Folder Unavailable

If the selected shared folder is missing or temporarily unavailable:

- the app remains fully usable
- local mutations continue to be recorded
- the UI shows a degraded sync status
- the app retries automatically later

### Remote Event Apply Failure

If a remote event cannot be applied:

- stop importing subsequent events for that source until retried
- record the failure locally
- surface a lightweight `Needs attention` state
- allow retry
- allow recovery from the latest shared snapshot

### Syncthing Delay or Offline Peer

This should be treated as normal, not an error:

- one device may be offline
- file propagation may take time
- the UI should communicate waiting/checking, not failure

## UX

The user asked for a very small UI footprint. Version 1 should add a single `Folder Sync` section in settings.

### Setup UI

- choose shared folder
- initialize new shared folder
- join existing shared folder
- back up local data before destructive join

### Everyday UI

- status badge:
  - `Checking`
  - `Up to date`
  - `Applying changes`
  - `Folder unavailable`
  - `Needs attention`
- timestamps:
  - last successful sync
  - last local change exported
  - last remote change applied
- actions:
  - `Check now`
  - `Retry`
- recent history:
  - last 20 entries is enough

The app should never require routine manual sync if the folder is healthy.

## Data and State Placement

Folder-sync runtime metadata should be local-only, persisted separately from shared content. That includes:

- selected shared folder path
- local `device_id`
- last exported event file markers
- last imported event per remote device
- recent sync history
- current status

This metadata may live in new local-only SQLite tables or a local config file, but local SQLite is preferred for consistency with existing app architecture.

## Testing Strategy

The feature should be validated at three levels.

### Unit Tests

- event file naming and serialization
- shared/non-shared entity filtering
- LWW import behavior
- duplicate event import no-op behavior
- folder metadata parsing

### Repository / Integration Tests

- exporting local mutations produces expected event files
- importing remote files updates SQLite correctly
- join flow restores from snapshot and then applies later events
- unavailable folder does not corrupt local data
- partial failure leaves retryable state

### Manual End-to-End Checks

- configure two desktops against one Syncthing folder
- edit on device A, observe on device B without manual sync
- edit while device B is offline, then reopen B and verify catch-up
- simulate folder missing and verify graceful degradation

## Recommendation

Build version 1 as:

- desktop-only
- no encryption
- shared-data-only
- Syncthing as transport
- event files for daily sync
- periodic snapshots for bootstrap and recovery
- lightweight status/history UI

This is the simplest design that is still stable and defensible for a two-person household finance workflow.
