# Time Deposit Account Settlement Design

**Goal:** Link time deposits to real accounts and settle matured deposits back
to account cash without manually editing holdings.

## Decision

Time deposits should become account-held alternative assets. The asset remains
the stable record for the deposit contract. Holdings remain calculated from
activities.

This means Panorama should not "move a holding" directly. It should create the
right activities and let the existing cash, position, holding, and portfolio
recalculation logic do the rest.

## Source Of Truth

The source records are:

- asset: the time deposit contract and metadata
- quote: manual valuation snapshots for the asset
- activity: cash and position movement in the linked account
- holding: calculated read model from snapshots and activities

## Metadata

Add account and settlement fields to the existing time deposit metadata:

```json
{
  "panorama_category": "time_deposit",
  "sub_type": "time_deposit",
  "linked_account_id": "account-id",
  "principal": 100000,
  "start_date": "2026-07-02",
  "maturity_date": "2026-10-02",
  "quoted_annual_rate": 3.2,
  "guaranteed_maturity_value": 100806.58,
  "status": "active",
  "opening_activity_id": "activity-id",
  "settlement_date": null,
  "settlement_account_id": null,
  "settlement_activity_ids": null,
  "settled_principal": null,
  "settled_interest": null,
  "actual_maturity_value": null
}
```

The linked account is required for new deposits. Existing standalone time
deposits can keep working until edited or settled.

## Opening Flow

When the user creates a time deposit:

1. Create the time deposit asset with existing alternative asset logic.
2. Create a `BUY` activity in the linked account:
   - quantity: `1`
   - unit price: principal
   - asset: the newly created time deposit asset
   - currency: time deposit currency
3. Store the created activity ID in metadata as `opening_activity_id`.

Result:

- account cash decreases by principal
- a one-unit time deposit position appears in the account
- total net worth is unchanged by the opening movement

## Active Valuation

The existing time-deposit calculation remains simple annual accrual using
Actual/365.

For account-held time deposits, live holding valuation should use the derived
time-deposit value instead of only the latest manual quote.

This should be implemented as a time-deposit special case inside the existing
alternative asset valuation path, not as a separate holding system.

Historical daily quote synthesis remains out of scope. The opening quote and
settlement quote are enough for this settlement feature.

## Settle To Cash Flow

The action is user-confirmed, not automatic. The user can accept defaults or
adjust actual settlement date and payout.

Defaults:

- settlement date: maturity date
- principal returned: principal
- interest: maturity value minus principal
- maturity value: guaranteed value if known, otherwise derived from rate

On confirmation, Panorama creates one grouped activity batch:

1. `SELL` activity
   - account: settlement account, defaulting to linked account
   - asset: time deposit asset
   - quantity: `1`
   - unit price: settled principal
   - purpose: return locked principal to cash
2. `INTEREST` activity if interest is positive
   - account: same settlement account
   - amount: settled interest
   - purpose: record income separately from principal

Then Panorama updates the asset metadata:

- `status = "closed"`
- `settlement_date`
- `settlement_account_id`
- `settlement_activity_ids`
- `settled_principal`
- `settled_interest`
- `actual_maturity_value`

Optionally, it also writes a zero valuation quote on the settlement date.

Result:

- time deposit position is removed from the account
- account cash increases by principal plus interest
- principal is not treated as new contribution
- interest is visible as income

## Why Not Transfer

A transfer moves cash between accounts. A time deposit maturity is not a cash
transfer from another account in Panorama. It is redemption of an account-held
asset plus income.

Using `BUY`, `SELL`, and `INTEREST` reuses the existing logic more accurately:

- `BUY` already reduces cash and creates a position
- `SELL` already removes a position and returns cash
- `INTEREST` already increases cash without treating it as new contributed
  capital

## Closed Asset Treatment

Closed time deposits should not continue to appear as active alternative
holdings or standalone net worth assets.

The closed asset can remain in the database for history, audit, and activity
links. The dashboard can later add a closed/history view, but the active view
should filter it out.

## Testing

The implementation should verify:

- opening creates a time deposit asset and `BUY` activity
- settlement creates `SELL` and `INTEREST` activities
- settlement is blocked if the deposit is already closed
- account cash changes correctly after recalculation
- closed time deposits are not counted as standalone alternative assets
- active account-held time deposits use derived live value

