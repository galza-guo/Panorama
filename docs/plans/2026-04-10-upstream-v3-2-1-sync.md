# Upstream v3.2.1 Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Absorb high-value upstream changes through `v3.2.1` while preserving Panorama-only customizations.

**Architecture:** Treat upstream `v3.2.1` as the reference point, then merge selectively by module. Take low-conflict areas mostly as-is, and hand-merge files covered by Panorama's patch inventory so CN market data, specialized assets, compatibility behavior, and branding survive.

**Tech Stack:** Git, React, TanStack Query, Rust core/services, SQLite storage, Tauri, Axum

---

### Task 1: Lock Sync Scope and Risk Map

**Files:**
- Modify: `docs/maintenance/upstream-sync-log.md`
- Modify: `docs/maintenance/panorama-patch-inventory.md`
- Create: working notes in git history only

**Step 1: Confirm upstream baseline**

Run:
- `git fetch upstream --tags`
- `git log --oneline refs/tags/v3.0.3..refs/tags/v3.2.1 -- <paths>`

Expected: clear list of candidate modules and fork-lane collisions.

**Step 2: Record the current sync target**

Add a new sync entry for `v3.2.1` with status `in_progress` or `planned`.

**Step 3: Reconfirm protected fork lanes**

Check every `ACTIVE` and `LOCAL_ONLY` patch row against touched upstream files before merging code.

### Task 2: Absorb Low-Conflict Upstream Modules

**Files:**
- Modify: `crates/connect/**`
- Modify: `apps/frontend/src/features/wealthfolio-connect/**`
- Modify: `apps/server/src/api/connect.rs`
- Modify: `apps/tauri/src/commands/brokers_sync.rs`
- Modify: selected AI files under `apps/frontend/src/features/ai-assistant/**`
- Modify: selected AI files under `crates/ai/**`

**Step 1: Start with Wealthfolio Connect**

Take upstream `v3.2.1` behavior for Connect/auth/device-sync flows, then re-apply Panorama-only visibility or branding tweaks on top.

**Step 2: Absorb selected AI assistant upgrades**

Prefer upstream fixes for attachments, context windowing, message editing, provider UX, and model handling. Do not overwrite Panorama-specific provider wiring or prompt/tool customizations without review.

**Step 3: Verify module boundaries**

Run targeted file diffs against `refs/tags/v3.2.1` after each sub-area to confirm only intentional Panorama deltas remain.

### Task 3: Hand-Merge Fork Lanes

**Files:**
- Modify: `crates/market-data/src/resolver/rules_resolver.rs`
- Modify: `crates/core/src/assets/alternative_assets_service.rs`
- Modify: `crates/core/src/assets/assets_model.rs`
- Modify: `crates/core/src/health/service.rs`
- Modify: `apps/server/src/api/settings.rs`
- Modify: `apps/tauri/tauri.conf.json`

**Step 1: Merge one lane at a time**

Use the patch inventory as the source of truth for what Panorama must keep.

**Step 2: Keep upstream where Panorama has no opinion**

When the same file changed upstream and locally, preserve only the documented Panorama behavior and take the rest from upstream.

**Step 3: Re-run lane-specific checks**

Run the verification command listed in the patch inventory row immediately after each lane is reconciled.

### Task 4: Validation and Documentation

**Files:**
- Modify: `docs/maintenance/upstream-sync-log.md`
- Modify: `docs/maintenance/panorama-patch-inventory.md`

**Step 1: Run targeted verification**

Run:
- `cargo test -p wealthfolio-market-data --lib`
- `cargo test -p wealthfolio-core panorama`
- `cargo check -p wealthfolio-server`
- `cargo check -p wealthfolio-app`
- `pnpm --filter frontend test -- --run`
- `pnpm build:types`
- `pnpm build`

**Step 2: Update maintenance docs**

Mark what was absorbed, what remains intentionally divergent, and any follow-up work still needed.

**Step 3: Summarize residual risk**

List any upstream areas deliberately skipped in this pass so the next sync starts from a clean checkpoint.
