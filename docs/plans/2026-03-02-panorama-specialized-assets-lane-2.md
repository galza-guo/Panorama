# Panorama Specialized Assets Lane 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port Panorama's Insurance experience onto the Wealthfolio v3 baseline using the existing alternative asset model, while adding the metadata seam needed for later MPF support.

**Architecture:** Keep Wealthfolio v3 core asset and valuation models intact. Add a thin Panorama frontend layer that classifies Insurance assets from alternative asset metadata, exposes dedicated `/insurance` navigation and pages, and widens the frontend metadata editing seam so structured JSON metadata can flow through without inventing a new backend model.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, Vitest, Rust core already present in v3

---

### Task 1: Plan The Metadata Seam

**Files:**
- Create: `/Users/guolite/GitHub/Panorama/docs/plans/2026-03-02-panorama-specialized-assets-lane-2.md`
- Modify: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/lib/types.ts`
- Modify: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/adapters/shared/alternative-assets.ts`
- Modify: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/pages/asset/alternative-assets/components/asset-details-sheet.tsx`

**Step 1: Write the failing test**

Create a small Vitest file that asserts:
- alternative asset update metadata can accept non-string JSON-safe values
- nested arrays and objects survive the conversion boundary needed by Panorama metadata

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --run apps/frontend/src/...`
Expected: Type or runtime mismatch because metadata is still constrained to `Record<string, string>`

**Step 3: Write minimal implementation**

Change the frontend typing and save callback signatures from string-only metadata to JSON-friendly metadata values without changing the backend command name or the broader alternative asset flow.

**Step 4: Run test to verify it passes**

Run the targeted Vitest command again.
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/lib/types.ts \
  apps/frontend/src/adapters/shared/alternative-assets.ts \
  apps/frontend/src/pages/asset/alternative-assets/components/asset-details-sheet.tsx
git commit -m "refactor: widen alternative asset metadata editing seam"
```

### Task 2: Port Panorama Insurance Metadata Helpers

**Files:**
- Create: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/lib/panorama-asset-attributes.ts`
- Test: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/lib/panorama-asset-attributes.test.ts`

**Step 1: Write the failing test**

Cover:
- insurance asset detection from `AlternativeAssetHolding`
- mutual exclusion between Insurance and MPF markers
- owner extraction
- numeric summary fields such as `total_paid_to_date` and `withdrawable_value`

**Step 2: Run test to verify it fails**

Run the targeted Vitest file.
Expected: FAIL because helper file does not exist yet.

**Step 3: Write minimal implementation**

Port only the helper logic needed by Insurance first. Keep the API compatible with later MPF work but avoid bringing over unused legacy asset-shape assumptions.

**Step 4: Run test to verify it passes**

Run the targeted Vitest file again.
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/lib/panorama-asset-attributes.ts \
  apps/frontend/src/lib/panorama-asset-attributes.test.ts
git commit -m "feat: add panorama specialized asset metadata helpers"
```

### Task 3: Add Insurance Routes And Navigation

**Files:**
- Modify: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/routes.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/pages/layouts/navigation/app-navigation.tsx`
- Create: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/pages/insurance/insurance-dashboard.tsx`

**Step 1: Write the failing test**

Add a routing or lightweight rendering test that proves:
- `/insurance` is reachable
- navigation includes Insurance
- empty state is shown when no Insurance assets are present

**Step 2: Run test to verify it fails**

Run the targeted test.
Expected: FAIL because route and page are missing.

**Step 3: Write minimal implementation**

Build an additive page that reads from existing alternative holdings queries, filters Insurance holdings via the new helper, and renders summary cards plus a list view.

**Step 4: Run test to verify it passes**

Run the targeted test again.
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/routes.tsx \
  apps/frontend/src/pages/layouts/navigation/app-navigation.tsx \
  apps/frontend/src/pages/insurance/insurance-dashboard.tsx
git commit -m "feat: add insurance dashboard to panorama v3"
```

### Task 4: Add Minimal Insurance Create And Edit Flow

**Files:**
- Create: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/pages/insurance/components/insurance-policy-editor-sheet.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/pages/insurance/insurance-dashboard.tsx`
- Modify: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/hooks/use-alternative-assets.ts`
- Modify: `/Users/guolite/GitHub/Panorama/.worktrees/upstream-v3-foundation/apps/frontend/src/adapters/shared/alternative-assets.ts`

**Step 1: Write the failing test**

Cover:
- create payload uses `AlternativeAssetKind.OTHER`
- Insurance-specific metadata fields are written into metadata
- edit flow preserves existing metadata while updating changed Insurance fields

**Step 2: Run test to verify it fails**

Run the targeted test.
Expected: FAIL because Insurance editor flow does not exist yet.

**Step 3: Write minimal implementation**

Reuse the v3 alternative asset mutation flow. Keep the create/edit surface small: name, owner, provider, valuation date, total paid, withdrawable value, notes, and current valuation.

**Step 4: Run test to verify it passes**

Run the targeted test again.
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/insurance/components/insurance-policy-editor-sheet.tsx \
  apps/frontend/src/pages/insurance/insurance-dashboard.tsx \
  apps/frontend/src/hooks/use-alternative-assets.ts \
  apps/frontend/src/adapters/shared/alternative-assets.ts
git commit -m "feat: add insurance asset editor flow"
```

### Task 5: Verify The Insurance Slice

**Files:**
- Review only

**Step 1: Run targeted tests**

Run:
- `pnpm test -- --run apps/frontend/src/lib/panorama-asset-attributes.test.ts`
- `pnpm test -- --run <metadata seam test file>`
- `pnpm test -- --run <insurance test file>`

Expected: PASS

**Step 2: Run project verification**

Run:
- `pnpm build:types`
- `pnpm build`

Expected: PASS, allowing pre-existing non-fatal warnings already known in v3

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: port panorama insurance workflow to v3"
```

### Task 6: Follow-Up For MPF

**Files:**
- Review only

**Step 1: Document remaining work**

Capture the remaining MPF-specific needs:
- `mpf_subfunds` editor UI
- summary and detail page
- validation for nested array metadata

**Step 2: Keep scope closed**

Do not implement MPF in this lane. Leave it for the next focused slice once Insurance is green.
