# Panorama v3 Merge Plan

## Status

- Branch: `codex/upstream-v3-foundation`
- Prepared on: `2026-03-03`
- Upstream base: `upstream/main`
- Divergence vs `upstream/main`: `ahead 8`, `behind 0`
- Divergence vs current `origin/main`: `HEAD unique 420`, `origin/main unique 30`

## Why This Should Not Merge Directly Into Current `main`

The current repository `main` is still on the pre-v3 layout:

- `src/`
- `src-core/`
- `src-server/`
- `src-tauri/`
- `website/`

This branch is on the v3 layout:

- `apps/`
- `crates/`
- `packages/`

Because the branch is effectively a new application baseline rather than an
incremental feature branch, a direct PR into the current `main` would create a
huge review surface and a poor rollback story.

## What This Branch Contains

Ordered by commit:

1. `c19f8765` `fix: stabilize auth token access in tests`
2. `a115fb3b` `feat: port panorama market data localization to v3`
3. `9baa26fc` `feat: add panorama insurance workflow to v3`
4. `727feb1f` `feat: add panorama mpf workflow to v3`
5. `aa90edd7` `feat: finish panorama specialized asset integration`
6. `1330d48d` `chore: align panorama branding in v3 surfaces`
7. `82488f6d` `docs: align panorama release-facing assets`
8. `e5d1dca1` `docs: add panorama v3 merge plan`

## Recommended Cutover Strategy

### 1. Create a new long-lived integration branch on origin

Recommended branch name:

- `panorama-v3`

Create it from `upstream/main`, not from the current `main`.

### 2. Open the review PR against `panorama-v3`

Recommended PR source and target:

- source: `codex/upstream-v3-foundation`
- target: `panorama-v3`

Do not target the current `main`.

This keeps the review focused on the Panorama-specific commits instead of the
entire legacy pre-v3 codebase.

### 3. Preserve commit history

Preferred merge mode:

- fast-forward if possible
- otherwise regular merge commit

Avoid squash merging. The eight commits are already grouped by migration lane
and are useful for future upstream sync archaeology.

### 4. Freeze the old application line before cutover

Before switching the default branch, preserve the old line under an explicit
legacy branch name, for example:

- `legacy-pre-v3`
- `legacy-panorama-v2`

### 5. Switch the default branch after acceptance

Recommended sequence:

1. Merge into `panorama-v3`
2. Run final acceptance checks
3. Change the default branch on GitHub to `panorama-v3`
4. Optionally rename branches later if you want `main` back as the default name

This avoids destructive history rewriting on the current `main`.

## Review Checklist

### Automated verification

Run these on the branch before cutover:

- `cargo test -p wealthfolio-market-data --lib`
- `cargo test -p wealthfolio-core panorama`
- `cargo check -p wealthfolio-server`
- `cargo check -p wealthfolio-app`
- `pnpm --filter frontend test -- --run`
- `pnpm build:types`
- `pnpm build`

### Manual smoke checklist

- Search `600519` and confirm CN symbol discovery works
- Search `161039` and confirm CN fund discovery works
- Create and edit an Insurance asset
- Create and edit an MPF asset
- Trigger portfolio update and confirm MPF enrichment runs
- Confirm About / updater / release links point to Panorama assets
- Confirm FX conversion still updates automatically through the existing v3 flow

## Merge Readiness Assessment

### Completed in this migration line

- Wealthfolio v3 baseline adoption
- CN market data localization
- Insurance workflow
- MPF workflow
- MPF unit-price enrichment
- Panorama branding in app surfaces
- Panorama release-facing docs and metadata

### Intentionally not migrated

- Open Exchange Rates-specific FX lane
- Renaming `@wealthfolio/*` package names
- Renaming compatibility fields such as `minWealthfolioVersion`
- Renaming `Wealthfolio Connect` service identifiers and service-owned links

## Remaining Work After Cutover

### Required operational work

- Create `panorama-v3` on origin
- Push the branch and open the PR
- Run final manual smoke testing against real local data
- Switch the default branch

### Optional follow-up work

- Evaluate whether Yahoo-based automatic FX is sufficient long term
- Add an Open Exchange Rates lane only if Yahoo FX proves unreliable
- Decide whether addon package publishing should stay `@wealthfolio/*` or gain a
  separate Panorama distribution story
- Migrate or retire the legacy `website/` source tree if that site is still
  maintained outside the v3 application repo

## Bottom Line

For the `PORT_FIRST` scope, this branch is the new Panorama baseline. Treat it
as a controlled branch cutover, not as a normal feature merge back into the old
`main`.
