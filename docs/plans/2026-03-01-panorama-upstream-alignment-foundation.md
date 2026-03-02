# Panorama Upstream Alignment Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the migration foundation needed to move Panorama onto Wealthfolio v3 while keeping Panorama-specific functionality isolated and maintainable.

**Architecture:** Treat Wealthfolio v3 as the new structural baseline, then reintroduce Panorama behavior by migration lane instead of by replaying old commits. Keep the first execution phase focused on isolation, path mapping, inventory validation, and the first two high-value feature lanes: localized market data and specialized assets.

**Tech Stack:** Git worktrees, pnpm, Vite, React, Tauri, Rust, SQLite migrations, Markdown planning docs

---

### Task 1: Unblock local git and create the isolated workspace

**Files:**
- Modify: `.gitignore`
- Create: `.worktrees/`
- Modify: `docs/plans/2026-03-01-panorama-upstream-alignment-design.md`
- Modify: `docs/plans/2026-03-01-panorama-customization-inventory.md`
- Modify: `docs/plans/2026-03-01-panorama-upstream-alignment-foundation.md`

**Step 1: Accept the Xcode license so system git works**

Run: `sudo xcodebuild -license`
Expected: The license flow completes and `git status --short` no longer exits with code `69`.

**Step 2: Verify `.worktrees/` is ignored**

Run: `git check-ignore -q .worktrees`
Expected: Exit code `0`.

**Step 3: Create the migration worktree from upstream**

Run: `git worktree add .worktrees/upstream-v3-foundation -b codex/upstream-v3-foundation upstream/main`
Expected: A new worktree appears at `.worktrees/upstream-v3-foundation`.

**Step 4: Capture a clean baseline**

Run: `git status --short`
Expected: No unexpected tracked changes inside the new worktree.

**Step 5: Review and commit the strategy artifacts**

```bash
git add .gitignore docs/plans/2026-03-01-panorama-upstream-alignment-design.md docs/plans/2026-03-01-panorama-customization-inventory.md docs/plans/2026-03-01-panorama-upstream-alignment-foundation.md
git commit -m "docs: capture upstream alignment strategy"
```

### Task 2: Create the Panorama-to-v3 path map

**Files:**
- Modify: `docs/plans/2026-03-01-panorama-v3-path-map.md`
- Modify: `docs/plans/2026-03-01-panorama-customization-inventory.md`

**Step 1: Generate the local customization file list**

Run: `git diff --name-status $(git merge-base HEAD upstream/main)..HEAD`
Expected: A stable list of Panorama-only file changes.

**Step 2: Refine each migration lane to its exact upstream v3 destination**

Document exact source-to-target mappings in `docs/plans/2026-03-01-panorama-v3-path-map.md`.

Required sections:

- Market data and symbols
- Specialized assets
- Addon platform
- Branding and website

**Step 3: Mark each item with one disposition**

Allowed values:

- `UPSTREAM_CANDIDATE`
- `LOCAL_EXTENSION`
- `LOCAL_FORK`
- `DROP_OR_REPLACE`

**Step 4: Review for over-broad carry-forward**

Reject any item that exists only because the old Panorama layout diverged from upstream structure.

**Step 5: Commit the path map**

```bash
git add docs/plans/2026-03-01-panorama-v3-path-map.md docs/plans/2026-03-01-panorama-customization-inventory.md
git commit -m "docs: map panorama customizations to v3 targets"
```

### Task 3: Establish the upstream sync operating model in the repo

**Files:**
- Modify: `docs/UPSTREAM_SYNC.md`
- Modify: `README.md`

**Step 1: Write the sync workflow**

Document:

- branch names
- sync cadence
- allowed contents of a sync branch
- verification commands
- how to separate sync work from feature work

**Step 2: Add the first sync checklist**

Include exact commands:

```bash
git fetch upstream --prune
git checkout main
git checkout -b sync/upstream-YYYYMMDD
git merge upstream/main
pnpm build
pnpm test
```

**Step 3: Link the workflow from `README.md`**

Add a short maintainer-oriented section pointing to `docs/UPSTREAM_SYNC.md`.

**Step 4: Verify docs are internally consistent**

Run: `rg -n "UPSTREAM_SYNC|sync/upstream|codex/upstream-v3-foundation" README.md docs`
Expected: References match the documented workflow.

**Step 5: Commit the operating model**

```bash
git add README.md docs/UPSTREAM_SYNC.md
git commit -m "docs: add upstream sync operating model"
```

### Task 4: Forward-port market data localization onto the v3 baseline

**Files:**
- Modify: `docs/plans/2026-03-01-panorama-customization-inventory.md`
- Modify: `docs/plans/2026-03-01-panorama-v3-path-map.md`
- Port from current tree:
  - `src-core/src/market_data/market_data_constants.rs`
  - `src-core/src/market_data/providers/eastmoney_cn_provider.rs`
  - `src-core/src/market_data/providers/tiantian_fund_provider.rs`
  - `src-core/src/market_data/symbol_normalizer.rs`
  - `src-core/src/activities/activities_service.rs`
  - `src-core/src/assets/assets_service.rs`
  - `src/pages/settings/market-data/market-data-settings.tsx`

**Step 1: Write failing tests for Panorama symbol behavior in the v3 core**

Cover:

- `.SS` input normalizes to `.SH`
- `700.HK` normalizes to `0700.HK`
- `161039` can resolve to fund semantics when the input context is fund
- `.SH` and `.SZ` symbols infer the CN provider

**Step 2: Run the targeted test set**

Run the v3 core test command for the symbol-normalization module.
Expected: The new Panorama cases fail before implementation.

**Step 3: Port the smallest possible provider and normalization surface**

Implementation scope:

- provider IDs and seed data
- symbol normalization and provider inference
- registry wiring
- settings UI for keyless providers

Do not port unrelated Panorama UI or branding in this task.

**Step 4: Run focused verification**

Run:

- the v3 core test command for market-data and symbol normalization
- the frontend test command for market-data settings

Expected: Panorama symbol and provider cases pass without breaking existing v3 coverage.

**Step 5: Commit the market-data lane**

```bash
git add .
git commit -m "feat: port panorama market data localization to v3"
```

### Task 5: Forward-port Insurance and MPF as additive feature lanes

**Files:**
- Port from current tree:
  - `src/pages/insurance/insurance-dashboard.tsx`
  - `src/pages/insurance/policy-detail-view.tsx`
  - `src/pages/insurance/components/insurance-policy-editor-sheet.tsx`
  - `src/pages/mpf/mpf-dashboard.tsx`
  - `src/pages/mpf/components/mpf-asset-editor-sheet.tsx`
  - `src/pages/layouts/navigation/app-navigation.tsx`
  - `src/routes.tsx`
  - `src-core/src/assets/assets_model.rs`
  - `src-core/src/assets/assets_repository.rs`
  - `src-core/src/assets/assets_service.rs`
  - `src-core/src/settings/settings_model.rs`
  - `src-core/src/settings/settings_repository.rs`
  - `src-core/src/market_data/market_data_service.rs`

**Step 1: Write failing tests around specialized asset behavior**

Cover:

- Insurance assets are filtered and rendered separately from generic holdings
- MPF assets preserve subfund metadata
- Settings visibility flags control Insurance and MPF navigation
- MPF unit-price enrichment does not affect non-MPF assets

**Step 2: Run the focused tests to confirm failure**

Use:

- the v3 frontend test command for route and navigation behavior
- the v3 core test command for asset and market-data service behavior

Expected: New specialized-asset cases fail before implementation.

**Step 3: Port metadata handling before page chrome**

Implementation order:

- asset metadata model support
- repository and service behavior
- navigation visibility settings
- route wiring
- Insurance and MPF page components

**Step 4: Run end-to-end verification for this lane**

Run:

- `pnpm build`
- `pnpm test`
- the relevant Rust test command for asset and market-data services

Expected: The v3 baseline still builds, and Panorama specialized assets behave as intended.

**Step 5: Commit the specialized-assets lane**

```bash
git add .
git commit -m "feat: port panorama insurance and mpf flows to v3"
```

### Task 6: Reconcile addon and fork-only layers after the core migration

**Files:**
- Port or compare:
  - `src/addons/`
  - `src-core/src/addons/`
  - `packages/addon-sdk/`
  - `packages/addon-dev-tools/`
  - `addons/goal-progress-tracker/`
  - `addons/investment-fees-tracker/`
  - `addons/swingfolio-addon/`
- Reapply later:
  - `public/`
  - `website/`
  - `scripts/release.mjs`
  - `scripts/website-ship-personal-site.mjs`

**Step 1: Compare addon runtime contracts before porting addon code**

Expected output:

- a list of upstream v3 runtime contracts Panorama addons rely on
- a list of Panorama-specific SDK extensions still needed

**Step 2: Port one addon at a time**

Recommended order:

- `goal-progress-tracker`
- `investment-fees-tracker`
- `swingfolio-addon`

**Step 3: Keep branding and marketing changes out of addon reconciliation**

Do not mix:

- logo updates
- website changes
- release scripts

with SDK/runtime work.

**Step 4: Run the package-level verification commands**

Run the relevant workspace build and test commands for:

- frontend app
- addon SDK
- addon dev tools
- each migrated addon

**Step 5: Commit each addon or branding lane separately**

Example:

```bash
git commit -m "feat: reconcile panorama addon sdk with v3 runtime"
git commit -m "feat: port goal progress tracker addon to v3"
git commit -m "chore: reapply panorama branding assets"
```

### Task 7: Start recurring upstream syncs after the migration baseline is stable

**Files:**
- Modify: `docs/UPSTREAM_SYNC.md`
- Modify: `README.md`

**Step 1: Run the first dedicated sync branch after the migration lands**

Run:

```bash
git fetch upstream --prune
git checkout main
git checkout -b sync/upstream-YYYYMMDD
git merge upstream/main
```

**Step 2: Fix only sync-related breakage**

Allowed work:

- merge conflicts
- compile fixes
- tests broken by upstream changes

Disallowed work:

- unrelated feature work
- opportunistic refactors
- branding changes

**Step 3: Run full verification**

Run:

- `pnpm build`
- `pnpm test`
- `cargo run --manifest-path src-server/Cargo.toml`

Expected: The sync branch is green before review.

**Step 4: Merge the sync branch back to `main`**

Use the repository's normal non-interactive merge workflow.

**Step 5: Update the docs if the sync exposed a new rule**

Keep the operating model current so future syncs get easier instead of harder.
