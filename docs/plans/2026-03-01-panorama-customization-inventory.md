# Panorama Customization Inventory

Date: 2026-03-01
Scope: Panorama-only changes to classify before forward-porting onto Wealthfolio v3

## Purpose

This inventory separates Panorama changes into migration lanes so the fork can be rebuilt on top of Wealthfolio v3 without dragging the entire old tree forward blindly.

Classification values:

- `PORT_FIRST`: carry early because Panorama depends on it
- `PORT_LATER`: keep, but only after the v3 baseline is stable
- `EVALUATE`: compare against upstream v3 before deciding
- `LOCAL_ONLY`: keep as fork-only customization
- `DROP_IF_SUPERSEDED`: remove if v3 already covers the need

## Lane 1: Market Data Localization

Disposition: `PORT_FIRST`

Reason:

- This is the core Panorama differentiation.
- The symbol standard and provider routing affect asset creation, activity handling, and valuation.

Key files:

- `docs/PANORAMA_MARKET_DATA_SPEC.md`
- `src-core/migrations/2026-02-09-130001_add_panorama_market_data_providers/up.sql`
- `src-core/migrations/2026-02-09-130001_add_panorama_market_data_providers/down.sql`
- `src-core/src/market_data/market_data_constants.rs`
- `src-core/src/market_data/market_data_model.rs`
- `src-core/src/market_data/market_data_repository.rs`
- `src-core/src/market_data/market_data_service.rs`
- `src-core/src/market_data/market_data_traits.rs`
- `src-core/src/market_data/providers/provider_registry.rs`
- `src-core/src/market_data/providers/eastmoney_cn_provider.rs`
- `src-core/src/market_data/providers/tiantian_fund_provider.rs`
- `src-core/src/market_data/symbol_normalizer.rs`
- `src-core/src/activities/activities_service.rs`
- `src-core/src/assets/assets_service.rs`
- `src/pages/settings/market-data/market-data-settings.tsx`
- `src/pages/settings/market-data/market-data-import-page.tsx`

Migration notes:

- Forward-port behavior, not old file structure.
- Keep provider integration narrow.
- Preserve `CODE.MKT` normalization rules even if upstream v3 routes symbols differently internally.
- Primary v3 targets are:
  - `crates/market-data/src/provider/`
  - `crates/market-data/src/registry/provider_registry.rs`
  - `crates/market-data/src/resolver/`
  - `crates/core/src/quotes/`
  - `crates/storage-sqlite/src/market_data/`
  - `apps/frontend/src/pages/settings/market-data/`

## Lane 2: FX Provider Additions

Disposition: `EVALUATE`

Reason:

- Panorama added Open Exchange Rates support, but Wealthfolio v3 may already solve part of the same problem differently.

Key files:

- `src-core/migrations/2026-02-09-150001_add_open_exchange_rates_provider/up.sql`
- `src-core/migrations/2026-02-09-150001_add_open_exchange_rates_provider/down.sql`
- `src-core/src/fx/auto_exchange.rs`
- `src-core/src/fx/open_exchange_rates_client.rs`
- `src-server/src/api/shared.rs`
- `src-tauri/src/listeners.rs`

Migration notes:

- Keep only if it provides real coverage or reliability value after the v3 port.
- Avoid carrying duplicate FX plumbing if upstream v3 already has a stronger abstraction.

## Lane 3: Specialized Assets and Navigation

Disposition: `PORT_FIRST`

Reason:

- Insurance and MPF are Panorama's primary product-level differentiation.
- Some of the behavior already extends beyond UI into settings, valuation, and asset metadata.

Key files:

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
- `src-core/src/assets/assets_traits.rs`
- `src-core/src/settings/settings_model.rs`
- `src-core/src/settings/settings_repository.rs`
- `src-core/src/settings/settings_service.rs`
- `src-core/src/market_data/market_data_service.rs`

Migration notes:

- Separate UI pages from hidden data dependencies.
- MPF valuation behavior in `market_data_service.rs` must be reviewed carefully before porting.
- Prefer additive page and metadata support over deep branching in shared portfolio flows.
- Primary v3 targets are:
  - `apps/frontend/src/routes.tsx`
  - `apps/frontend/src/pages/layouts/navigation/app-navigation.tsx`
  - new `apps/frontend/src/pages/insurance/` files
  - new `apps/frontend/src/pages/mpf/` files
  - `crates/core/src/assets/`
  - `crates/core/src/settings/`
  - `crates/storage-sqlite/src/assets/`
  - `crates/storage-sqlite/src/settings/`

## Lane 4: Addon Platform and Local Addons

Disposition: `EVALUATE`

Reason:

- Both Panorama and upstream changed addon-related code.
- This area is likely to have overlapping but non-identical evolution.

Key files:

- `src/addons/addons-core.ts`
- `src/addons/addons-loader.ts`
- `src/addons/addons-runtime-context.ts`
- `src-core/src/addons/models.rs`
- `src-core/src/addons/service.rs`
- `src-core/src/addons/tests.rs`
- `src-server/src/api/addons.rs`
- `src-tauri/src/commands/addon.rs`
- `packages/addon-sdk/src/index.ts`
- `packages/addon-sdk/src/host-api.ts`
- `packages/addon-sdk/src/manifest.ts`
- `packages/addon-sdk/src/permissions.ts`
- `packages/addon-dev-tools/cli.js`
- `packages/addon-dev-tools/scaffold.js`
- `addons/goal-progress-tracker/`
- `addons/investment-fees-tracker/`
- `addons/swingfolio-addon/`

Migration notes:

- Reconcile SDK and runtime changes before porting individual addons.
- Do not assume all local addon code should move forward unchanged.
- Revalidate each addon against upstream v3 addon contracts.

## Lane 5: Branding, Marketing, and Distribution

Disposition: `LOCAL_ONLY`

Reason:

- These changes are intentionally fork-specific and do not need upstream parity.

Key files:

- `README.md`
- `README.zh-CN.md`
- `public/logo.svg`
- `public/logo.png`
- `public/logo-gold.png`
- `public/illustration.png`
- `public/splashscreen.png`
- `app-icon.png`
- `src-tauri/icons/`
- `src-tauri/gen/apple/`
- `website/`
- `scripts/release.mjs`
- `scripts/website-ship-personal-site.mjs`

Migration notes:

- Reapply only after the v3 app baseline is stable.
- Keep branding changes out of early migration conflict sets.

## Lane 6: Documentation and Research

Disposition: `LOCAL_ONLY`

Reason:

- These documents explain Panorama's scope and should remain, but they should not drive code migration directly.

Key files:

- `docs/PLAN.md`
- `docs/PANORAMA_MARKET_DATA_SPEC.md`
- `docs/RELEASE_SOP.md`
- `docs/_archive/`
- `imports/`

Migration notes:

- Keep the docs, but rewrite any file-path references once the v3 migration lands.
- Treat archived research as background, not as implementation truth.

## Lane 7: Potentially Superseded Panorama Surface Area

Disposition: `DROP_IF_SUPERSEDED`

Reason:

- Wealthfolio v3 added platform features Panorama should inherit instead of recreating on the old base.

Upstream-aligned areas to prefer from v3:

- Auth and connect flows
- AI assistant and related settings
- Health, taxonomy, and richer settings surfaces
- Current frontend package/workspace structure

Migration notes:

- If Panorama has old equivalents, prefer adopting the upstream v3 implementation and re-layering Panorama-specific behavior only where needed.

## Execution Order

1. Lane 1: Market Data Localization
2. Lane 3: Specialized Assets and Navigation
3. Lane 4: Addon Platform and Local Addons
4. Lane 2: FX Provider Additions
5. Lane 5: Branding, Marketing, and Distribution
6. Lane 6: Documentation and Research

## Known Blocker

Local `git` operations are currently blocked on this workstation because the Xcode license has not yet been accepted. Until that is fixed, branch creation, worktree setup, and commit-based execution cannot proceed.
