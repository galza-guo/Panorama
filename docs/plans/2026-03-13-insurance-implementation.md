# Insurance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimal specialized `Insurance` asset flow with dedicated add/edit entry points, shared reminder helpers, and first-class holdings display while keeping storage under alternative assets with Panorama metadata.

**Architecture:** Reuse the existing alternative-asset create/update mutations and persist insurance-specific fields in Panorama metadata. Keep the logic thin by centralizing subtype detection, payment reminder formatting, and cash-value display in `panorama-asset-attributes.ts`.

**Tech Stack:** React, TypeScript, Vitest, existing alternative asset hooks/mutations, Panorama metadata helpers.

---

### Task 1: Extend insurance metadata helpers

**Files:**
- Modify: `apps/frontend/src/lib/panorama-asset-attributes.ts`
- Modify: `apps/frontend/src/lib/panorama-asset-attributes.test.ts`

**Step 1: Write the failing test**

Cover:

- insurance metadata builder / patch builder
- new fields `start_date`, `payment_status`, `next_due_date`
- insurance subtype detection remains compatible with existing Panorama records

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/panorama-asset-attributes.test.ts`
Expected: FAIL because the insurance builder does not support the v1 fields yet.

**Step 3: Write minimal implementation**

Add:

- `payment_status`
- `next_due_date`
- helper logic for insurance reminder text and subtype display

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/panorama-asset-attributes.test.ts`
Expected: PASS

### Task 2: Rebuild the insurance editor around the v1 model

**Files:**
- Modify: `apps/frontend/src/pages/insurance/components/insurance-policy-editor-sheet.tsx`
- Create: `apps/frontend/src/pages/insurance/components/insurance-policy-editor-sheet.test.tsx`

**Step 1: Write the failing test**

Cover:

- `Cash Value` label
- base currency default
- `Paying` / `Paid-up` status toggle
- `Next Due Date` only when status is `Paying`
- owner stays optional

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/pages/insurance/components/insurance-policy-editor-sheet.test.tsx`
Expected: FAIL because the editor still uses the older current/withdrawable model.

**Step 3: Write minimal implementation**

Use existing app components and keep the form limited to:

- policy name
- currency
- cash value
- owner
- provider
- policy type
- start date
- payment status
- next due date
- total premiums paid
- notes

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/pages/insurance/components/insurance-policy-editor-sheet.test.tsx`
Expected: PASS

### Task 3: Update the Insurance page and Add Asset entry point

**Files:**
- Modify: `apps/frontend/src/pages/insurance/insurance-dashboard.tsx`
- Modify: `apps/frontend/src/pages/insurance/insurance-dashboard.test.tsx`
- Modify: `apps/frontend/src/pages/asset/alternative-assets/components/alternative-asset-quick-add-modal.tsx`
- Modify: `apps/frontend/src/pages/asset/alternative-assets/components/alternative-asset-quick-add-modal.test.tsx`

**Step 1: Write the failing test**

Cover:

- insurance-only filtering
- cash value / premium summary copy
- reminder and paid-up badges
- specialized quick-add tile
- create payload shape for insurance metadata

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/pages/insurance/insurance-dashboard.test.tsx src/pages/asset/alternative-assets/components/alternative-asset-quick-add-modal.test.tsx`
Expected: FAIL because the page and quick-add flow still use the older insurance model.

**Step 3: Write minimal implementation**

Keep:

- `kind: "other"` on create
- `valuation_date = today`
- notes handled through the existing metadata update mutation
- no new backend model

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/pages/insurance/insurance-dashboard.test.tsx src/pages/asset/alternative-assets/components/alternative-asset-quick-add-modal.test.tsx`
Expected: PASS

### Task 4: Make subtype display first-class in holdings

**Files:**
- Modify: `apps/frontend/src/pages/holdings/components/alternative-holdings-table.tsx`
- Modify: `apps/frontend/src/pages/holdings/components/alternative-holdings-list-mobile.tsx`
- Modify: `apps/frontend/src/pages/holdings/components/alternative-holdings-display.test.tsx`

**Step 1: Write the failing test**

Cover:

- `Insurance` subtype label instead of `Other`
- `Cash Value` badge before the amount
- `Next payment in Xd` reminder badge

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/pages/holdings/components/alternative-holdings-display.test.tsx`
Expected: FAIL because holdings still display insurance as generic `Other`.

**Step 3: Write minimal implementation**

Reuse the shared helper logic instead of duplicating:

- subtype label derivation
- reminder label formatting
- insurance cash-value display badge

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/pages/holdings/components/alternative-holdings-display.test.tsx`
Expected: PASS

### Task 5: Verify the full insurance v1 flow

**Step 1: Run focused tests**

Run: `pnpm --filter frontend exec vitest run src/lib/panorama-asset-attributes.test.ts src/pages/insurance/components/insurance-policy-editor-sheet.test.tsx src/pages/insurance/insurance-dashboard.test.tsx src/pages/asset/alternative-assets/components/alternative-asset-quick-add-modal.test.tsx src/pages/holdings/components/alternative-holdings-display.test.tsx`
Expected: PASS

**Step 2: Run type-check**

Run: `pnpm --filter frontend type-check`
Expected: PASS
