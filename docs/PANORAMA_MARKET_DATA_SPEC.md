# Panorama Market Data Spec

Date: 2026-02-09
Status: Planning (authoritative spec for Phase 1)

This document defines:
- Symbol conventions Panorama will accept and store
- Market data providers (free-first) and fallback order
- Provider configuration + secure storage for API keys
- Rate limiting / caching rules to keep the app reliable

## Goals
- All-in-one coverage for: CN A-shares, CN funds (OTC NAV), HK stocks/ETFs, US stocks/ETFs, FX.
- Update-on-open is enough (no background realtime required).
- Free-first: default paths require no paid subscription; optional BYO-key providers are allowed.
- Preserve Wealthfolio architecture: reuse Market Data / FX / Settings / SecretStore.

## Non-Goals (Phase 1)
- Broker account sync (Futu/Tiger/etc). CSV import stays.
- Perfect global symbol unification across all vendors.

---

## 1) Symbol Standard (Panorama Symbol Standard, PSS)

Panorama accepts and stores symbols as `CODE.MKT` where possible, to make market explicit.

### 1.1 Canonical forms (user-facing)

- CN A-shares:
  - `600001.SH` (Shanghai)
  - `000001.SZ` (Shenzhen)

- HK stocks/ETFs:
  - `0700.HK` (Tencent)
  - `0001.HK` (CK Hutchison)
  - `9988.HK` (Alibaba)
  - Input variants like `00700.HK`, `00001.HK`, `09988.HK` SHOULD be accepted and normalized.

- US stocks/ETFs:
  - `AAPL.US` (preferred user-facing)
  - `AAPL` MUST also be accepted (treated as US by default)

- CN funds (OTC):
  - `161039.FUND` (preferred user-facing)
  - `161039` MUST also be accepted (treated as FUND when explicitly chosen in UI)

### 1.2 Normalization rules

These are applied at input boundaries (asset creation, CSV mapping, etc). Storage is designed to remain provider-compatible.

- **US**
  - If input ends with `.US`, strip it for provider calls that require bare tickers.

- **HK**
  - Accept 1-5 digit codes.
  - Normalize numeric part by stripping leading zeros then formatting:
    - If numeric < 10000: format as 4 digits (e.g., `700` -> `0700`)
    - Else: keep as 5 digits
  - Keep suffix `.HK`.

- **CN A-shares**
  - Enforce 6 digits + `.SH` or `.SZ`.

- **FUND**
  - Enforce 6 digits.
  - Preferred stored form includes `.FUND` to avoid collisions with stock tickers.

### 1.3 Provider mapping table

Panorama will map PSS symbols to provider-native symbols as needed.

| Market | PSS (Panorama) | Yahoo Finance | Alpha Vantage | EastMoney | Tiantian |
|---|---|---|---|---|---|
| US | `AAPL.US` | `AAPL` | `AAPL` | n/a | n/a |
| SH | `600000.SH` | `600000.SS` | `600000.SHH` | `secid=1.600000` | n/a |
| SZ | `000001.SZ` | `000001.SZ` | `000001.SHZ` | `secid=0.000001` | n/a |
| HK | `0700.HK` | `0700.HK` | `0700.HKG` | n/a | n/a |
| FUND | `161039.FUND` | n/a | n/a | (optional) | `161039` |

Note: Wealthfolio already uses Yahoo symbols in multiple places (e.g., `000001.SS` exists in `src/components/benchmark-symbol-selector.tsx`).

---

## 2) Provider Strategy (Free-first)

Wealthfolio uses a global provider priority list (not per-asset). Each provider MUST:
- Fail fast without network calls for symbols it does not support.
- In bulk fetch, return unsupported symbols in the `failed` list so the next provider can try.

### 2.1 Default provider order (recommended)

Priority is lower number = higher priority.

1. `TIANTIAN_FUND` (CN funds; keyless)
2. `EASTMONEY_CN` (CN A-shares; keyless)
3. `YAHOO` (global default; keyless)
4. `ALPHA_VANTAGE` (optional BYO key)
5. Existing optional providers (MarketData.app, MetalPriceAPI)

Rationale:
- Prevent Yahoo from being called for `.SH/.SZ/.FUND` symbols.
- Keep global US/HK coverage intact.

---

## 3) Providers to Add (Panorama delta)

### 3.1 `EASTMONEY_CN` (A-shares, keyless)

Scope: CN A-shares latest + daily historical quotes.

Endpoints (public, unofficial):
- Latest quote:
  - `https://push2.eastmoney.com/api/qt/stock/get?secid={m}.{code}&fields=...`
- Daily history (kline):
  - `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={m}.{code}&klt=101&fqt=1&beg=YYYYMMDD&end=YYYYMMDD&fields1=...&fields2=...`

Headers:
- `User-Agent`: browser UA recommended
- `Referer`: generally safe to include `https://quote.eastmoney.com/`

Symbol support:
- Accept only `\d{6}\.SH` and `\d{6}\.SZ`.
- Map `.SH` -> `m=1`, `.SZ` -> `m=0`.

Failure behavior:
- If symbol not applicable: return no quotes + mark as failed (bulk) without network.

### 3.2 `TIANTIAN_FUND` (CN fund NAV, keyless)

Scope: CN OTC fund latest estimate + historical NAV.

Endpoints:
- Latest estimate (JS callback):
  - `https://fundgz.1234567.com.cn/js/{code}.js`
- Historical NAV (JSON):
  - `https://api.fund.eastmoney.com/f10/lsjz?fundCode={code}&pageIndex=1&pageSize=...`

Headers:
- `User-Agent`: browser UA recommended
- `Referer`: required for `api.fund.eastmoney.com` (use `https://fundf10.eastmoney.com/`)

Symbol support:
- Prefer `\d{6}\.FUND`.
- Also accept `\d{6}` when the UI explicitly chooses FUND.

Quote semantics:
- Latest: use `gsz` (estimated NAV) for intraday value; store timestamp from `gztime`.
- Official: use `dwjz` / `jzrq` as end-of-day NAV.

Failure behavior:
- If symbol not applicable: fail fast without network.

### 3.3 Optional keyless fallback providers

- `SINA_CN` (A-shares) as fallback if EastMoney blocks.
- `EASTMONEY_FUND` as fallback for fund history if Tiantian endpoint is blocked.

---

## 4) Configuration & Secure Storage

### 4.1 Provider enable/priority
- Reuse existing Market Data settings page:
  - `src/pages/settings/market-data/market-data-settings.tsx`
- Providers are stored in SQLite table `market_data_providers`.

### 4.2 API keys (BYO key)
- Reuse existing SecretStore:
  - Trait: `src-core/src/secrets/mod.rs`
  - Frontend commands: `src/commands/secrets.ts`
  - Desktop storage: system keychain via Tauri

### 4.3 Keyless providers
- Keyless providers MUST NOT show "API Key" input.
- Current UI logic hard-codes `needsApiKey` as providerId != YAHOO/MANUAL; Panorama must extend this list to include `EASTMONEY_CN` and `TIANTIAN_FUND` (and any other keyless providers).

### 4.4 Optional non-secret config
If we later need per-provider knobs (proxy URL, pacing), store in `app_settings` (non-secret). Secrets (cookies/tokens) go to SecretStore.

---

## 5) Rate Limiting, Caching, Reliability

### 5.1 General rules
- Never refetch history unnecessarily: rely on Wealthfolio incremental sync (latest quote date -> fetch from next day).
- Use bulk fetch APIs where possible, but cap concurrency.

### 5.2 Recommended pacing (Phase 1 defaults)
- Yahoo: keep existing batch size (currently 2) and accept 429 as a provider failure to fall back.
- EastMoney CN: bulk chunk size <= 5, with short jittered delay between chunks.
- Tiantian fund:
  - Latest: cache >= 60s
  - Historical NAV: cache permanently for past dates

### 5.3 Failure + fallback
- Providers should distinguish:
  - Unsupported symbol (fast-fail, no network)
  - Network/provider errors (mark as failed so next provider can try)

---

## 6) Implementation Checklist (Phase 1)

1) Add new provider IDs and seed rows in `market_data_providers`.
2) Implement `EASTMONEY_CN` provider (latest + daily history + bulk).
3) Implement `TIANTIAN_FUND` provider (latest + history + bulk).
4) Update Market Data settings UI logic so keyless providers do not require an API key.
5) Add minimal symbol normalization at input boundaries (accept `.US`, accept HK 5-digit inputs).
6) Manual verification:
   - A-share: `600519.SH`, `000001.SZ`
   - Fund: `161039.FUND`
   - HK: `0700.HK`
   - US: `AAPL` and `AAPL.US`

---

## 7) Acceptance Criteria

- User can add/track A-shares and CN funds with no API key.
- Opening the app and triggering Update fetches missing data without requiring manual quote import.
- Market Data settings clearly distinguishes keyless vs BYO-key providers, and stores secrets securely.
