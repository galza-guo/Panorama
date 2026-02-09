# Panorama Implementation Plan (Updated 2026-02-09)

## 1. Overview
Panorama is an extension of Wealthfolio focused on localized data (A-shares, CN Funds) and specialized asset classes (Insurance, MPF). We will reuse the existing robust Rust core for market data and FX.

Authoritative spec for Phase 1 market data: `PANORAMA_MARKET_DATA_SPEC.md`.

## 2. Updated Implementation Approach

### Phase 1: Localized Market Data (The "Delta" Providers)
Instead of building a new price service, we will extend the `ProviderRegistry` with two new Rust providers:
- **`EASTMONEY_CN`**:
  - Source: EastMoney public endpoints.
  - Requirement: No API key needed.
  - Integration: Implement `MarketDataProvider` trait in `src-core/src/market_data/providers/`.
- **`TIANTIAN_FUND`**:
  - Source: Tiantian (1234567) + EastMoney fund API.
  - Requirement: No API key needed.
  - Integration: Implement `MarketDataProvider` trait.

### Phase 2: Specialized Asset UI (Insurance & MPF)
We will create dedicated UI modules for Insurance and MPF assets, using the existing `assets` table to maintain simplicity.
- **Data Model Strategy**:
  - Reuse the `assets` table.
  - Store specialized metadata (policy number, guaranteed value, trustee) in the `attributes` (JSON) field.
  - Add an `owner` field/attribute (Self/Spouse).
- **UI Components**:
  - `src/pages/insurance/`: Dedicated list and detail views.
  - `src/pages/mpf/`: Specialized view for MPF fund allocation.

### Phase 3: UX Refinement
- **API Settings**: Ensure new providers appear in `MarketDataSettingsPage`.
- **Family View**: Add a toggle or filter to view "Self", "Spouse", or "Combined" assets in the Dashboard.

---

## 3. Detailed Task List

### P0: Core Data Providers
- [ ] **EastMoney CN Provider** (`EASTMONEY_CN`, keyless):
  - [ ] Implement `src-core/src/market_data/providers/eastmoney_cn_provider.rs`.
  - [ ] Register in `provider_registry.rs`.
  - [ ] Verify symbol format (Panorama PSS): `600001.SH` / `000001.SZ`.
- [ ] **Tiantian Fund Provider** (`TIANTIAN_FUND`, keyless):
  - [ ] Implement `src-core/src/market_data/providers/tiantian_fund_provider.rs`.
  - [ ] Register in `provider_registry.rs`.
  - [ ] Verify symbol format (Panorama PSS): `161039.FUND` (and accept `161039` when explicitly chosen as FUND in UI).

### P1: Insurance & MPF Modules
- [ ] **Asset Extension**:
  - [ ] Update `Asset` type definitions to include `owner`.
  - [ ] Define standard keys for `attributes` (e.g., `policy_type`, `guaranteed_value`).
- [ ] **Insurance UI**:
  - [ ] Create `InsuranceDashboard`.
  - [ ] Create `PolicyDetailView`.
- [ ] **MPF UI**:
  - [ ] Create `MpfDashboard`.
  - [ ] Implement visualization for MPF fund allocation.

### P2: Family Dashboard
- [ ] **Owner Filtering**:
  - [ ] Implement owner-based filtering in `AssetRepository`.
  - [ ] Add "Owner" selector in Dashboard UI.

---

## 4. Why this approach?
1.  **Low Risk**: Reuses the stable, tested Wealthfolio core.
2.  **Maintainable**: Follows the existing architectural patterns (traits, providers, registry).
3.  **Clean Data**: No massive SQL migrations; uses flexible JSON attributes for non-standard assets.
4.  **Privacy**: Maintains the local-first, zero-cloud philosophy.

---
*Plan created by Panorama Architect - 2026-02-09*
