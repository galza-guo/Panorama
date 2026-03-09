# Buckets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an optional, standalone buckets module with dedicated storage, assignment mappings, label rendering, and an Insights allocation section, while preserving existing portfolio behavior when the feature is disabled.

**Architecture:** Add a new bucket domain with dedicated database tables and services, then expose it through Tauri/server APIs and frontend hooks. Keep `bucketsEnabled` as the only settings-level integration point, and resolve bucket membership at read time using holding override, account default, and `Unassigned` fallback rules.

**Tech Stack:** Rust, SQLite/Diesel, Tauri commands, Axum APIs, React, TanStack Query, existing Panorama settings and holdings UI.

---

### Task 1: Extend settings with a single `bucketsEnabled` switch

**Files:**
- Modify: `crates/core/src/settings/settings_model.rs`
- Modify: `crates/storage-sqlite/src/settings/repository.rs`
- Modify: `apps/server/src/api/settings.rs`
- Modify: `apps/frontend/src/lib/types.ts`
- Modify: `apps/frontend/src/lib/settings-provider.tsx`
- Modify: `apps/frontend/src/pages/settings/general/general-page.tsx`
- Test: `crates/storage-sqlite/src/settings/repository.rs`
- Test: `apps/frontend/src/pages/settings/general/general-page.tsx`

**Step 1: Write the failing tests**

Add tests that expect:

- settings can persist and read `bucketsEnabled`
- missing stored value defaults to `false`
- the General settings UI shows a toggle and updates state correctly

**Step 2: Run test to verify it fails**

Run: `cargo test -p wealthfolio-storage-sqlite settings -- --nocapture`
Expected: FAIL because `bucketsEnabled` is not modeled or persisted.

Run: `pnpm test -- --runInBand general-page`
Expected: FAIL because the General page has no bucket toggle.

**Step 3: Write minimal implementation**

Add `bucketsEnabled` to the settings model and repository default handling. Update the frontend settings types/provider and add a single toggle in General settings.

**Step 4: Run test to verify it passes**

Run: `cargo test -p wealthfolio-storage-sqlite settings -- --nocapture`
Expected: PASS

Run: `pnpm test -- --runInBand general-page`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/core/src/settings/settings_model.rs crates/storage-sqlite/src/settings/repository.rs apps/server/src/api/settings.rs apps/frontend/src/lib/types.ts apps/frontend/src/lib/settings-provider.tsx apps/frontend/src/pages/settings/general/general-page.tsx
git commit -m "feat: add buckets feature toggle"
```

### Task 2: Add bucket storage tables and repository layer

**Files:**
- Create: `crates/storage-sqlite/migrations/2026-03-09-000001_add_buckets_module/up.sql`
- Create: `crates/storage-sqlite/migrations/2026-03-09-000001_add_buckets_module/down.sql`
- Modify: `crates/storage-sqlite/src/schema.rs`
- Modify: `crates/storage-sqlite/src/lib.rs`
- Create: `crates/storage-sqlite/src/buckets/mod.rs`
- Create: `crates/storage-sqlite/src/buckets/model.rs`
- Create: `crates/storage-sqlite/src/buckets/repository.rs`
- Test: `crates/storage-sqlite/src/buckets/repository.rs`

**Step 1: Write the failing tests**

Add repository tests that cover:

- creating the system `Unassigned` bucket
- CRUD for user buckets
- storing account default assignments
- storing holding overrides using `(account_id, asset_id)`
- storing standalone asset assignments
- deleting a bucket and reassigning dependents to `Unassigned`

**Step 2: Run test to verify it fails**

Run: `cargo test -p wealthfolio-storage-sqlite buckets -- --nocapture`
Expected: FAIL because bucket tables and repositories do not exist.

**Step 3: Write minimal implementation**

Add the four bucket tables, Diesel schema, and a focused repository API. Seed or create the `Unassigned` system bucket as part of migration or repository initialization.

**Step 4: Run test to verify it passes**

Run: `cargo test -p wealthfolio-storage-sqlite buckets -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/storage-sqlite/migrations/2026-03-09-000001_add_buckets_module/up.sql crates/storage-sqlite/migrations/2026-03-09-000001_add_buckets_module/down.sql crates/storage-sqlite/src/schema.rs crates/storage-sqlite/src/lib.rs crates/storage-sqlite/src/buckets/mod.rs crates/storage-sqlite/src/buckets/model.rs crates/storage-sqlite/src/buckets/repository.rs
git commit -m "feat: add bucket storage module"
```

### Task 3: Add core bucket domain models and resolution service

**Files:**
- Create: `crates/core/src/buckets/mod.rs`
- Create: `crates/core/src/buckets/buckets_model.rs`
- Create: `crates/core/src/buckets/buckets_traits.rs`
- Create: `crates/core/src/buckets/buckets_service.rs`
- Modify: `crates/core/src/lib.rs`
- Test: `crates/core/src/buckets/buckets_service.rs`

**Step 1: Write the failing tests**

Add service tests for:

- holding override precedence over account default
- account default precedence over `Unassigned`
- standalone asset assignment resolution
- bucket allocation totals and percentages
- target percent and deviation calculation
- stable sort order in output

**Step 2: Run test to verify it fails**

Run: `cargo test -p wealthfolio-core buckets -- --nocapture`
Expected: FAIL because the bucket domain does not exist.

**Step 3: Write minimal implementation**

Define core models for bucket definitions, assignments, resolved labels, and Insights allocation output. Implement a service that resolves bucket membership and computes Insights-ready totals.

**Step 4: Run test to verify it passes**

Run: `cargo test -p wealthfolio-core buckets -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/core/src/buckets/mod.rs crates/core/src/buckets/buckets_model.rs crates/core/src/buckets/buckets_traits.rs crates/core/src/buckets/buckets_service.rs crates/core/src/lib.rs
git commit -m "feat: add bucket domain service"
```

### Task 4: Wire bucket services into Tauri and server APIs

**Files:**
- Create: `apps/tauri/src/commands/buckets.rs`
- Modify: `apps/tauri/src/commands/mod.rs`
- Modify: `apps/tauri/src/lib.rs`
- Modify: `apps/tauri/src/context/providers.rs`
- Create: `apps/server/src/api/buckets.rs`
- Modify: `apps/server/src/api.rs`
- Modify: `apps/server/src/main_lib.rs`
- Test: `apps/server/src/api/buckets.rs`

**Step 1: Write the failing tests**

Add API tests that expect:

- listing buckets
- creating and updating buckets
- deleting a user bucket
- listing and updating account defaults
- listing and updating holding overrides
- listing and updating standalone asset assignments
- returning bucket allocation data for Insights

**Step 2: Run test to verify it fails**

Run: `cargo test -p panorama buckets -- --nocapture`
Expected: FAIL because bucket commands and routes do not exist.

**Step 3: Write minimal implementation**

Expose a dedicated bucket command/API surface instead of hiding bucket behavior inside accounts or settings endpoints.

**Step 4: Run test to verify it passes**

Run: `cargo test -p panorama buckets -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/tauri/src/commands/buckets.rs apps/tauri/src/commands/mod.rs apps/tauri/src/lib.rs apps/tauri/src/context/providers.rs apps/server/src/api/buckets.rs apps/server/src/api.rs apps/server/src/main_lib.rs
git commit -m "feat: expose bucket APIs"
```

### Task 5: Add frontend types, adapters, query keys, and hooks

**Files:**
- Modify: `apps/frontend/src/lib/types.ts`
- Modify: `apps/frontend/src/lib/query-keys.ts`
- Create: `apps/frontend/src/adapters/shared/buckets.ts`
- Modify: `apps/frontend/src/adapters/shared/index.ts`
- Modify: `apps/frontend/src/adapters/web/core.ts`
- Create: `apps/frontend/src/hooks/use-buckets.ts`
- Test: `apps/frontend/src/hooks/use-buckets.test.ts`

**Step 1: Write the failing tests**

Add frontend tests for:

- bucket query hooks using the expected query keys
- bucket mutations invalidating bucket, holdings, and account-related caches
- typed parsing of Insights bucket allocation data

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand use-buckets`
Expected: FAIL because bucket adapters and hooks do not exist.

**Step 3: Write minimal implementation**

Add a dedicated bucket adapter and hook set mirroring the repository/API surface, plus query-key helpers for buckets, assignments, and allocation data.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand use-buckets`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/lib/types.ts apps/frontend/src/lib/query-keys.ts apps/frontend/src/adapters/shared/buckets.ts apps/frontend/src/adapters/shared/index.ts apps/frontend/src/adapters/web/core.ts apps/frontend/src/hooks/use-buckets.ts apps/frontend/src/hooks/use-buckets.test.ts
git commit -m "feat: add frontend bucket data layer"
```

### Task 6: Add the `Buckets` settings route and tab visibility rules

**Files:**
- Modify: `apps/frontend/src/routes.tsx`
- Modify: `apps/frontend/src/pages/settings/settings-layout.tsx`
- Create: `apps/frontend/src/pages/settings/buckets/buckets-page.tsx`
- Create: `apps/frontend/src/pages/settings/buckets/index.ts`
- Test: `apps/frontend/src/pages/settings/settings-layout.test.tsx`
- Test: `apps/frontend/src/pages/settings/buckets/buckets-page.test.tsx`

**Step 1: Write the failing tests**

Add tests that verify:

- the `Buckets` tab is hidden when `bucketsEnabled` is false
- the `Buckets` tab appears when `bucketsEnabled` is true
- direct navigation to `/settings/buckets` redirects or falls back safely when disabled

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand settings-layout buckets-page`
Expected: FAIL because the route and visibility logic do not exist.

**Step 3: Write minimal implementation**

Add the new route and sidebar item, but gate both behind `bucketsEnabled`. Keep the page shell simple first.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand settings-layout buckets-page`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/routes.tsx apps/frontend/src/pages/settings/settings-layout.tsx apps/frontend/src/pages/settings/buckets/buckets-page.tsx apps/frontend/src/pages/settings/buckets/index.ts apps/frontend/src/pages/settings/settings-layout.test.tsx apps/frontend/src/pages/settings/buckets/buckets-page.test.tsx
git commit -m "feat: add buckets settings route"
```

### Task 7: Build bucket management UI in the `Buckets` tab

**Files:**
- Modify: `apps/frontend/src/pages/settings/buckets/buckets-page.tsx`
- Create: `apps/frontend/src/pages/settings/buckets/components/bucket-list.tsx`
- Create: `apps/frontend/src/pages/settings/buckets/components/bucket-form.tsx`
- Create: `apps/frontend/src/pages/settings/buckets/components/account-defaults-panel.tsx`
- Create: `apps/frontend/src/pages/settings/buckets/components/holding-overrides-panel.tsx`
- Create: `apps/frontend/src/pages/settings/buckets/components/asset-assignments-panel.tsx`
- Test: `apps/frontend/src/pages/settings/buckets/components/bucket-form.test.tsx`
- Test: `apps/frontend/src/pages/settings/buckets/components/holding-overrides-panel.test.tsx`

**Step 1: Write the failing tests**

Add tests that cover:

- creating and editing buckets
- enforcing system `Unassigned` restrictions
- assigning account defaults
- assigning holding overrides
- assigning standalone asset buckets
- falling back to `Unassigned` after deleting a user bucket

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand bucket-form holding-overrides-panel`
Expected: FAIL because the management UI does not exist.

**Step 3: Write minimal implementation**

Build a pragmatic v1 editor focused on search, assignment, and CRUD. Do not add drag-and-drop or advanced batch actions yet.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand bucket-form holding-overrides-panel`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/settings/buckets/buckets-page.tsx apps/frontend/src/pages/settings/buckets/components/bucket-list.tsx apps/frontend/src/pages/settings/buckets/components/bucket-form.tsx apps/frontend/src/pages/settings/buckets/components/account-defaults-panel.tsx apps/frontend/src/pages/settings/buckets/components/holding-overrides-panel.tsx apps/frontend/src/pages/settings/buckets/components/asset-assignments-panel.tsx apps/frontend/src/pages/settings/buckets/components/bucket-form.test.tsx apps/frontend/src/pages/settings/buckets/components/holding-overrides-panel.test.tsx
git commit -m "feat: add buckets settings UI"
```

### Task 8: Add bucket labels to Dashboard account rows

**Files:**
- Modify: `apps/frontend/src/pages/dashboard/accounts-summary.tsx`
- Create: `apps/frontend/src/components/buckets/bucket-label.tsx`
- Test: `apps/frontend/src/pages/dashboard/accounts-summary.test.tsx`

**Step 1: Write the failing tests**

Add tests that verify:

- account rows display a bucket label when enabled and assigned
- labels are hidden when `bucketsEnabled` is false
- the label styling remains low emphasis

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand accounts-summary`
Expected: FAIL because account rows do not render bucket labels.

**Step 3: Write minimal implementation**

Create a shared `BucketLabel` component and render it in the account summary rows only when the feature is enabled.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand accounts-summary`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/dashboard/accounts-summary.tsx apps/frontend/src/components/buckets/bucket-label.tsx apps/frontend/src/pages/dashboard/accounts-summary.test.tsx
git commit -m "feat: show bucket labels on dashboard accounts"
```

### Task 9: Add bucket labels to Holdings `investments` and `assets`

**Files:**
- Modify: `apps/frontend/src/pages/holdings/components/holdings-table.tsx`
- Modify: `apps/frontend/src/pages/holdings/components/alternative-holdings-table.tsx`
- Modify: `apps/frontend/src/pages/holdings/holdings-page.tsx`
- Test: `apps/frontend/src/pages/holdings/components/holdings-table.test.tsx`
- Test: `apps/frontend/src/pages/holdings/components/alternative-holdings-table.test.tsx`

**Step 1: Write the failing tests**

Add tests that verify:

- investment rows show resolved bucket labels
- standalone asset rows show bucket labels
- labels disappear when `bucketsEnabled` is false
- labels do not break row click and navigation behavior

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand holdings-table alternative-holdings-table`
Expected: FAIL because holdings rows do not render bucket labels.

**Step 3: Write minimal implementation**

Use the shared `BucketLabel` component in both tables and feed them resolved bucket data from the new bucket hooks or enriched holdings responses.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand holdings-table alternative-holdings-table`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/holdings/components/holdings-table.tsx apps/frontend/src/pages/holdings/components/alternative-holdings-table.tsx apps/frontend/src/pages/holdings/holdings-page.tsx apps/frontend/src/pages/holdings/components/holdings-table.test.tsx apps/frontend/src/pages/holdings/components/alternative-holdings-table.test.tsx
git commit -m "feat: show bucket labels in holdings"
```

### Task 10: Add bucket allocation section to Insights

**Files:**
- Modify: `apps/frontend/src/pages/holdings/holdings-insights-page.tsx`
- Create: `apps/frontend/src/pages/holdings/components/bucket-allocation-strip.tsx`
- Test: `apps/frontend/src/pages/holdings/holdings-insights-page.test.tsx`

**Step 1: Write the failing tests**

Add tests that verify:

- the bucket section appears in Insights when enabled
- the section is hidden when disabled
- current percent, target percent, and deviation render correctly
- the section reuses the compact allocation visual style without introducing a new layout system

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand holdings-insights-page`
Expected: FAIL because Insights has no bucket allocation section.

**Step 3: Write minimal implementation**

Add a bucket allocation section that reuses existing compact allocation patterns from Insights, showing one row per bucket with amount, percent, target, and deviation.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand holdings-insights-page`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/pages/holdings/holdings-insights-page.tsx apps/frontend/src/pages/holdings/components/bucket-allocation-strip.tsx apps/frontend/src/pages/holdings/holdings-insights-page.test.tsx
git commit -m "feat: add bucket allocation insights"
```

### Task 11: Verify disabled-state behavior and theme compatibility

**Files:**
- Modify: `apps/frontend/src/components/buckets/bucket-label.tsx`
- Modify: `apps/frontend/src/pages/settings/buckets/buckets-page.tsx`
- Test: `apps/frontend/src/components/buckets/bucket-label.test.tsx`
- Test: `apps/frontend/src/pages/settings/buckets/buckets-page.test.tsx`

**Step 1: Write the failing tests**

Add tests for:

- hiding all bucket labels and Insights content when disabled
- safe rendering in both light and dark theme class contexts
- seeded color palette behavior
- muted label styling staying readable

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand bucket-label buckets-page`
Expected: FAIL because disabled-state and theme-specific rendering are incomplete.

**Step 3: Write minimal implementation**

Finish the shared label and page behavior so the module fully disappears when disabled and remains visually restrained in both themes.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand bucket-label buckets-page`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/frontend/src/components/buckets/bucket-label.tsx apps/frontend/src/pages/settings/buckets/buckets-page.tsx apps/frontend/src/components/buckets/bucket-label.test.tsx apps/frontend/src/pages/settings/buckets/buckets-page.test.tsx
git commit -m "fix: finalize bucket disabled state and theme styling"
```

### Task 12: Run end-to-end verification across Rust and frontend

**Files:**
- Modify: `docs/plans/2026-03-09-buckets-design.md`
- Modify: `docs/plans/2026-03-09-buckets-implementation.md`

**Step 1: Run focused Rust tests**

Run: `cargo test -p wealthfolio-core buckets -- --nocapture`
Expected: PASS

Run: `cargo test -p wealthfolio-storage-sqlite buckets -- --nocapture`
Expected: PASS

Run: `cargo test -p panorama buckets -- --nocapture`
Expected: PASS

**Step 2: Run focused frontend tests**

Run: `pnpm test -- --runInBand use-buckets buckets-page holdings-insights-page holdings-table alternative-holdings-table accounts-summary`
Expected: PASS

**Step 3: Run type and build verification**

Run: `pnpm type-check`
Expected: PASS

Run: `cargo check`
Expected: PASS

**Step 4: Update docs if implementation deviated**

If file names, APIs, or edge-case behavior changed during implementation, update this plan and the design doc before calling the work complete.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-09-buckets-design.md docs/plans/2026-03-09-buckets-implementation.md
git commit -m "docs: finalize buckets implementation notes"
```
