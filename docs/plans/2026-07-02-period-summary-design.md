# Weekly and Monthly Period Summary Design

## Goal

Build a weekly/monthly summary that explains how net worth changed during a
period and what contributed to that change.

The summary should feel like a bank statement plus an investment statement:

- Money movement explains deposits, withdrawals, and external transfers.
- Value movement explains holding-level gains and losses from prices,
  valuation updates, FX, income accrual, or liability changes.
- The top view reconciles the period from starting net worth to ending net
  worth.

The user should be able to answer, at a glance:

1. How much did my net worth change?
2. How much was caused by money moving in or out?
3. How much was caused by asset or liability values changing?
4. Which accounts, transactions, and holdings mattered most?

## Core Product Shape

Use a two-lane design.

### Lane 1: Money Movement

Money movement is account/activity-level. It covers money crossing the user's
wealth boundary, such as salary, rent, credit card payoff, manual deposits,
withdrawals, and external transfers.

Show:

- Top 3 inflows.
- Top 3 outflows.
- Account name.
- Date.
- Amount in base currency.
- Original currency amount when useful.
- Activity note, because notes often contain the real-world reason.

Examples:

- `+5,000 Salary`
- `-2,000 Rent`
- `-1,200 Credit card payoff`

If a liability is tracked in Panorama, paying it down may reduce cash and reduce
debt at the same time. In that case the summary should explain the paired
movement rather than calling it pure spending. If no liability is tracked, the
payoff is simply shown as an outflow.

### Lane 2: Value Movement

Value movement is holding-level. It covers changes in holdings and liabilities
caused by market prices, manual valuation updates, FX movement, income accrual,
or debt balance changes.

Show:

- Top 5 gains.
- Top 5 losses.
- Holding or liability name.
- Account name when applicable.
- Amount change in base currency.
- Percent change when meaningful.
- A short reason chip such as `price`, `valuation`, `FX`, `income`, `liability`,
  or `residual`.

Examples:

- `+800 NVDA`
- `+300 Time deposit`
- `-4,000 BTC`
- `-400 MPF fund`

## Visual Design

Use a small reconciliation bridge at the top:

```text
Start net worth -> Money movement -> Value movement -> End net worth
100,000            +1,800            -3,300            98,500
```

Below the bridge, each lane uses a mirrored contributor chart.

The mirrored chart has one fixed, straight vertical zero-axis in the center.
Negative bars extend left. Positive bars extend right. The axis must remain
visually straight regardless of label length, amount formatting, or responsive
layout.

```text
Money Movement

Outflows                         | Inflows
Rent                 ██████      | █████████████ Salary
Credit card payoff   ████        | ██ Bonus
Transfer out         ██          | █ Refund
```

```text
Value Movement

Losses                           | Gains
BTC                  ███████████ | █████ NVDA
MPF fund             ██          | ██ Time deposit
Property valuation   █           | █ Cash interest
```

Chart rules:

- Rank each side from largest absolute contribution to smallest.
- Scale bars within the lane, using the largest absolute value from both sides
  as the maximum.
- Keep the axis in a fixed center column.
- Do not let labels push the axis off center.
- Use color carefully: positive and negative should be distinct, but the UI
  should still work with labels and signs alone.
- On narrow screens, keep the same left-axis-right structure if possible. If it
  must stack, preserve a visible zero-axis in each stacked chart.

## Data Semantics

The period summary should reconcile:

```text
ending net worth - starting net worth
= net money movement
+ net value movement
+ residual / data gap
```

Residual is allowed and should be shown when needed. It can come from stale
valuations, missing quotes, missing FX rates, rounding, or attribution that is
not clean enough for V1. The UI should not hide residuals by spreading them
across contributors.

## Backend Design

Add a period summary service under `crates/core/src/portfolio/period_summary/`.

The service should compose existing systems:

- Net worth history from `NetWorthService`.
- Portfolio valuation history from `ValuationService`.
- Holdings snapshots from `SnapshotService` / `SnapshotRepositoryTrait`.
- Activities from `ActivityServiceTrait` or `ActivityRepositoryTrait`.
- Flow classification from `portfolio::performance::flow_classifier`.
- FX conversion from the existing FX service.

### Proposed Models

```rust
pub struct PeriodSummary {
    pub summary_key: String,
    pub requested_start_date: NaiveDate,
    pub requested_end_date: NaiveDate,
    pub actual_start_date: Option<NaiveDate>,
    pub actual_end_date: Option<NaiveDate>,
    pub period: PeriodSummaryPeriod,
    pub currency: String,
    pub start_net_worth: Decimal,
    pub end_net_worth: Decimal,
    pub total_change: Decimal,
    pub money_movement: MoneyMovementSummary,
    pub value_movement: ValueMovementSummary,
    pub residual: PeriodSummaryResidual,
    pub warnings: Vec<PeriodSummaryWarning>,
}

pub struct MoneyMovementSummary {
    pub inflows_total: Decimal,
    pub outflows_total: Decimal,
    pub net: Decimal,
    pub top_inflows: Vec<MoneyMovementItem>,
    pub top_outflows: Vec<MoneyMovementItem>,
}

pub struct MoneyMovementItem {
    pub activity_id: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub date: NaiveDate,
    pub activity_type: String,
    pub amount_base: Decimal,
    pub amount_original: Decimal,
    pub original_currency: String,
    pub note: Option<String>,
}

pub struct ValueMovementSummary {
    pub gains_total: Decimal,
    pub losses_total: Decimal,
    pub net: Decimal,
    pub top_gains: Vec<ValueMovementItem>,
    pub top_losses: Vec<ValueMovementItem>,
}

pub struct ValueMovementItem {
    pub holding_id: String,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub name: String,
    pub symbol: Option<String>,
    pub amount_base: Decimal,
    pub percent_change: Option<Decimal>,
    pub reason: ValueMovementReason,
}
```

`summary_key` is a stable identity for the summary period, such as
`monthly:2026-06-01:2026-06-30:USD`. V1 does not need to store generated
summaries, but this key keeps the response compatible with a future saved
summary table and notification workflow.

### Money Movement Calculation

Use the existing flow classifier.

For portfolio-level summaries:

- Include deposits and withdrawals.
- Include `TRANSFER_IN` and `TRANSFER_OUT` only when marked external.
- Include `CREDIT` subtype `BONUS` as external.
- Exclude internal buys, sells, dividends, interest, fees, taxes, splits, and
  ordinary transfers.

For each included activity:

- Convert to base currency using the activity date.
- Preserve `notes`.
- Rank inflows and outflows separately by absolute base-currency amount.

### Value Movement Calculation

For V1, calculate holding-level movement using period start and end holdings.

For each holding:

1. Find start quantity/value as of the period start.
2. Find end quantity/value as of the period end.
3. Subtract external money movement that should not count as market movement.
4. Attribute the remaining change to value movement.

Important rule: do not mix buys/sells or external cash flows into market gain
and loss rankings. If the service cannot cleanly separate quantity change from
price change for a holding, use a conservative reason such as `residual` and
surface a warning.

For alternative assets and liabilities:

- Use valuation history and latest quote/valuation records.
- Treat liability balance decreases as positive value movement for net worth.
- Treat liability balance increases as negative value movement for net worth.
- If the value is stale, include the item only if it has reliable start/end
  values, and add a warning.

## API Design

Add shared command:

```text
get_period_summary(startDate, endDate, period)
```

Web endpoint:

```text
GET /api/v1/period-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&period=weekly|monthly|custom
```

Tauri command:

```text
get_period_summary
```

Frontend adapter:

```text
apps/frontend/src/adapters/shared/period-summary.ts
```

## Frontend Design

Add a summary surface that can be used from Dashboard first, and later from a
dedicated Reports/Statements page.

Suggested components:

- `PeriodSummaryCard`
- `NetWorthBridge`
- `MirroredContributorChart`
- `MoneyMovementLane`
- `ValueMovementLane`
- `PeriodSummaryWarnings`

The mirrored chart should be reusable for both lanes. It should accept two
ranked arrays: negative items and positive items.

### Future Summary Archive

V1 shows a dynamic summary for the Dashboard's selected period. It should not
create a full archive UI yet, but the design must leave room for one.

Future archive shape:

- Weekly and monthly summaries listed like statements.
- Each record stores `summary_key`, period type, start/end dates, currency,
  generated timestamp, and read/unread state.
- Opening a saved record can either load stored snapshot data or recompute with
  a clear `lastGeneratedAt` indicator.

Open product decision:

- If the user edits past transactions, saved summaries can either be regenerated
  so they always reflect current data, or kept immutable as historic records.
- Regeneration keeps numbers current but can make old notifications/statements
  change after the user already read them.
- Immutable records are easier to trust as "what the app said at the time," but
  they require an explicit correction or superseded-summary model when past data
  changes.
- Decide this before implementing the saved-summary archive or notification
  workflow.

### Future Notification Center Entry

V1 should not depend on notifications, but it should be compatible with them.

Future notification shape:

- When a new weekly/monthly summary becomes available, create a notification
  such as `June summary is ready`.
- The notification deep-links to the relevant period summary.
- Read/unread state should be tied to the saved summary record, not only to the
  notification row.

Accessibility:

- Each chart row must expose signed amount text, not only bar length.
- The zero-axis should be visually obvious.
- Gains and losses must not rely on color alone.

## Empty and Warning States

If there is not enough data:

- Show the start/end range that was requested.
- Explain that at least two valuation points are needed.
- Do not invent contributors.

If some data is incomplete:

- Show the reliable contributors.
- Show a residual/data-gap row.
- List concise warnings such as stale valuation, missing quote, missing FX, or
  insufficient holding history.

## V1 Scope

Include:

- Weekly, monthly, and custom date ranges.
- Full net worth bridge.
- Account/activity-level money movement.
- Holding-level value movement.
- Top 3 inflows/outflows.
- Top 5 value gains/losses.
- Activity notes for money movement.
- Residual/data-gap disclosure.
- Stable `summary_key` in the response for future archive and notification
  support.

Defer:

- Generated natural-language narrative.
- Exportable PDF statement.
- Stored summary records and historical summary list.
- Notification-center alerts for new summaries.
- Strict institutional-grade factor attribution.
- Deep splitting of value movement into pure price, FX, income, and quantity
  effects for every holding.
- Editable note categorization rules.

## Verification Plan

Backend tests:

- Period with only salary deposit: money movement explains the change.
- Period with only withdrawal: outflow appears in top losses for money movement.
- Period with no cash flow and one holding price gain: value movement explains
  the change.
- Period with one large holding loss and several small gains: mirrored chart data
  ranks both sides correctly.
- Internal transfer is excluded from portfolio-level money movement.
- External transfer keeps activity notes in the response.
- Liability payoff with tracked liability reduces cash and liability without
  double-counting net worth loss.
- Missing quote/FX produces warning and residual rather than fabricated
  attribution.

Frontend tests:

- Net worth bridge shows start, money movement, value movement, residual, and
  end.
- Mirrored contributor chart keeps one central axis and ranks each side by
  absolute amount.
- Money movement lane renders notes.
- Empty state appears when there are fewer than two valuation points.

Manual verification:

- Run `pnpm type-check`.
- Run focused Rust tests for the new service.
- Start the app and test a weekly and monthly range with known sample data.
- Resize the summary view to verify the central mirrored-chart axis stays
  straight on desktop and mobile.
