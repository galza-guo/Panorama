# Panorama Upstream Alignment Design

Date: 2026-03-01
Status: Approved for execution

## Goal

Rebase Panorama's product direction onto current Wealthfolio v3 so Panorama can keep following upstream with small, reviewable syncs while preserving Panorama-specific localization and asset-class extensions.

## Current State

As of 2026-03-01, Panorama is no longer a light fork:

- The current local branch has diverged significantly from `upstream/main`.
- Panorama still uses the legacy app layout centered on `src/`, `src-core/`, `src-server/`, and `src-tauri/`.
- Wealthfolio v3 moved to a newer layout centered on `apps/` and `crates/`.
- Panorama-specific behavior spans core data, UI routes, packaging, branding, and website deployment.

This means a direct merge into the current `main` would create a large one-time conflict set and leave Panorama with a broad long-lived diff against upstream.

## Problem Statement

Panorama needs two things at the same time:

1. Keep Panorama-only functionality such as CN market data coverage, Panorama symbol rules, Insurance, and MPF.
2. Reduce the long-term maintenance cost of staying close to Wealthfolio.

The current branch layout optimizes for short-term local iteration, not for ongoing upstream compatibility.

## Options Considered

### Option A: Merge `upstream/main` into the current Panorama `main`

Pros:

- Fastest to start.
- Keeps all local history in place.

Cons:

- High conflict risk because the repository layout changed upstream.
- Produces a mixed diff where architecture migration and Panorama customization are hard to separate.
- Makes future upstream syncs expensive again.

### Option B: Cherry-pick selected upstream commits into the current Panorama codebase

Pros:

- Useful for isolated bug fixes.
- Lets Panorama stay on the current structure temporarily.

Cons:

- Poor fit for a major upstream architecture change.
- Requires repeated manual selection and adaptation.
- Keeps Panorama on a parallel mainline instead of rejoining the upstream shape.

### Option C: Rebuild Panorama on top of Wealthfolio v3 and forward-port Panorama deltas by domain

Pros:

- Produces the smallest long-term diff.
- Makes future upstream syncs routine instead of exceptional.
- Forces Panorama customizations into clear extension boundaries.

Cons:

- Higher up-front migration cost.
- Requires deliberate classification of what stays local, what should be upstreamed, and what should be dropped.

## Decision

Use Option C.

Panorama should adopt Wealthfolio v3 as the new baseline, then forward-port Panorama changes in narrow thematic waves. The target operating model is:

- `upstream/main` remains the reference source of truth for core platform evolution.
- Panorama `main` becomes "upstream v3 plus a thin Panorama layer".
- Panorama-specific behavior is isolated wherever possible into additive modules, provider registrations, settings, pages, and branding files instead of broad core rewrites.

## Design Principles

### 1. Upstream-first mainline

When there is a choice between adapting Panorama to upstream structure or preserving the older Panorama layout, prefer adapting to upstream structure.

### 2. Thin local diff

Every Panorama customization must be explicitly categorized:

- `UPSTREAM_CANDIDATE`: general improvements that could be proposed upstream
- `LOCAL_EXTENSION`: localized features Panorama should keep but isolate cleanly
- `LOCAL_FORK`: branding, product choices, or regional scope that will remain fork-only
- `DROP_OR_REPLACE`: old local code now superseded by upstream v3

### 3. Domain-by-domain forward porting

Do not migrate by replaying old commits blindly. Migrate in domain lanes:

- Platform and repository layout
- Market data and symbol normalization
- Specialized assets and navigation
- Addon/runtime extensions
- Branding, docs, and website

### 4. Sync work must stay separate from feature work

Upstream sync branches must not carry unrelated product changes. Product branches must not become hidden sync branches.

## Target Operating Model

### Branching

- `upstream/main`: read-only tracking branch
- `main`: Panorama release branch
- `sync/upstream-YYYYMMDD`: regular upstream sync branch
- `codex/*` or feature branches: isolated work for a single migration lane

### Sync cadence

- Sync from upstream weekly or bi-weekly.
- Prefer many small syncs over infrequent catch-up efforts.
- Each sync should include only:
  - upstream merge or rebase work
  - conflict resolution
  - verification
  - minimal follow-up fixes required to restore green status

### Change policy

- If a Panorama feature can be expressed as a provider, page, setting, or adapter, do that instead of editing shared core logic broadly.
- If Panorama needs to touch shared core logic, first create a seam or extension point, then layer the Panorama behavior on top.
- Generic fixes should be prepared for potential upstream contribution.

## Migration Waves

### Wave 0: Foundation

- Establish the approved strategy in repo docs.
- Create a Panorama customization inventory.
- Create a path map from current Panorama files to Wealthfolio v3 targets.
- Set up an isolated worktree and branch once local `git` is usable again.

### Wave 1: Platform baseline

- Start from Wealthfolio v3 as the code baseline.
- Restore Panorama package names, app identity, and required packaging metadata without reintroducing legacy structure.
- Re-enable Panorama website and release scripts only if still needed.

### Wave 2: Market data localization

- Forward-port `EASTMONEY_CN`, `TIANTIAN_FUND`, and Panorama symbol normalization.
- Keep the provider integration narrow: constants, registry, provider modules, settings UI, and migration seed data.
- Preserve Open Exchange Rates only if it still fills a real gap in v3.

### Wave 3: Specialized asset classes

- Forward-port Insurance and MPF as additive feature lanes.
- Reuse upstream data model seams where possible.
- Avoid baking Panorama-only asset assumptions deeply into unrelated core flows.

### Wave 4: Addons and product polish

- Reconcile Panorama addon SDK/dev tooling changes with upstream v3 addon runtime.
- Re-evaluate custom addons one by one instead of carrying all local addon changes automatically.

## Acceptance Criteria

The migration is successful when all of the following are true:

- Panorama builds on top of Wealthfolio v3 structure.
- Panorama keeps CN market data support and its symbol standard.
- Panorama keeps Insurance and MPF user-visible flows.
- Panorama-specific files are clearly documented and limited in scope.
- Upstream sync can happen in a dedicated branch without reworking the whole app structure again.

## Risks

- Panorama's Insurance and MPF support may currently rely on assumptions embedded in core services, not just UI pages.
- Upstream v3 may already have alternative implementations that partially overlap with Panorama local changes.
- Addon and packaging changes may have drifted enough that they need selective adoption instead of direct copying.
- The current workstation cannot perform `git` branch or worktree operations until the Xcode license is accepted.

## Immediate Next Steps

1. Keep this design as the governing direction.
2. Build and maintain a single source of truth inventory of Panorama customizations.
3. Create the implementation plan for the migration foundation.
4. Unblock local `git` so worktree-based execution can begin.
