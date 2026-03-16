# Wealthfolio Connect Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist a Wealthfolio Connect visibility setting and use it to hide Connect entry points and routes.

**Architecture:** Add a boolean settings field across core/storage/frontend models, then consume it from the settings context in navigation and routing. Keep the behavior minimal: hide UI entry points and redirect direct route access when disabled.

**Tech Stack:** React, React Router, TanStack Query, Rust core settings model, SQLite settings repository

---

### Task 1: Persisted Settings Field

**Files:**
- Modify: `crates/core/src/settings/settings_model.rs`
- Modify: `crates/storage-sqlite/src/settings/repository.rs`
- Modify: `apps/frontend/src/lib/types.ts`
- Modify: `apps/frontend/src/lib/settings-provider.tsx`

**Step 1: Write the failing test**

Add a frontend visibility test that requires `wealthfolioConnectVisible` to exist on the settings model.

**Step 2: Run test to verify it fails**

Run: `pnpm type-check`

**Step 3: Write minimal implementation**

Add `wealthfolioConnectVisible` with default `true` through the core/storage/frontend settings path.

**Step 4: Run test to verify it passes**

Run: `pnpm type-check`

### Task 2: General Settings Toggle

**Files:**
- Create: `apps/frontend/src/pages/settings/general/connect-visibility-settings.tsx`
- Modify: `apps/frontend/src/pages/settings/general/general-page.tsx`

**Step 1: Write the failing test**

Add a component test that expects the toggle to render and call `updateSettings` with `wealthfolioConnectVisible`.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend test -- --run <new-test>`

**Step 3: Write minimal implementation**

Render a card at the bottom of General settings with a switch bound to `wealthfolioConnectVisible`.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend test -- --run <new-test>`

### Task 3: Hide Navigation and Guard Routes

**Files:**
- Modify: `apps/frontend/src/pages/layouts/navigation/app-sidebar.tsx`
- Modify: `apps/frontend/src/pages/settings/settings-layout.tsx`
- Modify: `apps/frontend/src/pages/layouts/navigation/app-navigation.tsx`
- Modify: `apps/frontend/src/routes.tsx`

**Step 1: Write the failing test**

Add tests that expect Connect nav items to disappear when `wealthfolioConnectVisible` is false and routes to redirect away.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend test -- --run <new-tests>`

**Step 3: Write minimal implementation**

Read the setting from context, hide the Connect sidebar item and settings nav item, and redirect `/connect` and `/settings/connect` when hidden.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend test -- --run <new-tests>`

### Task 4: Final Verification and Commit

**Files:**
- Verify only

**Step 1: Run targeted verification**

Run:
- `pnpm --filter frontend test -- --run <new-tests>`
- `pnpm type-check`

**Step 2: Run shared compile checks**

Run:
- `cargo check -p wealthfolio-server`
- `cargo check -p wealthfolio-app`

**Step 3: Commit**

Create a single commit for this feature once verification is green.
