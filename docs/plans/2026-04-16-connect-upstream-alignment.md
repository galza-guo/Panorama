# Connect Upstream Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align Panorama's remaining Connect and device-sync implementation with upstream `afadil/wealthfolio v3.2.1`, preserving only the Panorama Connect visibility gate.

**Architecture:** Treat Connect and device sync as one upstream-owned lane. Prefer upstream behavior over local custom runtime structure. Where upstream code cannot be copied verbatim because Panorama's surrounding APIs have changed, port the upstream behavior into the current interfaces with the smallest possible diff.

**Tech Stack:** Rust (`crates/connect`, Axum server, Tauri commands), React/Vite frontend, Vitest, Cargo.

---

### Task 1: Audit the remaining Connect/device-sync delta

**Files:**
- Review: `crates/connect/src/**`
- Review: `apps/frontend/src/features/wealthfolio-connect/**`
- Review: `apps/frontend/src/features/devices-sync/**`
- Review: `apps/frontend/src/context/auth-context.tsx`
- Review: `apps/server/src/api/connect.rs`
- Review: `apps/server/src/api/device_sync*.rs`
- Review: `apps/tauri/src/commands/device_sync/**`
- Review: `apps/tauri/src/services/connect_service.rs`

**Steps:**
1. Re-diff the scoped files against `v3.2.1`.
2. Group changes into direct checkout candidates vs compatible behavior ports.
3. Exclude non-Connect lanes like folder-sync, fire-planner, custom-provider.
4. Keep `apps/frontend/src/features/wealthfolio-connect/components/connect-visibility-gate.tsx` as the only intended local divergence.

### Task 2: Align Connect core runtime

**Files:**
- Modify: `crates/connect/src/broker/orchestrator.rs`
- Modify: `crates/connect/src/broker/service.rs`
- Modify: `crates/connect/src/broker/models.rs`
- Modify: `crates/connect/src/broker/traits.rs`
- Modify: `crates/connect/src/client.rs`
- Modify: `crates/connect/src/token_lifecycle.rs`

**Steps:**
1. Restore upstream Connect runtime behavior that still fits current core interfaces.
2. Preserve current Panorama compatibility where upstream references removed core fields/types.
3. Keep regression tests for any behavior ports that cannot be copied verbatim.
4. Verify with targeted Cargo tests/checks, update sync docs, commit.

### Task 3: Align Connect auth/session and visibility behavior

**Files:**
- Modify: `apps/frontend/src/context/auth-context.tsx`
- Modify: `apps/frontend/src/features/wealthfolio-connect/services/auth-service.ts`
- Modify: `apps/frontend/src/features/wealthfolio-connect/providers/wealthfolio-connect-provider.tsx`
- Preserve: `apps/frontend/src/features/wealthfolio-connect/components/connect-visibility-gate.tsx`
- Preserve: `apps/frontend/src/features/wealthfolio-connect/components/connect-visibility-gate.test.tsx`

**Steps:**
1. Keep the Panorama visibility gate.
2. Otherwise favor upstream Connect session/auth behavior.
3. Port upstream auth behavior through current token/session plumbing where required.
4. Verify frontend tests/build, update sync docs, commit.

### Task 4: Align device-sync backend/runtime

**Files:**
- Modify: `apps/server/src/api/device_sync.rs`
- Modify: `apps/server/src/api/device_sync_engine.rs`
- Modify: `apps/server/src/domain_events/queue_worker.rs`
- Modify: `apps/server/src/scheduler.rs`
- Modify: `apps/tauri/src/commands/device_sync/mod.rs`
- Modify: `apps/tauri/src/commands/device_sync/engine.rs`
- Modify: `apps/tauri/src/commands/device_sync/snapshot.rs`
- Modify: `apps/tauri/src/commands/device_enroll_service.rs`
- Modify: `apps/tauri/src/domain_events/queue_worker.rs`
- Modify: `apps/tauri/src/scheduler.rs`

**Steps:**
1. Prefer upstream device-sync flow and command/API structure.
2. Keep already-restored upstream security/runtime fixes (for example HMAC/session-proof behavior).
3. Avoid bringing in unrelated sync systems.
4. Verify with Cargo + frontend pairing/device-sync tests, update sync docs, commit.

### Task 5: Align device-sync frontend flow

**Files:**
- Modify: `apps/frontend/src/features/devices-sync/**`
- Modify: `apps/frontend/src/adapters/shared/connect.ts`
- Modify: `apps/frontend/src/adapters/web/crypto.ts`
- Modify: `apps/frontend/src/adapters/web/events.ts`
- Modify: `apps/frontend/src/adapters/web/index.ts`
- Modify: `apps/frontend/src/adapters/tauri/events.ts`
- Modify: `apps/frontend/src/adapters/tauri/index.ts`
- Modify: `apps/frontend/src/adapters/types.ts`

**Steps:**
1. Re-align pairing/recovery/sync-status flows to upstream.
2. Keep only compatible local adjustments required by already-accepted upstream security fixes.
3. Restore or replace tests so the final flow is pinned by behavior, not just by compilation.
4. Verify frontend tests/build, update sync docs, commit.

### Task 6: Final verification

**Run:**
- `cargo check -p wealthfolio-server`
- `cargo check -p wealthfolio-app`
- `pnpm --filter frontend test -- --run`
- `pnpm build:types`
- `pnpm build`

**Expected:** All commands exit successfully. Existing non-failing warnings may remain, but no new Connect/device-sync regressions.

