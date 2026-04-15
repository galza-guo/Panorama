# Panorama Patch Inventory

This file is the source of truth for fork-only patches that must survive future
upstream updates.

## How to use

1. Add one row per fork patch (or tightly related patch set).
2. Keep scope and verification command concrete.
3. Update status when a patch is upstreamed, removed, or replaced.

## Status values

- `ACTIVE`: must be re-applied/kept on every upstream sync
- `UPSTREAMED`: now available upstream, can be removed locally after verification
- `LOCAL_ONLY`: intentionally fork-specific, do not upstream
- `DEPRECATED`: no longer needed, removal pending

## Patch lanes

- `CN_MARKET_DATA`
- `SPECIALIZED_ASSETS`
- `BRANDING_RELEASE`
- `COMPATIBILITY`
- `OTHER`

## Inventory

| Patch ID | Status | Lane | What it does | Key files | Verify |
| --- | --- | --- | --- | --- | --- |
| P-001 | ACTIVE | CN_MARKET_DATA | CN provider routing and symbol normalization for `.SH/.SZ/.FUND` | `crates/market-data/src/resolver/rules_resolver.rs`, `crates/market-data/src/provider/eastmoney_cn/mod.rs`, `crates/market-data/src/provider/tiantian_fund/mod.rs` | `cargo test -p wealthfolio-market-data --lib` |
| P-002 | ACTIVE | SPECIALIZED_ASSETS | Insurance dashboard/editor workflow | `apps/frontend/src/pages/insurance/insurance-dashboard.tsx`, `apps/frontend/src/pages/insurance/components/insurance-policy-editor-sheet.tsx` | `pnpm --filter frontend test -- --run` |
| P-003 | ACTIVE | SPECIALIZED_ASSETS | MPF dashboard/editor workflow and enrichment hooks | `apps/frontend/src/pages/mpf/mpf-dashboard.tsx`, `apps/frontend/src/pages/mpf/components/mpf-asset-editor-sheet.tsx`, `crates/core/src/assets/alternative_assets_service.rs` | `cargo test -p wealthfolio-core panorama` |
| P-004 | ACTIVE | COMPATIBILITY | Legacy asset compatibility for instrument mapping and health staleness false-positive fixes | `crates/core/src/assets/assets_model.rs`, `crates/core/src/health/checks/price_staleness.rs`, `crates/core/src/health/service.rs` | `cargo test -p wealthfolio-core test_to_instrument_id_ -- --nocapture`, `cargo test -p wealthfolio-core health -- --nocapture` |
| P-005 | LOCAL_ONLY | BRANDING_RELEASE | Panorama release endpoints/branding while keeping technical compatibility identifiers | `apps/tauri/tauri.conf.json`, `apps/server/src/api/settings.rs`, `TRADEMARKS.md` | `pnpm build:types`, `pnpm build` |
| P-006 | LOCAL_ONLY | OTHER | Panorama AI provider catalog and picker UX: keep added providers such as DeepSeek, keep enabled API providers visible before keys are configured, and keep the explicit “Add models...” empty-favorites CTA instead of silently falling back to all catalog models | `crates/ai/src/ai_providers.json`, `apps/frontend/src/features/ai-assistant/hooks/use-chat-model.ts`, `apps/frontend/src/features/ai-assistant/hooks/use-provider-picker.ts`, `apps/frontend/src/features/ai-assistant/components/model-picker.tsx` | `cargo test -p wealthfolio-ai provider_service::tests -- --nocapture`, `pnpm --filter frontend test -- --run` |

## Change log

| Date | Change | Notes |
| --- | --- | --- |
| 2026-03-05 | Initial inventory created | Seeded from v3 migration branch and post-cutover fixes |
| 2026-04-15 | Selective `v3.2.1` sync checkpoint | No new fork-only lanes were introduced while absorbing upstream Connect/device-sync runtime behavior; existing Panorama patches remain the required conflict-resolution source of truth |
| 2026-04-15 | Device-sync snapshot follow-up | Waiting-state and snapshot-upload hardening were absorbed from upstream without changing any documented Panorama-only patch lanes |
| 2026-04-15 | Device-sync freshness gate follow-up | Claimer-side snapshot freshness protection was restored in session memory only; no new fork-only lane or schema divergence was introduced |
| 2026-04-16 | AI provider/runtime follow-up | Documented Panorama-specific AI provider catalog/picker behavior as a protected local lane while restoring upstream merged-provider support for saved non-catalog runtime models |
