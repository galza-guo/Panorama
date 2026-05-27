# Market Instrument Identity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make market instrument identity deterministic so search, creation, and quote sync do not create duplicate assets such as `001594` and `001594.FUND`.

**Architecture:** Add one canonical identity layer in core asset/quote code and use it in search dedupe plus asset creation/update. Keep the existing database fields; derive a stable dedupe key from `instrument_type`, canonical symbol, MIC, quote currency, and preferred provider.

**Tech Stack:** Rust core crates, market-data providers, SQLite-backed repositories, existing Rust unit tests.

---

## Task 1: Add Canonical Identity Helpers

**Files:**

- Modify: `crates/core/src/assets/assets_model.rs`
- Test: `crates/core/src/assets/assets_model_tests.rs`

**Step 1: Write failing tests**

Add tests covering the identity cases:

```rust
#[test]
fn test_market_identity_key_tiantian_fund_from_suffix() {
    let canonical = canonicalize_market_identity(
        Some(InstrumentType::Equity),
        Some("001594.FUND"),
        None,
        Some("CNY"),
    );

    let key = market_identity_key(
        Some(&InstrumentType::Equity),
        canonical.instrument_symbol.as_deref(),
        canonical.instrument_exchange_mic.as_deref(),
        canonical.quote_ccy.as_deref(),
        Some("TIANTIAN_FUND"),
    );

    assert_eq!(key.as_deref(), Some("FUND:CN:001594"));
}

#[test]
fn test_market_identity_key_tiantian_fund_from_preferred_provider() {
    let symbol = normalize_market_symbol_for_provider(Some("001594"), Some("TIANTIAN_FUND"));
    let canonical = canonicalize_market_identity(
        Some(InstrumentType::Equity),
        symbol.as_deref(),
        None,
        Some("CNY"),
    );

    let key = market_identity_key(
        Some(&InstrumentType::Equity),
        canonical.instrument_symbol.as_deref(),
        canonical.instrument_exchange_mic.as_deref(),
        canonical.quote_ccy.as_deref(),
        Some("TIANTIAN_FUND"),
    );

    assert_eq!(key.as_deref(), Some("FUND:CN:001594"));
}

#[test]
fn test_market_identity_key_mainland_equity() {
    let canonical = canonicalize_market_identity(
        Some(InstrumentType::Equity),
        Some("600519"),
        Some("XSHG"),
        Some("CNY"),
    );

    let key = market_identity_key(
        Some(&InstrumentType::Equity),
        canonical.instrument_symbol.as_deref(),
        canonical.instrument_exchange_mic.as_deref(),
        canonical.quote_ccy.as_deref(),
        Some("EASTMONEY_CN"),
    );

    assert_eq!(key.as_deref(), Some("EQUITY:XSHG:600519"));
}

#[test]
fn test_market_identity_key_crypto() {
    let canonical = canonicalize_market_identity(
        Some(InstrumentType::Crypto),
        Some("BTC-USD"),
        None,
        None,
    );

    let key = market_identity_key(
        Some(&InstrumentType::Crypto),
        canonical.instrument_symbol.as_deref(),
        canonical.instrument_exchange_mic.as_deref(),
        canonical.quote_ccy.as_deref(),
        None,
    );

    assert_eq!(key.as_deref(), Some("CRYPTO:BTC/USD"));
}
```

**Step 2: Run tests to verify failure**

Run:

```bash
cargo test -p wealthfolio-core assets_model_tests::test_market_identity_key -- --nocapture
```

Expected: fails because `market_identity_key` does not exist.

**Step 3: Implement helper**

Add a public helper near `canonicalize_market_identity`:

```rust
pub fn market_identity_key(
    instrument_type: Option<&InstrumentType>,
    instrument_symbol: Option<&str>,
    instrument_exchange_mic: Option<&str>,
    quote_ccy: Option<&str>,
    preferred_provider: Option<&str>,
) -> Option<String> {
    let inst_type = instrument_type?;
    let symbol = instrument_symbol?.trim().to_uppercase();
    if symbol.is_empty() {
        return None;
    }

    match inst_type {
        InstrumentType::Equity | InstrumentType::Option | InstrumentType::Metal => {
            if preferred_provider == Some(DATA_SOURCE_TIANTIAN_FUND)
                || symbol.ends_with(".FUND")
            {
                let code = symbol.strip_suffix(".FUND").unwrap_or(&symbol);
                if code.len() == 6 && code.chars().all(|ch| ch.is_ascii_digit()) {
                    return Some(format!("FUND:CN:{code}"));
                }
            }

            if let Some(mic) = instrument_exchange_mic.map(str::trim).filter(|m| !m.is_empty()) {
                return Some(format!("{}:{}:{}", inst_type.as_db_str(), mic.to_uppercase(), symbol));
            }

            Some(format!("{}:{}", inst_type.as_db_str(), symbol))
        }
        InstrumentType::Crypto => {
            let quote = quote_ccy.map(str::trim).filter(|q| !q.is_empty())?;
            Some(format!("CRYPTO:{}/{}", symbol, quote.to_uppercase()))
        }
        InstrumentType::Fx => {
            let quote = quote_ccy.map(str::trim).filter(|q| !q.is_empty())?;
            Some(format!("FX:{}/{}", symbol, quote.to_uppercase()))
        }
    }
}
```

**Step 4: Run tests**

Run:

```bash
cargo test -p wealthfolio-core assets_model_tests::test_market_identity_key -- --nocapture
```

Expected: all new tests pass.

---

## Task 2: Use Canonical Identity In Search Dedupe

**Files:**

- Modify: `crates/core/src/quotes/service.rs`
- Test: `crates/core/src/quotes/service_tests.rs`

**Step 1: Write failing test**

Add a test that builds search summaries with the same Tiantian fund represented as `001594` and `001594.FUND`, then asserts the merge keeps only the canonical fund result. If existing quote-service tests do not expose a convenient full service harness, extract a small pure helper from `search_symbol_with_currency` first and test that helper.

Target behavior:

```rust
assert_eq!(results.len(), 1);
assert_eq!(results[0].symbol, "001594.FUND");
assert_eq!(results[0].data_source.as_deref(), Some("TIANTIAN_FUND"));
```

**Step 2: Run test to verify failure**

Run:

```bash
cargo test -p wealthfolio-core quotes::service_tests::search_dedupes_tiantian_fund_aliases -- --nocapture
```

Expected: fails because current dedupe only compares `(symbol, exchange_mic)`.

**Step 3: Implement minimal search merge helper**

In `crates/core/src/quotes/service.rs`, add private helpers:

```rust
fn search_result_identity_key(result: &SymbolSearchResult) -> Option<String> {
    let provider = result.data_source.as_deref();
    let instrument_type = if result.quote_type.eq_ignore_ascii_case("CRYPTO") {
        Some(InstrumentType::Crypto)
    } else {
        Some(InstrumentType::Equity)
    };

    let normalized_symbol = normalize_market_symbol_for_provider(
        Some(result.symbol.as_str()),
        provider,
    );
    let canonical = canonicalize_market_identity(
        instrument_type.clone(),
        normalized_symbol.as_deref(),
        result.exchange_mic.as_deref(),
        result.currency.as_deref(),
    );

    market_identity_key(
        instrument_type.as_ref(),
        canonical.instrument_symbol.as_deref(),
        canonical.instrument_exchange_mic.as_deref(),
        canonical.quote_ccy.as_deref().or(result.currency.as_deref()),
        provider,
    )
}
```

Then change provider filtering to dedupe by identity key:

```rust
let existing_keys: HashSet<String> = existing_summaries
    .iter()
    .filter_map(Self::search_result_identity_key)
    .collect();

let mut seen_provider_keys = HashSet::new();
let new_provider_results: Vec<SymbolSearchResult> = provider_results
    .into_iter()
    .filter(|r| {
        let Some(key) = Self::search_result_identity_key(r) else {
            return !existing_keys.contains(&(r.symbol.clone(), r.exchange_mic.clone()).to_string().as_str());
        };
        !existing_keys.contains(&key) && seen_provider_keys.insert(key)
    })
    .collect();
```

Use a cleaner fallback than the sketch above if needed; avoid invalid temporary references.

**Step 4: Prefer canonical provider result**

When two provider results share a key, keep the more canonical one:

- existing asset beats provider result
- `TIANTIAN_FUND` beats inferred mainland equity for `.FUND` keys
- symbol ending `.FUND` beats bare six-digit symbol for fund keys
- higher score wins after canonical preference

**Step 5: Run targeted tests**

Run:

```bash
cargo test -p wealthfolio-core quotes::service_tests::search_dedupes_tiantian_fund_aliases -- --nocapture
cargo test -p wealthfolio-core quotes::service_tests -- --nocapture
```

Expected: targeted search tests pass.

---

## Task 3: Make Asset Creation Use Canonical Identity Consistently

**Files:**

- Modify: `crates/core/src/assets/assets_service.rs`
- Test: `crates/core/src/assets/assets_model_tests.rs` or existing asset service tests

**Step 1: Write failing tests**

Test that creating or updating an asset with:

- symbol `001594`
- preferred provider `TIANTIAN_FUND`

stores:

- `instrument_symbol=001594.FUND`
- `instrument_exchange_mic=NULL`
- `quote_ccy=CNY`
- `provider_config.preferred_provider=TIANTIAN_FUND`

**Step 2: Run test to verify failure**

Run:

```bash
cargo test -p wealthfolio-core assets -- --nocapture
```

Expected: fails where creation/update keeps a bare code or infers an exchange MIC.

**Step 3: Implement minimal correction**

Centralize the existing sequence:

```text
preferred provider -> normalize_market_symbol_for_provider -> canonicalize_market_identity -> market_identity_key
```

Use it in:

- `new_asset_from_spec`
- `create_asset`
- `update_asset_profile`

Do not add new database fields in this task.

**Step 4: Run tests**

Run:

```bash
cargo test -p wealthfolio-core assets -- --nocapture
```

Expected: asset model/service tests pass.

---

## Task 4: Add Existing Duplicate Repair Script

**Files:**

- Create: `scripts/repair_market_identity_duplicates.py`
- Test manually against copied SQLite database

**Step 1: Write script dry-run behavior**

The script should:

- require `--db /path/to/app.db`
- default to dry run
- find pairs where canonical asset has `.FUND` and Tiantian provider
- find bare same-code asset with same or empty name
- report activity counts and quote counts
- only auto-deactivate bare duplicate when activity count is zero

**Step 2: Run dry run on a copied database**

Run:

```bash
cp "/Users/guolite/Library/Application Support/com.gallantguo.panorama/app.db" /tmp/panorama-identity-repair-test.db
python scripts/repair_market_identity_duplicates.py --db /tmp/panorama-identity-repair-test.db
```

Expected: reports the `001594` duplicate and says it is safe to deactivate/delete.

**Step 3: Add apply mode**

Require `--apply` for writes.

For safe zero-activity duplicates:

- set `is_active=0`
- clear quote sync errors by deleting duplicate `quote_sync_state`
- leave quotes in place unless user explicitly passes `--delete-quotes`

**Step 4: Verify copied DB**

Run:

```bash
python scripts/repair_market_identity_duplicates.py --db /tmp/panorama-identity-repair-test.db --apply
sqlite3 /tmp/panorama-identity-repair-test.db "select display_code,is_active from assets where display_code in ('001594','001594.FUND');"
```

Expected: canonical `001594.FUND` remains active; bare `001594` is inactive.

---

## Task 5: End-To-End Verification

**Files:**

- No source changes unless tests reveal a bug

**Step 1: Run Rust tests**

Run:

```bash
cargo test -p wealthfolio-core
cargo test -p wealthfolio-market-data
```

Expected: both pass.

**Step 2: Run relevant frontend/backend checks if touched**

If TypeScript search result display changes were needed, run:

```bash
pnpm test
pnpm type-check
```

Expected: pass.

**Step 3: Manual verification**

In the app:

- search `001594`
- confirm one clear Tiantian fund result is shown
- create/select it
- confirm saved asset displays as `001594.FUND`
- sync quotes
- confirm latest quote comes from `TIANTIAN_FUND`

**Step 4: Document result**

Update this plan or a follow-up note with:

- tests run
- duplicate repair result
- any unresolved ambiguous instruments
