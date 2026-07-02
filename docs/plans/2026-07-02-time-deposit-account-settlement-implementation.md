# Time Deposit Account Settlement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Link time deposits to accounts and add a settle-to-cash workflow that
uses existing `BUY`, `SELL`, and `INTEREST` activity logic.

**Architecture:** Keep time deposits as alternative assets, but make new ones
account-held by creating a one-unit `BUY` activity at opening. Settlement is a
grouped activity batch: `SELL` principal plus optional `INTEREST`, followed by a
metadata update that closes the asset. Holdings remain calculated from existing
activity and snapshot services.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, Rust
`panorama-core`, existing activity APIs, existing alternative asset APIs.

---

### Task 1: Extract Shared Time Deposit Metadata Logic

**Files:**

- Create: `/Users/guolite/GitHub/Panorama/crates/core/src/assets/time_deposit.rs`
- Modify: `/Users/guolite/GitHub/Panorama/crates/core/src/assets/mod.rs`
- Modify: `/Users/guolite/GitHub/Panorama/crates/core/src/assets/alternative_assets_service.rs`
- Test: `/Users/guolite/GitHub/Panorama/crates/core/src/assets/time_deposit.rs`

**Step 1: Write failing tests**

Add tests for:

- detecting Panorama time deposit metadata
- parsing linked account ID
- deriving expected maturity value from rate
- deriving current value before maturity
- using manual override
- detecting `status = "closed"`

Example test shape:

```rust
#[test]
fn derives_time_deposit_value_from_rate() {
    let metadata = serde_json::json!({
        "panorama_category": "time_deposit",
        "principal": "100000",
        "start_date": "2026-07-02",
        "maturity_date": "2026-10-02",
        "quoted_annual_rate": "3.2"
    });

    let value = derive_time_deposit_value(&metadata, date("2026-08-02")).unwrap();
    assert!(value.current_value > dec!(100000));
    assert!(value.expected_maturity_value > value.current_value);
}
```

**Step 2: Run tests to verify failure**

Run:

```bash
cargo test -p panorama-core time_deposit -- --nocapture
```

Expected: FAIL because the helper module does not exist.

**Step 3: Implement minimal helper**

Create helpers equivalent to:

```rust
pub struct TimeDepositValue {
    pub principal: Decimal,
    pub expected_maturity_value: Decimal,
    pub current_value: Decimal,
    pub maturity_date: NaiveDate,
    pub is_closed: bool,
}

pub fn is_time_deposit_metadata(metadata: &Value, kind: &AssetKind) -> bool;
pub fn is_closed_time_deposit(metadata: Option<&Value>, kind: &AssetKind) -> bool;
pub fn linked_account_id(metadata: Option<&Value>) -> Option<String>;
pub fn derive_time_deposit_value(metadata: &Value, as_of: NaiveDate)
    -> Option<TimeDepositValue>;
```

Move the duplicated parsing/calculation logic out of
`alternative_assets_service.rs` into this helper.

**Step 4: Run tests to verify pass**

Run:

```bash
cargo test -p panorama-core time_deposit -- --nocapture
```

Expected: PASS.

**Step 5: Commit**

```bash
git add crates/core/src/assets/time_deposit.rs crates/core/src/assets/mod.rs crates/core/src/assets/alternative_assets_service.rs
git commit -m "refactor: share time deposit metadata logic"
```

### Task 2: Link Time Deposit Creation To An Account

**Files:**

- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.test.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/pages/time-deposits/time-deposits-dashboard.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/lib/panorama-asset-attributes.ts`

**Step 1: Write failing tests**

Add tests that expect:

- create sheet requires a linked account
- metadata includes `linked_account_id`
- create flow first creates the asset, then creates a `BUY` activity
- `BUY` payload uses quantity `1`, unit price equal to principal, and the new
  asset ID

**Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter frontend test -- --run apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.test.tsx apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx
```

Expected: FAIL because no account field or opening activity exists.

**Step 3: Implement minimal UI and payload changes**

Add `linkedAccountId` to `TimeDepositFormValues`.

On create:

```ts
const created = await createMutation.mutateAsync(assetPayload);
await createActivity({
  accountId: values.linkedAccountId,
  activityType: ActivityType.BUY,
  activityDate: values.startDate.toISOString(),
  symbol: { id: created.assetId, kind: AssetKind.TIME_DEPOSIT, name: values.name },
  quantity: "1",
  unitPrice: values.principal,
  currency: values.currency,
  metadata: { panorama_time_deposit_role: "opening", asset_id: created.assetId },
});
```

After the activity succeeds, patch the asset metadata with `opening_activity_id`
if the activity ID is returned.

**Step 4: Run tests to verify pass**

Run the same frontend tests.

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/time-deposits apps/frontend/src/lib/panorama-asset-attributes.ts
git commit -m "feat: link time deposits to accounts"
```

### Task 3: Add Settle To Cash Action

**Files:**

- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/pages/time-deposits/time-deposits-dashboard.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/lib/panorama-asset-attributes.ts`

**Step 1: Write failing tests**

Add tests that expect:

- active matured deposits show `Settle to Cash`
- settlement creates one `SELL` activity for principal
- settlement creates one `INTEREST` activity when interest is positive
- settlement skips `INTEREST` when interest is zero
- settlement patches metadata to `status: "closed"`
- settlement is unavailable when `status` is already `closed`

**Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter frontend test -- --run apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx
```

Expected: FAIL because settlement action does not exist.

**Step 3: Implement settlement mutation**

Use existing `saveActivities` for an atomic activity batch:

```ts
await saveActivities({
  creates: [
    {
      accountId,
      activityType: ActivityType.SELL,
      activityDate: settlementDate.toISOString(),
      sourceGroupId,
      symbol: { id: holding.id, kind: AssetKind.TIME_DEPOSIT, name: holding.name },
      quantity: "1",
      unitPrice: String(settledPrincipal),
      currency,
      metadata: { panorama_time_deposit_role: "settlement_principal", asset_id: holding.id },
    },
    ...(settledInterest > 0
      ? [{
          accountId,
          activityType: ActivityType.INTEREST,
          activityDate: settlementDate.toISOString(),
          sourceGroupId,
          amount: String(settledInterest),
          currency,
          metadata: { panorama_time_deposit_role: "settlement_interest", asset_id: holding.id },
        }]
      : []),
  ],
});
```

Then patch metadata:

```ts
{
  status: "closed",
  settlement_date,
  settlement_account_id: accountId,
  settlement_activity_ids,
  settled_principal,
  settled_interest,
  actual_maturity_value,
}
```

Also write a zero valuation quote on the settlement date as a defensive fallback.

**Step 4: Run tests to verify pass**

Run the same dashboard test command.

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/time-deposits/time-deposits-dashboard.tsx apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx apps/frontend/src/lib/panorama-asset-attributes.ts
git commit -m "feat: settle time deposits to cash"
```

### Task 4: Price Account-Held Time Deposits Correctly

**Files:**

- Modify: `/Users/guolite/GitHub/Panorama/crates/core/src/portfolio/holdings/holdings_valuation_service.rs`
- Test: `/Users/guolite/GitHub/Panorama/crates/core/src/portfolio/holdings/holdings_valuation_service_tests.rs`

**Step 1: Write failing tests**

Add tests for an account holding whose asset kind is `TimeDeposit` and metadata
contains principal/rate/maturity fields.

Expect:

- live market value uses derived time deposit current value
- price equals derived current value for quantity `1`
- unrealized gain equals derived current value minus principal
- closed time deposit holdings value at zero if one somehow remains

**Step 2: Run tests to verify failure**

Run:

```bash
cargo test -p panorama-core holdings_valuation -- --nocapture
```

Expected: FAIL because alternative asset holdings only use latest quote.

**Step 3: Implement minimal special case**

Inside `calculate_alternative_asset_valuation`, before normal quote handling:

```rust
if asset_kind == AssetKind::TimeDeposit {
    if let Some(metadata) = holding.metadata.as_ref() {
        if let Some(value) = derive_time_deposit_value(metadata, valuation_date_today()) {
            // Set price, market_value, unrealized_gain, and day_change fields.
            return Ok(());
        }
    }
}
```

Keep non-time-deposit alternative assets unchanged.

**Step 4: Run tests to verify pass**

Run the same Rust test command.

Expected: PASS.

**Step 5: Commit**

```bash
git add crates/core/src/portfolio/holdings/holdings_valuation_service.rs crates/core/src/portfolio/holdings/holdings_valuation_service_tests.rs
git commit -m "feat: value account-held time deposits"
```

### Task 5: Prevent Closed Standalone Time Deposits From Double Counting

**Files:**

- Modify: `/Users/guolite/GitHub/Panorama/crates/core/src/assets/alternative_assets_service.rs`
- Modify: `/Users/guolite/GitHub/Panorama/crates/core/src/portfolio/net_worth/net_worth_service.rs`
- Test: `/Users/guolite/GitHub/Panorama/crates/core/src/assets/alternative_assets_service.rs`
- Test: `/Users/guolite/GitHub/Panorama/crates/core/src/portfolio/net_worth/net_worth_service_tests.rs`

**Step 1: Write failing tests**

Add tests that expect:

- `get_alternative_holdings` excludes `status = "closed"` time deposits from
  active holdings
- net worth standalone alternative asset pass skips closed time deposits
- open account-held time deposits are not double counted as both account
  position and standalone alternative asset

**Step 2: Run tests to verify failure**

Run:

```bash
cargo test -p panorama-core time_deposit -- --nocapture
```

Expected: FAIL because closed time deposits are still treated as active
standalone alternative assets.

**Step 3: Implement minimal skip logic**

Use the shared helper:

```rust
if is_closed_time_deposit(asset.metadata.as_ref(), &asset.kind) {
    continue;
}
```

Apply it only in standalone alternative-holding/net-worth paths. Do not delete
the asset.

**Step 4: Run tests to verify pass**

Run the same Rust test command.

Expected: PASS.

**Step 5: Commit**

```bash
git add crates/core/src/assets/alternative_assets_service.rs crates/core/src/portfolio/net_worth/net_worth_service.rs crates/core/src/portfolio/net_worth/net_worth_service_tests.rs
git commit -m "fix: exclude closed time deposits from active valuations"
```

### Task 6: End-To-End Verification

**Files:**

- No new files.

**Step 1: Run focused tests**

Run:

```bash
pnpm --filter frontend test -- --run apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.test.tsx
cargo test -p panorama-core time_deposit -- --nocapture
cargo test -p panorama-core holdings_valuation -- --nocapture
```

Expected: PASS.

**Step 2: Run broader checks**

Run:

```bash
pnpm type-check
cargo check
```

Expected: PASS.

**Step 3: Manual smoke test**

Run:

```bash
pnpm run dev:web
```

In the browser:

- create a linked HKD time deposit
- confirm linked account cash decreases
- confirm time deposit appears as a holding
- settle it to cash
- confirm cash increases by principal plus interest
- confirm the active time deposit disappears or shows closed

**Step 4: Commit final polish if needed**

```bash
git status --short
git add <only-files-changed-for-this-feature>
git commit -m "test: verify time deposit settlement flow"
```
