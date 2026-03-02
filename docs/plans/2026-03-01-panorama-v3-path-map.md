# Panorama to Wealthfolio v3 Path Map

Date: 2026-03-01
Status: Refined with verified v3 worktree paths on 2026-03-02

## Purpose

This document maps Panorama's current repository areas to the expected
Wealthfolio v3 destinations. It started as a lane-based draft and was refined
after creating the dedicated v3 worktree from `upstream/main`.

Verified in worktree:

- `git worktree` created successfully at `.worktrees/upstream-v3-foundation`
- frontend tests passed after fixing one upstream baseline auth/localStorage issue
- `pnpm build:types` and `pnpm build` succeeded in the v3 worktree

## Upstream v3 Structural Baseline

Observed upstream top-level areas on 2026-03-01:

- `apps/`
- `crates/`
- `packages/`
- `addons/`
- `assets/brand/`
- `docs/`
- `e2e/`
- `scripts/`

Panorama's current structure still centers on:

- `src/`
- `src-core/`
- `src-server/`
- `src-tauri/`
- `packages/`
- `addons/`
- `website/`

## Lane Mapping

### 1. Frontend application

Current Panorama sources:

- `src/App.tsx`
- `src/routes.tsx`
- `src/pages/`
- `src/components/`
- `src/commands/`
- `src/adapters/`
- `src/context/`
- `src/hooks/`
- `src/lib/`
- `src/assets/`

Expected v3 target area:

- `apps/frontend/src/`

Notes:

- Panorama page routes, settings, and navigation should be reintroduced on top
  of the v3 frontend app rather than by restoring the legacy root `src/`
  layout.

Verified file mappings:

- `src/App.tsx` -> `apps/frontend/src/App.tsx`
- `src/routes.tsx` -> `apps/frontend/src/routes.tsx`
- `src/pages/layouts/navigation/app-navigation.tsx` ->
  `apps/frontend/src/pages/layouts/navigation/app-navigation.tsx`
- `src/pages/settings/market-data/market-data-settings.tsx` ->
  `apps/frontend/src/pages/settings/market-data/market-data-settings.tsx`
- `src/pages/settings/market-data/market-data-import-page.tsx` ->
  `apps/frontend/src/pages/settings/market-data/market-data-import-page.tsx`
- `src/addons/addons-runtime-context.ts` ->
  `apps/frontend/src/addons/addons-runtime-context.ts`

### 2. Shared Rust core and business logic

Current Panorama sources:

- `src-core/src/market_data/`
- `src-core/src/fx/`
- `src-core/src/assets/`
- `src-core/src/activities/`
- `src-core/src/settings/`
- `src-core/src/addons/`
- `src-core/migrations/`

Expected v3 target area:

- `crates/` for shared application logic and data layers

Notes:

- The v3 split is now confirmed:
  - market data provider logic and resolver flow live in `crates/market-data`
  - domain services live in `crates/core`
  - SQLite persistence and migrations live in `crates/storage-sqlite`
- Prefer porting focused behavior into existing v3 modules over recreating the
  old Panorama crate layout.

Verified file mappings:

- `src-core/src/market_data/market_data_model.rs` ->
  `crates/storage-sqlite/src/market_data/model.rs`
- `src-core/src/market_data/market_data_repository.rs` ->
  `crates/storage-sqlite/src/market_data/repository.rs`
- `src-core/src/market_data/providers/provider_registry.rs` ->
  `crates/market-data/src/registry/provider_registry.rs`
- `src-core/src/market_data/symbol_normalizer.rs` ->
  `crates/market-data/src/resolver/rules_resolver.rs`,
  `crates/market-data/src/resolver/exchange_suffixes.rs`, and
  `crates/market-data/src/resolver/chain.rs`
- `src-core/src/market_data/providers/eastmoney_cn_provider.rs` ->
  create `crates/market-data/src/provider/eastmoney_cn/mod.rs`
- `src-core/src/market_data/providers/tiantian_fund_provider.rs` ->
  create `crates/market-data/src/provider/tiantian_fund/mod.rs`
- `src-core/src/market_data/market_data_constants.rs` ->
  `crates/core/src/quotes/model.rs` and provider ID usage in
  `crates/market-data/src/provider/*`
- `src-core/src/market_data/market_data_service.rs` ->
  `crates/core/src/quotes/service.rs`,
  `crates/core/src/activities/activities_service.rs`, and
  `crates/core/src/assets/alternative_assets_service.rs`
- `src-core/src/assets/assets_model.rs` ->
  `crates/core/src/assets/assets_model.rs` and
  `crates/storage-sqlite/src/assets/model.rs`
- `src-core/src/assets/assets_repository.rs` ->
  `crates/storage-sqlite/src/assets/repository.rs`
- `src-core/src/assets/assets_service.rs` ->
  `crates/core/src/assets/assets_service.rs`
- `src-core/src/settings/settings_model.rs` ->
  `crates/core/src/settings/settings_model.rs`
- `src-core/src/settings/settings_repository.rs` ->
  `crates/storage-sqlite/src/settings/repository.rs`
- `src-core/src/settings/settings_service.rs` ->
  `crates/core/src/settings/settings_service.rs`
- `src-core/src/activities/activities_service.rs` ->
  `crates/core/src/activities/activities_service.rs`
- `src-core/migrations/` ->
  `crates/storage-sqlite/migrations/`

### 3. Web server layer

Current Panorama sources:

- `src-server/src/`
- `src-server/tests/`

Expected v3 target area:

- `crates/` for shared server-side logic
- any v3 server-facing integration points already used by `apps/frontend`

Notes:

- Confirm whether the v3 server remains a dedicated crate or is now integrated
  differently.
- Panorama server-only fixes should be re-layered only if the v3 baseline still
  uses the same responsibilities.

### 4. Tauri desktop layer

Current Panorama sources:

- `src-tauri/src/`
- `src-tauri/icons/`
- `src-tauri/capabilities/`
- `src-tauri/gen/`

Expected v3 target area:

- the v3 desktop application area rooted from the workspace Cargo/Tauri
  manifests

Notes:

- Keep app identity, icons, and packaging metadata separate from earlier
  migration lanes.
- Reapply fork branding only after the v3 desktop baseline is compiling.

### 5. Frontend and SDK packages

Current Panorama sources:

- `packages/ui/`
- `packages/addon-sdk/`
- `packages/addon-dev-tools/`

Expected v3 target area:

- `packages/ui/`
- `packages/addon-sdk/`
- `packages/addon-dev-tools/`

Notes:

- Package names and locations appear structurally compatible at the top level.
- The main task here is API reconciliation, not path relocation.

### 6. Addons

Current Panorama sources:

- `addons/goal-progress-tracker/`
- `addons/investment-fees-tracker/`
- `addons/swingfolio-addon/`

Expected v3 target area:

- `addons/`

Notes:

- Keep addon migration separate from addon runtime migration.
- First align addon host contracts, then port addon implementations one by one.

### 7. Branding and assets

Current Panorama sources:

- `public/`
- `app-icon.png`
- `src-tauri/icons/`
- `src-tauri/gen/apple/`

Expected v3 target area:

- `assets/brand/`
- app-level public and packaging asset locations used by v3

Notes:

- Upstream v3 now has a dedicated `assets/brand/` area.
- Panorama branding should be reapplied after functional migration, not during
  the first platform merge.

### 8. Website and distribution scripts

Current Panorama sources:

- `website/`
- `scripts/release.mjs`
- `scripts/website-ship-personal-site.mjs`

Expected v3 target area:

- `scripts/`
- any v3 website or marketing asset conventions

Notes:

- Treat this as a fork-only lane.
- Keep it out of the initial v3 functional migration unless a missing script
  blocks releases.

## Lane-Specific Port Map

### Lane 1: Market data localization

- `src-core/src/market_data/providers/eastmoney_cn_provider.rs` ->
  create `crates/market-data/src/provider/eastmoney_cn/mod.rs`
- `src-core/src/market_data/providers/tiantian_fund_provider.rs` ->
  create `crates/market-data/src/provider/tiantian_fund/mod.rs`
- `src-core/src/market_data/providers/provider_registry.rs` ->
  `crates/market-data/src/registry/provider_registry.rs`
- `src-core/src/market_data/symbol_normalizer.rs` ->
  `crates/market-data/src/resolver/rules_resolver.rs`,
  `crates/market-data/src/resolver/exchange_suffixes.rs`, and
  `crates/market-data/src/resolver/chain.rs`
- `src-core/src/market_data/market_data_constants.rs` ->
  `crates/core/src/quotes/model.rs`
- `src-core/src/market_data/market_data_model.rs` ->
  `crates/storage-sqlite/src/market_data/model.rs`
- `src-core/src/market_data/market_data_repository.rs` ->
  `crates/storage-sqlite/src/market_data/repository.rs`
- `src-core/migrations/2026-02-09-130001_add_panorama_market_data_providers/*` ->
  new migration under `crates/storage-sqlite/migrations/`
- `src/pages/settings/market-data/market-data-settings.tsx` ->
  `apps/frontend/src/pages/settings/market-data/market-data-settings.tsx`
- `src/pages/settings/market-data/market-data-import-page.tsx` ->
  `apps/frontend/src/pages/settings/market-data/market-data-import-page.tsx`

### Lane 3: Insurance and MPF

- `src/pages/insurance/insurance-dashboard.tsx` ->
  create `apps/frontend/src/pages/insurance/insurance-dashboard.tsx`
- `src/pages/insurance/policy-detail-view.tsx` ->
  create `apps/frontend/src/pages/insurance/policy-detail-view.tsx`
- `src/pages/insurance/components/insurance-policy-editor-sheet.tsx` ->
  create `apps/frontend/src/pages/insurance/components/insurance-policy-editor-sheet.tsx`
- `src/pages/mpf/mpf-dashboard.tsx` ->
  create `apps/frontend/src/pages/mpf/mpf-dashboard.tsx`
- `src/pages/mpf/components/mpf-asset-editor-sheet.tsx` ->
  create `apps/frontend/src/pages/mpf/components/mpf-asset-editor-sheet.tsx`
- `src/routes.tsx` ->
  `apps/frontend/src/routes.tsx`
- `src/pages/layouts/navigation/app-navigation.tsx` ->
  `apps/frontend/src/pages/layouts/navigation/app-navigation.tsx`
- `src-core/src/assets/assets_model.rs` ->
  `crates/core/src/assets/assets_model.rs` and
  `crates/storage-sqlite/src/assets/model.rs`
- `src-core/src/assets/assets_repository.rs` ->
  `crates/storage-sqlite/src/assets/repository.rs`
- `src-core/src/assets/assets_service.rs` ->
  `crates/core/src/assets/assets_service.rs`
- `src-core/src/settings/settings_model.rs` ->
  `crates/core/src/settings/settings_model.rs`
- `src-core/src/settings/settings_repository.rs` ->
  `crates/storage-sqlite/src/settings/repository.rs`
- `src-core/src/settings/settings_service.rs` ->
  `crates/core/src/settings/settings_service.rs`
- MPF-specific valuation behavior currently embedded in
  `src-core/src/market_data/market_data_service.rs` ->
  likely `crates/core/src/quotes/service.rs` plus
  `crates/core/src/assets/alternative_assets_service.rs`

## Required Follow-Up

1. Cross-link each mapped file to its disposition in
   `docs/plans/2026-03-01-panorama-customization-inventory.md`.
2. Start the Lane 1 port inside `.worktrees/upstream-v3-foundation`.
3. Keep the upstream auth/localStorage baseline fix as a separate, reviewable
   change from Panorama feature forward-porting.
