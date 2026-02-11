# Panorama Implementation Status (Updated 2026-02-11)

## 1. Overview
Panorama extends Wealthfolio with localized data (A-shares, CN Funds) and specialized asset classes (Insurance, MPF), while reusing the robust Rust core for market data and FX.

Authoritative spec for market data: `PANORAMA_MARKET_DATA_SPEC.md`.

## 2. Implementation Status

### Phase 1: Localized Market Data ✅ COMPLETED

| Provider | Status | Location |
|----------|--------|----------|
| **EASTMONEY_CN** | ✅ Implemented | `src-core/src/market_data/providers/eastmoney_cn_provider.rs` |
| **TIANTIAN_FUND** | ✅ Implemented | `src-core/src/market_data/providers/tiantian_fund_provider.rs` |

**Features:**
- No API key required for both providers
- Symbol format: `600001.SH` / `000001.SZ` (A-shares), `161039.FUND` (funds)
- DB migration with provider seed data

### Phase 2: Specialized Asset UI ✅ COMPLETED

| Module | Status | Location |
|--------|--------|----------|
| **Insurance** | ✅ Implemented | `src/pages/insurance/` |
| **MPF** | ✅ Implemented | `src/pages/mpf/` |

**Features:**
- Dedicated Insurance Dashboard and Policy Detail View
- MPF Dashboard with fund allocation visualization
- Policy editor sheets for both asset types
- Extended `attributes` JSON field for specialized metadata

### Phase 3: UX Refinement ✅ COMPLETED

- ✅ New providers appear in Market Data Settings
- ✅ Insurance and MPF navigation items added

---

## 3. Future Considerations

### Potential Enhancements
- [ ] **Family View**: Toggle for "Self" / "Spouse" / "Combined" asset views
- [ ] **Owner Filtering**: Implement owner-based filtering in repositories
- [ ] **Additional Data Sources**: More regional market data providers

---

## 4. Design Principles

1. **Low Risk**: Reuses the stable, tested Wealthfolio core
2. **Maintainable**: Follows existing architectural patterns (traits, providers, registry)
3. **Clean Data**: Uses flexible JSON attributes for non-standard assets (no schema bloat)
4. **Privacy**: Maintains the local-first, zero-cloud philosophy

---
*Last updated: 2026-02-11*
