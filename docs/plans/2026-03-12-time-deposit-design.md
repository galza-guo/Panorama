# Time Deposit Design

**Goal:** Add a simple Panorama-specialized `Time Deposit` workflow with its own page and editor, while reusing the existing alternative asset model and automatically deriving current value from term-deposit metadata.

## Context

Panorama already has two specialized asset workflows layered on top of alternative assets:

- `Insurance`, implemented as `OTHER` plus Panorama metadata
- `MPF`, implemented as either first-class `MPF` or Panorama-marked metadata

`Time Deposit` should follow the lighter `Insurance` pattern, not the heavier `MPF` pattern.

This keeps the change surgical:

- no new core asset kind
- no database migration
- no new activity model
- no cashflow engine

## Product Shape

Version 1 adds a dedicated `Time Deposits` page and a dedicated editor sheet.

It is a specialized asset workflow, but still backed by the existing alternative asset create/update mutations.

Users should be able to:

- create a time deposit from either quoted annual rate or known maturity value
- see automatically derived current value
- see maturity value, days left, and annualized return
- override the derived current value when they have a bank-provided current amount

## Scope

### In Scope

- single deposit at start
- single payout at maturity
- fixed start date and maturity date
- quoted annual rate and/or guaranteed maturity value
- automatic current-value derivation
- manual current-value override
- dedicated page, editor sheet, and asset detail rows

### Out of Scope

- auto-rollover / renewal chains
- partial withdrawals
- periodic interest payouts
- multiple tranches inside one record
- country-specific day-count conventions beyond one fixed rule
- synthetic daily quote history

## Data Model

The asset remains an alternative asset with API kind `other`.

Panorama metadata identifies it:

```json
{
  "panorama_category": "time_deposit",
  "sub_type": "time_deposit"
}
```

Recommended metadata fields:

- `provider`
- `owner`
- `principal`
- `start_date`
- `maturity_date`
- `quoted_annual_rate`
- `guaranteed_maturity_value`
- `valuation_mode`
- `current_value_override`
- `valuation_date`
- `status`

Field meanings:

- `principal`: original deposit amount
- `start_date`: deposit start date
- `maturity_date`: contractual maturity date
- `quoted_annual_rate`: optional quoted annual rate as a percent, stored exactly as entered
- `guaranteed_maturity_value`: optional contractual maturity proceeds
- `valuation_mode`: `derived` or `manual`
- `current_value_override`: optional bank-provided current amount that overrides derived value
- `valuation_date`: date associated with the manual override if one exists
- `status`: `active`, `matured`, or `closed`

The asset's stored `purchase_price` and `purchase_date` should continue to map to:

- `purchase_price = principal`
- `purchase_date = start_date`

This preserves existing gain / holding calculations where useful.

## Calculation Rules

Version 1 uses one explicit convention:

- accrual model: simple annual accrual
- day count: Actual/365
- payout mode: principal plus interest at maturity

### Input Paths

The editor should support two valid entry paths:

1. Rate-driven
   - user enters `principal`, `start_date`, `maturity_date`, `quoted_annual_rate`
   - system derives `guaranteed_maturity_value`
2. Maturity-driven
   - user enters `principal`, `start_date`, `maturity_date`, `guaranteed_maturity_value`
   - system derives implied annualized return

If both `quoted_annual_rate` and `guaranteed_maturity_value` are present:

- preserve both values
- show a non-blocking mismatch hint if they imply materially different returns
- do not silently rewrite either field

### Derived Current Value

For `valuation_mode = derived`:

- before maturity, current value is principal plus accrued simple interest based on elapsed days
- on or after maturity, current value is the guaranteed maturity value if known, otherwise the derived maturity amount from quoted rate

For `valuation_mode = manual`:

- current value uses `current_value_override`
- the UI still shows the derived estimate as reference

Derived values should include:

- `days_elapsed`
- `days_left`
- `progress_pct`
- `estimated_current_value`
- `expected_maturity_value`
- `holding_period_return`
- `annualized_return`

## Backend Behavior

Automatic current value should be computed in the alternative-holdings layer, not only in the page component.

Reason:

- the holdings list, portfolio totals, and detail screens need the same value
- front-end-only derivation would make views disagree

Recommended behavior in `alternative_assets_service.rs`:

- detect Panorama `time_deposit` metadata
- derive effective market value when `valuation_mode = derived`
- use override value when `valuation_mode = manual`
- keep quote history behavior unchanged for v1

Version 1 accepts one tradeoff:

- the asset can have live derived current value in holdings and summary views
- quote history remains based on recorded quotes rather than a synthesized daily accrual curve

## UI

The page should match existing Panorama specialized pages such as `Insurance` and `MPF`.

Recommended route and label:

- route: `/time-deposits`
- page title: `Time Deposits`

Recommended summary cards:

- Deposits
- Current Value
- Maturity Value
- Days Left

Recommended row fields:

- name
- provider
- principal
- current value
- maturity value
- days left
- maturity date

The editor sheet should:

- look consistent with the existing specialized editor sheets
- allow switching between rate-driven and maturity-driven entry
- show live derived previews
- allow manual current-value override without hiding the derived estimate

The asset profile should keep using the shared alternative-asset page shell and add time-deposit-specific detail rows.

## Classification and Display

`Time Deposit` should behave like a Panorama-specialized subtype of `OTHER`.

That means:

- a metadata classifier similar to `isInsuranceAsset()` / `isMpfAsset()`
- a display badge and label for time deposits
- specialized edit action text such as `Edit Time Deposit`

## Open Decisions

No blocking product questions remain for version 1.

Implementation assumptions:

- `Time Deposits` is not added to the primary sidebar navigation
- it is exposed through its dedicated route and any Panorama-specialized entry points we wire during implementation
- historical quote synthesis is postponed

## Success Criteria

The design is successful if:

- users can create a time deposit without understanding generic alternative-asset fields
- Panorama shows a live current value automatically
- the page and editor feel consistent with existing specialized asset flows
- the implementation does not require new core asset kinds or migrations
