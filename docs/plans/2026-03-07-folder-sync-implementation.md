# Folder Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build desktop-only folder-based shared-data sync using Syncthing transport, with automatic event export/import, snapshot bootstrap, and lightweight sync status/history UI.

**Architecture:** Keep each device's SQLite database local and treat the Syncthing folder as an append-only transport mailbox. Reuse the existing app-side sync outbox and LWW application logic, but replace the current server transport dependency with a folder transport and local-only sync metadata.

**Tech Stack:** Tauri, Rust, SQLite/Diesel, existing storage-sqlite sync infrastructure, React frontend, Syncthing-managed shared folder on disk.

---

### Task 1: Create local-only folder sync metadata storage

**Files:**
- Create: `crates/storage-sqlite/migrations/2026-03-07-000001_folder_sync_foundation/up.sql`
- Create: `crates/storage-sqlite/migrations/2026-03-07-000001_folder_sync_foundation/down.sql`
- Modify: `crates/storage-sqlite/src/schema.rs`
- Create: `crates/storage-sqlite/src/sync/folder_sync/mod.rs`
- Create: `crates/storage-sqlite/src/sync/folder_sync/model.rs`
- Create: `crates/storage-sqlite/src/sync/folder_sync/repository.rs`
- Modify: `crates/storage-sqlite/src/sync/mod.rs`
- Test: `crates/storage-sqlite/src/sync/folder_sync/repository.rs`

**Step 1: Write the failing tests**

Add repository tests that expect:

- saving and loading folder sync config
- recording imported remote events idempotently
- appending sync history entries
- updating sync status timestamps

**Step 2: Run test to verify it fails**

Run: `cargo test -p wealthfolio-storage-sqlite folder_sync -- --nocapture`
Expected: FAIL because folder sync storage types and tables do not exist.

**Step 3: Write minimal implementation**

Add local-only tables for:

- folder sync config
- imported file markers or remote event markers
- sync history
- current sync status snapshot

Implement a repository API with focused methods only for v1 behavior.

**Step 4: Run test to verify it passes**

Run: `cargo test -p wealthfolio-storage-sqlite folder_sync -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/storage-sqlite/migrations/2026-03-07-000001_folder_sync_foundation/up.sql crates/storage-sqlite/migrations/2026-03-07-000001_folder_sync_foundation/down.sql crates/storage-sqlite/src/schema.rs crates/storage-sqlite/src/sync/mod.rs crates/storage-sqlite/src/sync/folder_sync/mod.rs crates/storage-sqlite/src/sync/folder_sync/model.rs crates/storage-sqlite/src/sync/folder_sync/repository.rs
git commit -m "feat: add folder sync local metadata storage"
```

### Task 2: Define shared-folder file contracts

**Files:**
- Create: `crates/core/src/sync/folder_sync.rs`
- Modify: `crates/core/src/sync/mod.rs`
- Test: `crates/core/src/sync/folder_sync.rs`

**Step 1: Write the failing tests**

Add tests for:

- folder metadata parsing from `folder.json`
- event filename generation
- snapshot filename generation
- event serialization shape
- shared-settings allowlist behavior

**Step 2: Run test to verify it fails**

Run: `cargo test -p wealthfolio-core folder_sync -- --nocapture`
Expected: FAIL because folder sync contract types do not exist.

**Step 3: Write minimal implementation**

Create types for:

- folder metadata
- event file payload
- snapshot manifest metadata
- sync history event kinds if shared with frontend

Keep the format versioned and append-only.

**Step 4: Run test to verify it passes**

Run: `cargo test -p wealthfolio-core folder_sync -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/core/src/sync/folder_sync.rs crates/core/src/sync/mod.rs
git commit -m "feat: define folder sync file contracts"
```

### Task 3: Implement shared-folder file system service

**Files:**
- Create: `apps/tauri/src/services/folder_sync_fs.rs`
- Test: `apps/tauri/src/services/folder_sync_fs.rs`

**Step 1: Write the failing tests**

Add tests using temp directories for:

- creating folder structure
- writing immutable event files
- listing remote event files by device directory
- writing and discovering snapshots
- refusing to overwrite immutable files

**Step 2: Run test to verify it fails**

Run: `cargo test -p panorama folder_sync_fs -- --nocapture`
Expected: FAIL because the file system service does not exist.

**Step 3: Write minimal implementation**

Implement a small Tauri-side service that:

- creates `folder.json` once
- creates per-device event and snapshot directories
- writes event files atomically
- scans remote device directories deterministically

Use temp-file-then-rename semantics for writes.

**Step 4: Run test to verify it passes**

Run: `cargo test -p panorama folder_sync_fs -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/tauri/src/services/folder_sync_fs.rs
git commit -m "feat: add folder sync file system service"
```

### Task 4: Export shared outbox mutations into event files

**Files:**
- Create: `apps/tauri/src/services/folder_sync_exporter.rs`
- Modify: `apps/tauri/src/context/providers.rs`
- Modify: `crates/storage-sqlite/src/sync/mod.rs`
- Test: `apps/tauri/src/services/folder_sync_exporter.rs`

**Step 1: Write the failing tests**

Add tests that:

- seed pending outbox events
- run the exporter
- verify expected files are created in the device event directory
- verify non-shared/local-only settings are not exported

**Step 2: Run test to verify it fails**

Run: `cargo test -p panorama folder_sync_exporter -- --nocapture`
Expected: FAIL because no exporter exists.

**Step 3: Write minimal implementation**

Implement an exporter that:

- reads pending shared outbox events
- serializes them as folder sync event files
- records local export history/status
- does not mark cloud-specific state or depend on server transport

**Step 4: Run test to verify it passes**

Run: `cargo test -p panorama folder_sync_exporter -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/tauri/src/services/folder_sync_exporter.rs apps/tauri/src/context/providers.rs crates/storage-sqlite/src/sync/mod.rs
git commit -m "feat: export shared mutations to folder sync events"
```

### Task 5: Import remote event files into local SQLite

**Files:**
- Create: `apps/tauri/src/services/folder_sync_importer.rs`
- Modify: `crates/storage-sqlite/src/sync/app_sync/repository.rs`
- Test: `apps/tauri/src/services/folder_sync_importer.rs`

**Step 1: Write the failing tests**

Add tests that:

- create remote event files from another device
- import them once and verify database mutation
- import them again and verify no duplicate application
- verify LWW skip/replace behavior

**Step 2: Run test to verify it fails**

Run: `cargo test -p panorama folder_sync_importer -- --nocapture`
Expected: FAIL because no importer exists.

**Step 3: Write minimal implementation**

Implement importer logic that:

- scans remote event directories
- ignores this device's own directory
- checks local applied markers
- applies unseen events with existing LWW logic
- records success/failure in local sync history and status

**Step 4: Run test to verify it passes**

Run: `cargo test -p panorama folder_sync_importer -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/tauri/src/services/folder_sync_importer.rs crates/storage-sqlite/src/sync/app_sync/repository.rs
git commit -m "feat: import remote folder sync events"
```

### Task 6: Implement snapshot export and join/restore flow

**Files:**
- Create: `apps/tauri/src/services/folder_sync_snapshot.rs`
- Modify: `apps/tauri/src/commands/utilities.rs`
- Modify: `crates/storage-sqlite/src/db/mod.rs`
- Test: `apps/tauri/src/services/folder_sync_snapshot.rs`

**Step 1: Write the failing tests**

Add tests that:

- export a shared-data snapshot into the shared folder
- restore from the newest snapshot into a clean local database
- require a local backup before destructive join when shared data exists locally

**Step 2: Run test to verify it fails**

Run: `cargo test -p panorama folder_sync_snapshot -- --nocapture`
Expected: FAIL because snapshot service does not exist.

**Step 3: Write minimal implementation**

Implement:

- snapshot export to `snapshots/<device-id>/`
- latest snapshot discovery
- join flow helper that backs up local DB and restores shared data
- post-restore import of later event files

Reuse existing backup/restore helpers where possible.

**Step 4: Run test to verify it passes**

Run: `cargo test -p panorama folder_sync_snapshot -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/tauri/src/services/folder_sync_snapshot.rs apps/tauri/src/commands/utilities.rs crates/storage-sqlite/src/db/mod.rs
git commit -m "feat: add folder sync snapshot bootstrap flow"
```

### Task 7: Add background orchestration for invisible sync

**Files:**
- Create: `apps/tauri/src/services/folder_sync_runtime.rs`
- Modify: `apps/tauri/src/lib.rs`
- Modify: `apps/tauri/src/context/registry.rs`
- Test: `apps/tauri/src/services/folder_sync_runtime.rs`

**Step 1: Write the failing tests**

Add tests for:

- startup scan trigger
- foreground-resume scan trigger
- periodic polling behavior
- folder unavailable state transition without crashing

**Step 2: Run test to verify it fails**

Run: `cargo test -p panorama folder_sync_runtime -- --nocapture`
Expected: FAIL because runtime orchestration does not exist.

**Step 3: Write minimal implementation**

Implement a runtime that:

- exports immediately after local mutation notifications
- imports on startup
- imports on app foreground
- imports every 5-10 seconds while enabled
- updates local sync status without blocking normal app usage

**Step 4: Run test to verify it passes**

Run: `cargo test -p panorama folder_sync_runtime -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/tauri/src/services/folder_sync_runtime.rs apps/tauri/src/lib.rs apps/tauri/src/context/registry.rs
git commit -m "feat: add automatic folder sync runtime"
```

### Task 8: Expose Tauri commands for folder sync setup and status

**Files:**
- Create: `apps/tauri/src/commands/folder_sync.rs`
- Modify: `apps/tauri/src/commands/mod.rs`
- Modify: `apps/tauri/src/lib.rs`
- Test: `apps/tauri/src/commands/folder_sync.rs`

**Step 1: Write the failing tests**

Add tests that expect commands for:

- get current folder sync config/status/history
- initialize shared folder
- join existing folder
- retry sync now
- disable folder sync

**Step 2: Run test to verify it fails**

Run: `cargo test -p panorama folder_sync_command -- --nocapture`
Expected: FAIL because the commands do not exist.

**Step 3: Write minimal implementation**

Add thin commands that delegate to the folder sync services and return frontend-friendly DTOs.

**Step 4: Run test to verify it passes**

Run: `cargo test -p panorama folder_sync_command -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/tauri/src/commands/folder_sync.rs apps/tauri/src/commands/mod.rs apps/tauri/src/lib.rs
git commit -m "feat: expose folder sync commands"
```

### Task 9: Add frontend adapter bindings and hooks

**Files:**
- Modify: `apps/frontend/src/adapters/tauri/core.ts`
- Modify: `apps/frontend/src/adapters/tauri/index.ts`
- Create: `apps/frontend/src/features/folder-sync/hooks/use-folder-sync.ts`
- Test: `apps/frontend/src/features/folder-sync/hooks/use-folder-sync.test.ts`

**Step 1: Write the failing tests**

Add hook tests for:

- loading status
- rendering sync history
- invoking `Check now`
- surfacing unavailable/attention states

**Step 2: Run test to verify it fails**

Run: `pnpm test use-folder-sync`
Expected: FAIL because the hook and adapter bindings do not exist.

**Step 3: Write minimal implementation**

Create adapter calls and one focused React hook for the settings UI.

**Step 4: Run test to verify it passes**

Run: `pnpm test use-folder-sync`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/adapters/tauri/core.ts apps/frontend/src/adapters/tauri/index.ts apps/frontend/src/features/folder-sync/hooks/use-folder-sync.ts apps/frontend/src/features/folder-sync/hooks/use-folder-sync.test.ts
git commit -m "feat: add folder sync frontend bindings"
```

### Task 10: Add the minimal settings UI

**Files:**
- Create: `apps/frontend/src/features/folder-sync/components/folder-sync-card.tsx`
- Modify: `apps/frontend/src/pages/settings/about/about-page.tsx`
- Modify: `apps/frontend/src/lib/types.ts`
- Test: `apps/frontend/src/features/folder-sync/components/folder-sync-card.test.tsx`

**Step 1: Write the failing tests**

Add component tests that expect:

- setup actions for initialize/join
- compact status badge
- last sync timestamps
- recent history list
- `Check now` action

**Step 2: Run test to verify it fails**

Run: `pnpm test folder-sync-card`
Expected: FAIL because the card does not exist.

**Step 3: Write minimal implementation**

Build a small settings card only. Keep it utilitarian and avoid a separate dashboard.

**Step 4: Run test to verify it passes**

Run: `pnpm test folder-sync-card`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/features/folder-sync/components/folder-sync-card.tsx apps/frontend/src/pages/settings/about/about-page.tsx apps/frontend/src/lib/types.ts apps/frontend/src/features/folder-sync/components/folder-sync-card.test.tsx
git commit -m "feat: add folder sync settings ui"
```

### Task 11: Run integrated verification

**Files:**
- Modify: `docs/plans/2026-03-07-folder-sync-implementation.md`

**Step 1: Run Rust tests**

Run: `cargo test`
Expected: PASS

**Step 2: Run frontend tests**

Run: `pnpm test`
Expected: PASS

**Step 3: Run type checks**

Run: `pnpm type-check`
Expected: PASS

**Step 4: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 5: Manual two-device test**

Run through:

- initialize folder on device A
- join folder on device B
- edit shared data on A and observe B update automatically
- edit while B is offline and observe catch-up on reopen
- temporarily remove shared folder and verify graceful degraded state

Expected: all scenarios behave as designed.

**Step 6: Commit**

```bash
git add docs/plans/2026-03-07-folder-sync-implementation.md
git commit -m "docs: verify folder sync implementation plan"
```
