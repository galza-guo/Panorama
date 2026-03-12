# Time Deposit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a specialized `Time Deposit` asset workflow with a dedicated page, editor sheet, and automatic current-value derivation while keeping the underlying storage model as Panorama metadata on top of alternative assets.

**Architecture:** Reuse the existing alternative-asset create/update APIs with `kind: "other"` and Panorama metadata markers for `time_deposit`. Add a dedicated front-end workflow similar to `Insurance`, and derive effective holding values in the alternative-asset service so portfolio views stay consistent.

**Tech Stack:** React, TypeScript, Vitest, existing alternative asset hooks/mutations, Rust `wealthfolio-core` alternative asset service, Panorama metadata helpers.

---

### Task 1: Define Time Deposit metadata contract and frontend math helpers

**Files:**
- Modify: `apps/frontend/src/lib/panorama-asset-attributes.ts`
- Modify: `apps/frontend/src/lib/panorama-asset-attributes.test.ts`
- Create: `apps/frontend/src/lib/time-deposit-calculations.ts`
- Create: `apps/frontend/src/lib/time-deposit-calculations.test.ts`

**Step 1: Write the failing tests**

Add tests that cover:

- time-deposit classification from Panorama metadata
- metadata builder / patch builder behavior
- rate-driven maturity derivation
- maturity-driven implied-rate derivation
- derived current value before and after maturity
- manual override precedence

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/lib/panorama-asset-attributes.test.ts apps/frontend/src/lib/time-deposit-calculations.test.ts`
Expected: FAIL because time-deposit metadata helpers and math utilities do not exist.

**Step 3: Write minimal implementation**

Implement:

- `isTimeDepositAsset()`
- `buildTimeDepositMetadata()`
- `buildTimeDepositMetadataPatch()`
- focused calculation helpers using simple annual accrual and Actual/365

Keep derived metrics pure and side-effect free.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/lib/panorama-asset-attributes.test.ts apps/frontend/src/lib/time-deposit-calculations.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/lib/panorama-asset-attributes.ts apps/frontend/src/lib/panorama-asset-attributes.test.ts apps/frontend/src/lib/time-deposit-calculations.ts apps/frontend/src/lib/time-deposit-calculations.test.ts
git commit -m "feat: add time deposit metadata helpers"
```

### Task 2: Derive effective current value in backend alternative holdings

**Files:**
- Modify: `crates/core/src/assets/alternative_assets_service.rs`
- Test: `crates/core/src/assets/alternative_assets_service.rs`

**Step 1: Write the failing tests**

Add service tests that expect:

- Panorama `time_deposit` metadata is detected
- derived current value is returned for active deposits
- maturity value is returned once maturity date is reached
- manual override value wins when configured
- principal and start date still map to purchase fields

**Step 2: Run test to verify it fails**

Run: `cargo test -p wealthfolio-core panorama time_deposit -- --nocapture`
Expected: FAIL because time-deposit derivation is not implemented in the alternative asset service.

**Step 3: Write minimal implementation**

Add small helper logic in the service to:

- detect Panorama time deposits from metadata
- parse principal, dates, rate, maturity value, and override fields
- compute the effective `market_value` for holdings
- preserve existing behavior for all non-time-deposit assets

Do not add synthetic quote-history writes in this task.

**Step 4: Run test to verify it passes**

Run: `cargo test -p wealthfolio-core panorama time_deposit -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/core/src/assets/alternative_assets_service.rs
git commit -m "feat: derive time deposit values in alternative holdings"
```

### Task 3: Build the Time Deposit editor sheet

**Files:**
- Create: `apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.tsx`
- Test: `apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.test.tsx`

**Step 1: Write the failing tests**

Add editor tests that cover:

- create mode defaults
- edit mode loading existing metadata
- rate-driven preview updates
- maturity-driven preview updates
- manual override toggle and field visibility
- required-field validation

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.test.tsx`
Expected: FAIL because the editor sheet does not exist.

**Step 3: Write minimal implementation**

Create a dedicated editor sheet styled like the existing insurance / MPF editors.

Include:

- base identity fields
- principal, start date, maturity date
- quoted annual rate and maturity value inputs
- live derived preview area
- manual current-value override controls
- notes

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.tsx apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.test.tsx
git commit -m "feat: add time deposit editor sheet"
```

### Task 4: Add the Time Deposits dashboard page

**Files:**
- Create: `apps/frontend/src/pages/time-deposits/time-deposits-dashboard.tsx`
- Create: `apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx`
- Modify: `apps/frontend/src/routes.tsx`

**Step 1: Write the failing tests**

Add dashboard tests that cover:

- empty state
- time-deposit holdings filtering
- summary-card totals
- create flow payload shape
- edit flow metadata / valuation update behavior

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx`
Expected: FAIL because the dashboard page does not exist.

**Step 3: Write minimal implementation**

Build a dedicated page that:

- filters alternative holdings with `isTimeDepositAsset()`
- uses the existing alternative asset mutations
- creates `OTHER` assets with Panorama time-deposit metadata
- updates metadata and valuation using the dedicated editor sheet
- registers a static route at `/time-deposits`

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/time-deposits/time-deposits-dashboard.tsx apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx apps/frontend/src/routes.tsx
git commit -m "feat: add time deposit dashboard page"
```

### Task 5: Integrate Time Deposit display and editing into shared asset views

**Files:**
- Modify: `apps/frontend/src/pages/asset/alternative-asset-content.tsx`
- Modify: `apps/frontend/src/pages/asset/asset-profile-page.tsx`
- Modify: `apps/frontend/src/pages/asset/asset-utils.ts`
- Modify: `apps/frontend/src/pages/asset/assets-page.tsx`
- Modify: `apps/frontend/src/pages/asset/assets-table.tsx`
- Modify: `apps/frontend/src/pages/asset/assets-table-mobile.tsx`

**Step 1: Write the failing tests**

Add or extend tests to verify:

- time deposits get a specialized badge / label
- detail rows show principal, rate, maturity value, and days left
- shared asset tables use `Edit Time Deposit`
- assets page offers a specialized create / edit path consistent with Panorama flows

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/pages/asset`
Expected: FAIL because shared asset views do not recognize time deposits.

**Step 3: Write minimal implementation**

Integrate the new subtype into shared UI so it behaves like an existing Panorama-specialized asset without disturbing unrelated alternative-asset behavior.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/pages/asset`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/asset/alternative-asset-content.tsx apps/frontend/src/pages/asset/asset-profile-page.tsx apps/frontend/src/pages/asset/asset-utils.ts apps/frontend/src/pages/asset/assets-page.tsx apps/frontend/src/pages/asset/assets-table.tsx apps/frontend/src/pages/asset/assets-table-mobile.tsx
git commit -m "feat: integrate time deposits into shared asset views"
```

### Task 6: Verify full Time Deposit flow

**Files:**
- Modify: `README.md` (only if the specialized asset list should mention Time Deposits)

**Step 1: Run focused frontend tests**

Run: `pnpm --filter frontend test -- --run apps/frontend/src/lib/time-deposit-calculations.test.ts apps/frontend/src/pages/time-deposits/time-deposits-dashboard.test.tsx apps/frontend/src/pages/time-deposits/components/time-deposit-editor-sheet.test.tsx`
Expected: PASS

**Step 2: Run focused Rust tests**

Run: `cargo test -p wealthfolio-core panorama time_deposit -- --nocapture`
Expected: PASS

**Step 3: Run compile / type checks**

Run: `pnpm type-check`
Expected: PASS

Run: `cargo check`
Expected: PASS

**Step 4: Update docs if needed**

If the product surface now clearly includes Time Deposits, update the specialized-assets wording in `README.md`.

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: mention time deposit specialized workflow"
```
