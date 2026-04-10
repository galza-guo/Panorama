# Holdings To Transactions Bootstrap Design

**Goal:** Convert local `HOLDINGS` accounts in the user's Panorama database into `TRANSACTIONS` accounts without reconstructing full historical trades, while preserving each account's current positions, cost basis, cash balances, and current valuation behavior as closely as possible.

**Context**

The local database at `/Users/guolite/Library/Application Support/com.gallantguo.panorama/app.db` currently has:

- 13 `HOLDINGS` accounts
- 0 `TRANSACTIONS` accounts
- sparse legacy `activities` data that does not represent complete trading history
- recent manual snapshots that appear to be the most trustworthy source of current account state

The current snapshots are good for "what is held now", but not sufficient for future realized P&L in `TRANSACTIONS` mode unless we create opening lots. Manual snapshots currently store positions with empty `lots`, so simply flipping `tracking_mode` would break FIFO-based sell cost relief.

**Recommendation**

Use each account's latest trusted snapshot as an opening balance and rebuild that account from there:

1. Backup the live SQLite database before any writes.
2. For each target account, pick one trusted opening snapshot.
3. Delete that account's existing activities.
4. Delete that account's snapshots and valuation history.
5. Recreate the opening state as synthetic opening activities:
   - one `TRANSFER_IN` per current position
   - one cash opening activity per current cash currency
6. Switch the account to `TRANSACTIONS`.
7. Recalculate holdings snapshots and valuations.
8. Verify that current positions, cost basis, cash balances, and total value match pre-migration values within tolerance.

This intentionally resets historical accounting before the opening date. It does not attempt to recreate already-realized gains from older closed positions.

**Opening Date Options**

Option A, recommended: use each account's latest trusted snapshot date.

- Preserves recent market-move history between that snapshot date and today.
- Better if the user wants to keep as much recent chart history as possible.

Option B: use one common opening date of "today".

- Simpler mental model.
- Resets all transaction-mode history to today.

Both preserve current state. They differ only in where the new transaction ledger begins.

**Trusted Snapshot Rules**

- Prefer the latest non-calculated snapshot for each account.
- Ignore sparse legacy activities as source-of-truth.
- If the latest snapshot is empty and the account is archived, allow migration to produce an empty `TRANSACTIONS` account.
- If the latest day has both `MANUAL_ENTRY` and `CALCULATED`, trust the non-calculated snapshot.

**Data Invariants To Preserve**

For each migrated account, post-migration current state should match pre-migration current state on:

- account currency
- position count
- per-position asset id
- per-position quantity
- per-position total cost basis
- per-position average cost
- cash balances by currency
- latest total account value

Small differences caused by quote refresh timing should be treated separately from migration correctness.

**Migration Shape**

For each position in the opening snapshot:

- create one `TRANSFER_IN`
- set `asset_id`, `quantity`, `unit_price`, `currency`
- set `metadata.flow.is_external = true`
- use zero fee

For each cash balance:

- create one opening cash-flow activity in that cash currency
- preserve amount exactly
- classify it as external so the transaction ledger has an explicit opening cash balance

Because this is a baseline bootstrap, there is no attempt to split a current position into historical lots. Each holding becomes one opening lot.

**Verification**

Before changing an account, capture:

- latest trusted snapshot summary
- latest valuation summary
- existing activity count

After changing the account, verify:

- mode is `TRANSACTIONS`
- recalculated latest holdings equal the baseline snapshot
- recalculated latest valuation equals the baseline valuation within tolerance
- newly created activities count matches expected opening entries

**Rollback**

- Primary rollback is restoring the pre-migration SQLite backup.
- Do not rely on hand-written reverse SQL.

