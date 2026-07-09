# Period Summary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Build a weekly/monthly period summary that explains net worth changes
with separate money-movement and value-movement lanes.

**Architecture:** Add a `PeriodSummaryService` in `crates/core` that composes
existing activity, account, snapshot, quote, FX, and net worth services. Expose
it through Tauri and Web adapters, then add a Dashboard summary card with a
reusable mirrored contributor chart.

**Tech Stack:** Rust, Tauri commands, Axum API, React, TanStack Query, Tailwind,
Vitest, cargo tests.

---

## Working Notes

- Work in `/Users/guolite/GitHub/Panorama`.
- Do not create a branch or worktree unless Gallant asks.
- Keep V1 conservative: show reliable contributors and put ambiguous amounts in
  residual with warnings.
- Use existing flow rules from `portfolio::performance::flow_classifier`.
- Keep the mirrored chart center axis fixed and straight.
- V1 is dynamic on the Dashboard, but responses must include a stable
  `summaryKey` so a future summary archive and notification-center entry can
  link to the same period.

## Task 1: Core Models And Module

**Files:**

- Create: `crates/core/src/portfolio/period_summary/mod.rs`
- Create: `crates/core/src/portfolio/period_summary/model.rs`
- Create: `crates/core/src/portfolio/period_summary/service.rs`
- Modify: `crates/core/src/portfolio/mod.rs`

**Step 1: Write the model test**

Add this test at the bottom of `model.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal_macros::dec;

    #[test]
    fn period_summary_residual_closes_the_bridge() {
        let summary = PeriodSummary {
            summary_key: "monthly:2026-06-01:2026-06-30:USD".to_string(),
            requested_start_date: NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            requested_end_date: NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            actual_start_date: Some(NaiveDate::from_ymd_opt(2026, 6, 1).unwrap()),
            actual_end_date: Some(NaiveDate::from_ymd_opt(2026, 6, 30).unwrap()),
            period: PeriodSummaryPeriod::Monthly,
            currency: "USD".to_string(),
            start_net_worth: dec!(100000),
            end_net_worth: dec!(98500),
            total_change: dec!(-1500),
            money_movement: MoneyMovementSummary {
                inflows_total: dec!(5000),
                outflows_total: dec!(3200),
                net: dec!(1800),
                top_inflows: Vec::new(),
                top_outflows: Vec::new(),
            },
            value_movement: ValueMovementSummary {
                gains_total: dec!(1100),
                losses_total: dec!(4400),
                net: dec!(-3300),
                top_gains: Vec::new(),
                top_losses: Vec::new(),
            },
            residual: PeriodSummaryResidual {
                amount: dec!(0),
                reason: None,
            },
            warnings: Vec::new(),
        };

        assert_eq!(
            summary.money_movement.net + summary.value_movement.net + summary.residual.amount,
            summary.total_change
        );
    }
}
```

**Step 2: Run the failing test**

Run:

```bash
cargo test -p panorama-core period_summary_residual_closes_the_bridge
```

Expected: FAIL because the module and structs do not exist yet.

**Step 3: Implement minimal models**

Define:

- `PeriodSummaryPeriod`
- `PeriodSummary`
- `MoneyMovementSummary`
- `MoneyMovementItem`
- `ValueMovementSummary`
- `ValueMovementItem`
- `ValueMovementReason`
- `PeriodSummaryResidual`
- `PeriodSummaryWarning`

Use `#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]` and
`#[serde(rename_all = "camelCase")]` for response structs.

Add `summary_key: String` to `PeriodSummary`. Generate it later in the service
as:

```rust
format!(
    "{}:{}:{}:{}",
    period.as_str(),
    actual_start_date.unwrap_or(start_date),
    actual_end_date.unwrap_or(end_date),
    currency
)
```

This is not stored in V1. It exists so a later saved summary table and
notification can reference the same period without changing the response shape.

In `mod.rs`:

```rust
pub mod model;
pub mod service;

pub use model::*;
pub use service::{PeriodSummaryService, PeriodSummaryServiceTrait};
```

In `crates/core/src/portfolio/mod.rs` add:

```rust
pub mod period_summary;
```

**Step 4: Run the test**

Run:

```bash
cargo test -p panorama-core period_summary_residual_closes_the_bridge
```

Expected: PASS.

**Step 5: Commit**

```bash
git add crates/core/src/portfolio/mod.rs crates/core/src/portfolio/period_summary
git commit -m "feat(core): add period summary models"
```

## Task 2: Money Movement Builder

**Files:**

- Modify: `crates/core/src/portfolio/period_summary/service.rs`

**Step 1: Write failing tests**

Add tests for a pure helper such as:

```rust
fn build_money_movement(
    activities: &[Activity],
    account_names: &HashMap<String, String>,
    base_currency: &str,
    fx: &dyn FxServiceTrait,
) -> (MoneyMovementSummary, Vec<PeriodSummaryWarning>)
```

Test cases:

- deposit with note becomes top inflow.
- withdrawal with note becomes top outflow.
- internal `TRANSFER_IN` is ignored.
- external `TRANSFER_OUT` is included.
- `CREDIT` subtype `BONUS` is included.
- missing FX returns a warning and does not fabricate zero.

Use `create_test_activity()` from nearby tests as a pattern. Add a small mock FX
service that returns identity conversion for USD and a configurable error for
missing FX.

**Step 2: Run failing tests**

Run:

```bash
cargo test -p panorama-core period_summary::service::tests::money_
```

Expected: FAIL because the helper is not implemented.

**Step 3: Implement money movement**

Use `classify_flow_for_scope(activity, PerformanceScope::Portfolio)`.

Rules:

- `DEPOSIT`, external `TRANSFER_IN`, and `CREDIT/BONUS` are inflows.
- `WITHDRAWAL` and external `TRANSFER_OUT` are outflows.
- Preserve `activity.notes`.
- Convert `activity.amount.unwrap_or_default()` from activity currency to base
  currency with `convert_currency_for_date`.
- Sort inflows and outflows by absolute `amount_base`, descending.
- Return only top 3 for each side, but totals should include all included flows.

**Step 4: Run tests**

Run:

```bash
cargo test -p panorama-core period_summary::service::tests::money_
```

Expected: PASS.

**Step 5: Commit**

```bash
git add crates/core/src/portfolio/period_summary/service.rs
git commit -m "feat(core): build period money movement"
```

## Task 3: Holding Value Movement Builder

**Files:**

- Modify: `crates/core/src/portfolio/period_summary/service.rs`

**Step 1: Write failing tests**

Add tests for a pure helper such as:

```rust
fn build_value_movement_from_values(
    start: HashMap<HoldingKey, HoldingPeriodValue>,
    end: HashMap<HoldingKey, HoldingPeriodValue>,
) -> ValueMovementSummary
```

Test cases:

- unchanged quantity and higher value becomes gain.
- unchanged quantity and lower value becomes loss.
- larger liability balance becomes loss.
- smaller liability balance becomes gain.
- changed quantity returns `ValueMovementReason::Residual` warning candidate.
- ranking keeps top 5 gains and top 5 losses by absolute amount.

**Step 2: Run failing tests**

Run:

```bash
cargo test -p panorama-core period_summary::service::tests::value_
```

Expected: FAIL.

**Step 3: Implement the pure builder**

Create private structs:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct HoldingKey {
    account_id: Option<String>,
    holding_id: String,
}

#[derive(Debug, Clone)]
struct HoldingPeriodValue {
    name: String,
    symbol: Option<String>,
    account_name: Option<String>,
    quantity: Decimal,
    value_base: Decimal,
    is_liability: bool,
}
```

Calculation:

- Normal asset movement: `end.value_base - start.value_base`.
- Liability movement: `start.value_base - end.value_base`.
- Percent change: movement divided by absolute start value when start is not 0.
- Changed quantity: classify as `Residual` for V1.
- Split positive and negative movements, sort each side by absolute amount, keep
  top 5.

**Step 4: Run tests**

Run:

```bash
cargo test -p panorama-core period_summary::service::tests::value_
```

Expected: PASS.

**Step 5: Commit**

```bash
git add crates/core/src/portfolio/period_summary/service.rs
git commit -m "feat(core): rank period value movement"
```

## Task 4: Period Summary Service Orchestration

**Files:**

- Modify: `crates/core/src/portfolio/period_summary/service.rs`
- Test: `crates/core/src/portfolio/period_summary/service.rs`

**Step 1: Write failing service tests**

Add tests for:

- service returns empty warning when fewer than two net worth points exist.
- salary-only period reconciles through money movement.
- price-only period reconciles through value movement.
- residual equals `total_change - money_movement.net - value_movement.net`.

Use mocks for:

- `NetWorthServiceTrait`
- `ActivityServiceTrait` or `ActivityRepositoryTrait`
- `AccountServiceTrait`
- `SnapshotRepositoryTrait`
- `AssetServiceTrait`
- `QuoteServiceTrait`
- `FxServiceTrait`

Keep mocks minimal. Only implement trait methods used by the service.

**Step 2: Run failing tests**

Run:

```bash
cargo test -p panorama-core period_summary::service::tests::service_
```

Expected: FAIL.

**Step 3: Implement `PeriodSummaryServiceTrait`**

Trait:

```rust
#[async_trait]
pub trait PeriodSummaryServiceTrait: Send + Sync {
    async fn get_period_summary(
        &self,
        start_date: NaiveDate,
        end_date: NaiveDate,
        period: PeriodSummaryPeriod,
    ) -> Result<PeriodSummary>;
}
```

Service dependencies:

- `base_currency: Arc<RwLock<String>>`
- `account_service: Arc<dyn AccountServiceTrait>`
- `activity_service: Arc<dyn ActivityServiceTrait>`
- `asset_service: Arc<dyn AssetServiceTrait>`
- `snapshot_repository: Arc<dyn SnapshotRepositoryTrait>`
- `quote_service: Arc<dyn QuoteServiceTrait>`
- `fx_service: Arc<dyn FxServiceTrait>`
- `net_worth_service: Arc<dyn NetWorthServiceTrait>`

Implementation shape:

1. Validate `start_date <= end_date`.
2. Load net worth history for the requested range.
3. Use first and last history points as actual start/end.
4. Fetch activities for `(actual_start_date, actual_end_date]`.
5. Build money movement.
6. Get latest snapshots before or on start/end for non-archived accounts.
7. Build holding start/end values from snapshots, quotes, assets, and FX.
8. Build value movement.
9. Compute residual.
10. Return warnings for missing data, stale valuation, changed quantity, missing
    quote, or missing FX.
11. Set `summary_key` from period, actual start/end, and currency.

**Step 4: Run tests**

Run:

```bash
cargo test -p panorama-core period_summary::service::tests::service_
```

Expected: PASS.

**Step 5: Commit**

```bash
git add crates/core/src/portfolio/period_summary/service.rs
git commit -m "feat(core): calculate period summary"
```

## Task 5: Wire Backend Services

**Files:**

- Modify: `apps/tauri/src/context/registry.rs`
- Modify: `apps/tauri/src/context/providers.rs`
- Modify: `apps/server/src/main_lib.rs`

**Step 1: Write compile check command first**

Run:

```bash
cargo check -p panorama-core
```

Expected: PASS before wiring.

**Step 2: Add service fields**

In Tauri `ServiceContext`, add:

```rust
pub period_summary_service:
    Arc<dyn portfolio::period_summary::PeriodSummaryServiceTrait>,
```

Add accessor:

```rust
pub fn period_summary_service(
    &self,
) -> Arc<dyn portfolio::period_summary::PeriodSummaryServiceTrait> {
    Arc::clone(&self.period_summary_service)
}
```

In both Tauri and server providers, construct `PeriodSummaryService::new(...)`
after the services it depends on.

In `AppState`, add:

```rust
pub period_summary_service:
    Arc<dyn panorama_core::portfolio::period_summary::PeriodSummaryServiceTrait + Send + Sync>,
```

**Step 3: Run compile check**

Run:

```bash
cargo check -p panorama-app-tauri -p panorama-server
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/tauri/src/context/registry.rs apps/tauri/src/context/providers.rs apps/server/src/main_lib.rs
git commit -m "feat: wire period summary service"
```

## Task 6: Tauri And Web API

**Files:**

- Create: `apps/server/src/api/period_summary.rs`
- Modify: `apps/server/src/api.rs`
- Create: `apps/tauri/src/commands/period_summary.rs`
- Modify: `apps/tauri/src/commands/mod.rs`
- Modify: `apps/tauri/src/lib.rs`

**Step 1: Add API tests or compile guard**

If there is no existing route integration pattern for feature APIs, use compile
checks for this task and cover behavior in core tests.

**Step 2: Implement server route**

Route:

```text
GET /api/v1/period-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&period=weekly|monthly|custom
```

Use `parse_date` from `apps/server/src/api/shared.rs`.

Map `period` string into `PeriodSummaryPeriod`.

**Step 3: Implement Tauri command**

Command:

```rust
#[tauri::command]
pub async fn get_period_summary(
    start_date: String,
    end_date: String,
    period: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<PeriodSummary, String>
```

Register in `commands/mod.rs` and `tauri::generate_handler!`.

**Step 4: Run compile check**

Run:

```bash
cargo check -p panorama-app-tauri -p panorama-server
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/server/src/api.rs apps/server/src/api/period_summary.rs apps/tauri/src/commands/mod.rs apps/tauri/src/commands/period_summary.rs apps/tauri/src/lib.rs
git commit -m "feat: expose period summary API"
```

## Task 7: Frontend Types, Adapter, Hook

**Files:**

- Modify: `apps/frontend/src/lib/types.ts`
- Modify: `apps/frontend/src/lib/query-keys.ts`
- Create: `apps/frontend/src/adapters/shared/period-summary.ts`
- Modify: `apps/frontend/src/adapters/tauri/index.ts`
- Modify: `apps/frontend/src/adapters/web/index.ts`
- Modify: `apps/frontend/src/adapters/web/core.ts`
- Create: `apps/frontend/src/hooks/use-period-summary.ts`

**Step 1: Add TypeScript types**

Add `PeriodSummary`, `MoneyMovementSummary`, `MoneyMovementItem`,
`ValueMovementSummary`, `ValueMovementItem`, `PeriodSummaryResidual`, and
`PeriodSummaryWarning`.

Use numbers for frontend decimal values, matching existing `PerformanceMetrics`
patterns unless the backend serializes these as strings. If backend response
uses decimal strings, type them as `string` consistently and parse only in UI.

**Step 2: Add adapter**

Function:

```ts
export const getPeriodSummary = async (
  startDate: string,
  endDate: string,
  period?: "weekly" | "monthly" | "custom",
): Promise<PeriodSummary> => {
  return invoke<PeriodSummary>("get_period_summary", {
    startDate,
    endDate,
    period,
  });
};
```

Add web command mapping and URLSearchParams handling in `web/core.ts`.

**Step 3: Add hook**

```ts
export function usePeriodSummary(options: {
  startDate?: string;
  endDate?: string;
  period?: "weekly" | "monthly" | "custom";
  enabled?: boolean;
}) {
  const { startDate, endDate, period = "custom", enabled = true } = options;
  return useQuery<PeriodSummary, Error>({
    queryKey: QueryKeys.periodSummary(startDate ?? "", endDate ?? "", period),
    queryFn: () => getPeriodSummary(startDate!, endDate!, period),
    enabled: enabled && !!startDate && !!endDate,
  });
}
```

**Step 4: Run type check**

Run:

```bash
pnpm --filter frontend type-check
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/frontend/src/lib/types.ts apps/frontend/src/lib/query-keys.ts apps/frontend/src/adapters/shared/period-summary.ts apps/frontend/src/adapters/tauri/index.ts apps/frontend/src/adapters/web/index.ts apps/frontend/src/adapters/web/core.ts apps/frontend/src/hooks/use-period-summary.ts
git commit -m "feat(frontend): add period summary adapter"
```

## Task 8: Mirrored Contributor Chart

**Files:**

- Create:
  `apps/frontend/src/pages/dashboard/period-summary/mirrored-contributor-chart.tsx`
- Create:
  `apps/frontend/src/pages/dashboard/period-summary/mirrored-contributor-chart.test.tsx`

**Step 1: Write failing component tests**

Test cases:

- renders losses on the left and gains on the right.
- orders each side by absolute amount.
- renders one central axis with `data-testid="contributor-axis"`.
- exposes signed amounts as text.

Use:

```ts
render(
  <MirroredContributorChart
    negativeLabel="Losses"
    positiveLabel="Gains"
    negativeItems={[{ id: "btc", label: "BTC", amount: -4000 }]}
    positiveItems={[{ id: "salary", label: "Salary", amount: 5000 }]}
    currency="USD"
  />,
);
```

**Step 2: Run failing test**

Run:

```bash
pnpm --filter frontend test -- mirrored-contributor-chart.test.tsx
```

Expected: FAIL.

**Step 3: Implement component**

Implementation rules:

- Use CSS grid with columns like `minmax(0,1fr) 1px minmax(0,1fr)`.
- Put the axis in the center column.
- Use fixed center axis independent of labels.
- Use `transform-origin: right` for negative bars and `left` for positive bars.
- Do not rely on color alone; render signs and amounts.

**Step 4: Run test**

Run:

```bash
pnpm --filter frontend test -- mirrored-contributor-chart.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/dashboard/period-summary/mirrored-contributor-chart.tsx apps/frontend/src/pages/dashboard/period-summary/mirrored-contributor-chart.test.tsx
git commit -m "feat(frontend): add mirrored contributor chart"
```

## Task 9: Period Summary Card

**Files:**

- Create:
  `apps/frontend/src/pages/dashboard/period-summary/period-summary-card.tsx`
- Create:
  `apps/frontend/src/pages/dashboard/period-summary/period-summary-card.test.tsx`
- Create: `apps/frontend/src/pages/dashboard/period-summary/index.ts`

**Step 1: Write failing tests**

Mock `usePeriodSummary`.

Test cases:

- renders start, money movement, value movement, residual, and end.
- renders money movement notes.
- renders top 3 inflows/outflows.
- renders top 5 gains/losses.
- renders warning text when warnings exist.
- renders empty state when summary has no actual dates.

**Step 2: Run failing tests**

Run:

```bash
pnpm --filter frontend test -- period-summary-card.test.tsx
```

Expected: FAIL.

**Step 3: Implement card**

Structure:

- Compact net worth bridge at top.
- Money Movement mirrored chart below.
- Value Movement mirrored chart below.
- Warning/residual footer.

Do not add explanatory marketing copy. Use terse labels:

- `Money Movement`
- `Value Movement`
- `Residual`
- `Data gaps`

**Step 4: Run tests**

Run:

```bash
pnpm --filter frontend test -- period-summary-card.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/dashboard/period-summary
git commit -m "feat(frontend): add period summary card"
```

## Task 10: Dashboard Integration

**Files:**

- Modify: `apps/frontend/src/pages/dashboard/dashboard-content.tsx`
- Test: update/create
  `apps/frontend/src/pages/dashboard/dashboard-content.test.tsx`

**Step 1: Write failing integration test**

Mock `usePeriodSummary` and verify the card appears when `dateRange.from` and
`dateRange.to` exist.

**Step 2: Implement range mapping**

In `DashboardContent`, derive:

```ts
const periodSummaryRange = useMemo(() => {
  if (!dateRange?.from || !dateRange?.to) return null;
  return {
    startDate: format(dateRange.from, "yyyy-MM-dd"),
    endDate: format(dateRange.to, "yyyy-MM-dd"),
    period:
      intervalCode === "1W"
        ? "weekly"
        : intervalCode === "1M"
          ? "monthly"
          : "custom",
  } as const;
}, [dateRange, intervalCode]);
```

Place `PeriodSummaryCard` below `HistoryChart` / `IntervalSelector` and above
the lower dashboard content.

**Step 3: Run frontend tests**

Run:

```bash
pnpm --filter frontend test -- dashboard-content.test.tsx period-summary-card.test.tsx mirrored-contributor-chart.test.tsx
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/frontend/src/pages/dashboard/dashboard-content.tsx apps/frontend/src/pages/dashboard/dashboard-content.test.tsx
git commit -m "feat(frontend): show period summary on dashboard"
```

## Task 11: Full Verification

**Files:**

- No code unless failures require fixes.

**Step 1: Run Rust checks**

Run:

```bash
cargo test -p panorama-core period_summary
cargo check -p panorama-app-tauri -p panorama-server
```

Expected: PASS.

**Step 2: Run frontend checks**

Run:

```bash
pnpm --filter frontend test -- period-summary
pnpm --filter frontend type-check
```

Expected: PASS.

**Step 3: Manual UI check**

Run:

```bash
pnpm run dev:web
```

Open the app, choose a weekly and monthly dashboard range, and verify:

- Start, money movement, value movement, residual, and end reconcile.
- Money lane shows notes.
- Value lane shows holding-level top gains and losses.
- Mirrored chart center axis stays straight on desktop and mobile widths.

**Step 4: Final commit if fixes were needed**

```bash
git status --short
git add <fixed files>
git commit -m "fix: polish period summary verification"
```

## Future Task: Summary Archive And Notifications

Do not implement this in V1 unless Gallant explicitly asks. Keep this section as
the follow-on design target.

**Backend shape:**

- Add a `period_summaries` table with `summary_key`, `period`, `start_date`,
  `end_date`, `currency`, `generated_at`, `read_at`, and serialized summary
  payload or snapshot metadata.
- Add a scheduled/month-boundary job that materializes weekly/monthly summaries.
- Add a notification-center entry when a new stored summary is generated.
- Decide whether edits to past transactions regenerate saved summaries or leave
  them immutable as historic records.
- If regenerating, store `lastGeneratedAt` and make notifications resilient to
  changed numbers.
- If immutable, add a correction/superseded state so users can see when old
  summaries no longer match current transactions.

**Frontend shape:**

- Add a Statements/Summaries page listing saved weekly/monthly summaries.
- Notification click opens the matching summary by `summaryKey`.
- Dashboard continues to show dynamic summaries for arbitrary selected ranges.

## Execution Options

Plan complete and saved to
`docs/plans/2026-07-02-period-summary-implementation.md`.

1. **Subagent-Driven (this session)** - dispatch fresh subagent per task, review
   between tasks, fast iteration.
2. **Parallel Session (separate)** - open a new session with
   `superpowers:executing-plans`, batch execution with checkpoints.

Choose one before implementation starts.
