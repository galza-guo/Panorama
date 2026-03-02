# Upstream Sync Guide

This document defines how Panorama should stay aligned with
`afadil/wealthfolio` over time.

The core rule is simple:

- Panorama follows Wealthfolio as the main platform baseline.
- Panorama-specific behavior stays in a narrow, documented fork layer.
- Upstream sync work stays separate from feature work.

## Source of Truth

- Upstream repository: `https://github.com/afadil/wealthfolio`
- Local upstream remote: `upstream`
- Panorama release branch: `main`
- Approved design: `docs/plans/2026-03-01-panorama-upstream-alignment-design.md`
- Customization inventory: `docs/plans/2026-03-01-panorama-customization-inventory.md`

## Branch Roles

- `upstream/main`
  - Read-only tracking branch for Wealthfolio.
- `main`
  - Panorama release branch.
- `sync/upstream-YYYYMMDD`
  - One branch per upstream sync.
- `codex/*` or feature branches
  - One branch per Panorama feature or migration lane.

Do not mix these roles.

## Sync Cadence

- Sync weekly if upstream is active.
- Sync at least every two weeks even if Panorama is busy with feature work.
- Prefer small sync branches over a large catch-up merge.

## What Belongs In a Sync Branch

Allowed:

- merging or rebasing upstream changes
- conflict resolution
- minimal compile fixes caused by upstream changes
- minimal test fixes caused by upstream changes
- documentation updates needed to reflect new sync rules

Not allowed:

- unrelated product work
- opportunistic refactors
- branding refreshes
- new Panorama-only features

If a change is not required to make the upstream sync green, move it to a
separate branch.

## Standard Sync Workflow

### 1. Start clean

Make sure local `main` is in a known state before starting the sync.

### 2. Fetch upstream

```bash
git fetch upstream --prune
```

### 3. Create a dedicated sync branch

```bash
git checkout main
git checkout -b sync/upstream-YYYYMMDD
```

### 4. Merge upstream

```bash
git merge upstream/main
```

If Panorama is in the middle of a migration lane and a merge is not the right
shape for that branch, use the repository's agreed non-interactive rebase flow
instead. Do not use interactive git flows.

### 5. Resolve conflicts by policy

When a conflict appears, choose one of these outcomes explicitly:

- keep upstream behavior
- keep Panorama behavior
- keep upstream structure and reapply Panorama behavior in a narrower seam

Prefer the third outcome whenever practical.

### 6. Verify before review

Run the checks that match the touched layers:

```bash
pnpm build
pnpm test
cargo run --manifest-path src-server/Cargo.toml
```

If the sync touches Tauri-specific code, also verify the desktop path with:

```bash
pnpm tauri dev
```

### 7. Review the diff by category

Before merging the sync branch, scan the diff and label each change mentally as:

- pure upstream
- Panorama carry-forward
- sync fix

If the branch contains unrelated feature work, split it out before merge.

## Panorama Customization Policy

Every lasting Panorama change should fit one of these categories:

- `UPSTREAM_CANDIDATE`
  - generic improvements worth proposing upstream
- `LOCAL_EXTENSION`
  - Panorama-only features isolated behind clear seams
- `LOCAL_FORK`
  - branding, market focus, or business choices that will remain local
- `DROP_OR_REPLACE`
  - old fork code that upstream now makes unnecessary

If a change cannot be classified, it should not merge yet.

## Migration Lane Order

Use this order when rebuilding Panorama on top of Wealthfolio v3:

1. Market data localization
2. Specialized assets and navigation
3. Addon platform and local addons
4. FX additions if still needed
5. Branding and website

This ordering keeps Panorama's core value first and delays high-noise
fork-specific polish until the platform baseline is stable.

## Worktree Rule

Run sync and migration work in an isolated worktree whenever possible. The
repository convention is `.worktrees/` once local `git` is usable again.

## Current Blocker

On this workstation, local `git` commands are blocked until the Xcode license
is accepted. Resolve that first with:

```bash
sudo xcodebuild -license
```

Then continue with the normal sync workflow.
