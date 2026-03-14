# Insurance Design

**Goal:** Add a minimal Panorama-specialized `Insurance` workflow that feels first-class in the UI while still storing records as alternative assets with `kind: "other"` plus Panorama metadata.

## Product Shape

Version 1 is intentionally narrow:

- one policy = one asset
- user enters current `Cash Value`
- optional `Total Premiums Paid`
- optional `Start Date`
- payment status is either `Paying` or `Paid-up`
- optional `Next Due Date` is only a reminder

This is not an insurance-industry system. It is a lightweight convenience layer on top of Panorama's existing alternative asset model.

## Why This Shape

The product problem is not underwriting accuracy. It is easier entry and more meaningful display for a class of assets users already track manually.

This version stays simple on purpose:

- no premium schedule table
- no yearly checklist
- no IRR / policy illustration math
- no liability auto-generation
- no `Closed` state

Those can be added later if we have evidence that the minimal model is too limiting.

## Data Model

The asset remains an alternative asset with API kind `other`.

Panorama metadata marks it as insurance:

```json
{
  "panorama_category": "insurance",
  "sub_type": "insurance"
}
```

Version 1 metadata fields:

- `owner`
- `policy_type`
- `insurance_provider`
- `start_date`
- `valuation_date`
- `total_paid_to_date`
- `payment_status`
- `next_due_date`

Notes:

- `marketValue` remains the current cash value
- `valuation_date` is the current cash-value date and defaults to today in v1
- `next_due_date` is only used for reminder display when `payment_status = paying`

## UI

Version 1 adds or updates four surfaces:

1. `Add Asset`
   - add a dedicated `Insurance` tile
   - open a specialized editor sheet, not the generic `Other Asset` form
2. `Insurance` page
   - show policy list, cash value, total premiums paid, payment status, and due reminder
3. `Assets` / holdings list
   - show subtype label `Insurance` instead of `Other`
   - show `Cash Value` badge before the amount
   - show `Next payment in Xd` or `Paid-up` badge where applicable
4. shared metadata helpers
   - centralize reminder/date/status logic so the page and holdings list stay consistent

## Out of Scope

- payment records
- future cashflow projections
- insurer-specific surrender / loan / bonus calculations
- annuity support
- endowment maturity modeling
- asset/liability split accounting
