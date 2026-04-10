# Holdings To Transactions Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Safely convert the user's local Panorama `HOLDINGS` accounts into `TRANSACTIONS` accounts using opening-balance activities derived from trusted snapshots.

**Architecture:** Use a one-off Python migration script against the local SQLite database. The script will create a backup, migrate one account at a time inside transactions, recalculate derived tables through deterministic SQL-compatible data writes, and run per-account state verification before moving on.

**Tech Stack:** Python 3 stdlib (`sqlite3`, `json`, `datetime`, `pathlib`, `decimal`), local SQLite database, Panorama schema conventions

---

### Task 1: Record migration assumptions

**Files:**
- Modify: `/Users/guolite/GitHub/Panorama/docs/plans/2026-04-09-holdings-to-transactions-design.md`
- Modify: `/Users/guolite/GitHub/Panorama/docs/plans/2026-04-09-holdings-to-transactions-implementation.md`

**Step 1:** Confirm opening-date policy before writes.

**Step 2:** Treat latest non-calculated snapshot as trusted source for each account.

**Step 3:** Include archived accounts unless the user says otherwise.

### Task 2: Create migration script

**Files:**
- Create: `/Users/guolite/GitHub/Panorama/temp/2026-04-09-holdings-to-transactions-bootstrap.py`

**Step 1:** Add read-only inventory helpers for accounts, snapshots, valuations, and activities.

**Step 2:** Add SQLite backup creation using the SQLite backup API.

**Step 3:** Add per-account migration routine:
- load baseline snapshot and valuation
- delete existing account activities
- delete account snapshots
- delete account valuations
- insert opening activities
- switch account mode to `TRANSACTIONS`

**Step 4:** Add post-migration verification routine comparing baseline and rebuilt current state.

**Step 5:** Add dry-run and execute modes.

### Task 3: Dry-run inventory

**Files:**
- Use: `/Users/guolite/GitHub/Panorama/temp/2026-04-09-holdings-to-transactions-bootstrap.py`

**Step 1:** Run the script in dry-run mode.

**Step 2:** Print, for each account:
- chosen opening snapshot date
- positions to bootstrap
- cash balances to bootstrap
- counts of old activities/snapshots/valuations to remove

**Step 3:** Confirm the output matches expectations before writes.

### Task 4: Execute one account and verify

**Files:**
- Use: `/Users/guolite/GitHub/Panorama/temp/2026-04-09-holdings-to-transactions-bootstrap.py`

**Step 1:** Execute migration for one non-archived account.

**Step 2:** Verify baseline versus rebuilt state.

**Step 3:** Stop on any mismatch larger than tolerance.

### Task 5: Execute remaining accounts sequentially

**Files:**
- Use: `/Users/guolite/GitHub/Panorama/temp/2026-04-09-holdings-to-transactions-bootstrap.py`

**Step 1:** Process remaining accounts one at a time.

**Step 2:** Run verification after each account before continuing.

**Step 3:** Produce a final summary of migrated accounts and any skipped accounts.

### Task 6: Final verification

**Files:**
- Use: `/Users/guolite/GitHub/Panorama/temp/2026-04-09-holdings-to-transactions-bootstrap.py`

**Step 1:** Re-query the database for:
- `tracking_mode` counts
- latest holdings summaries
- latest valuations
- new opening activity counts

**Step 2:** Confirm there are no remaining `HOLDINGS` accounts intended for migration.

**Step 3:** Record backup path and verification summary in the final response.

