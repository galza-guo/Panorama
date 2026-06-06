# Upstream v3.2.1 Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Finish the highest-value remaining upstream `v3.2.1` sync work in
priority order: AI assistant runtime/tooling first, then device sync/pairing,
then Connect/auth/backend hardening.

**Architecture:** Keep Panorama-specific AI provider wiring and edit-history
behavior, then reintroduce upstream features around them instead of replacing
local code wholesale. Treat device sync and Connect as larger follow-up lanes:
absorb upstream behavior where Panorama has no fork opinion, keep documented
fork lanes intact, and verify each lane independently before merging on.

**Tech Stack:** React, assistant-ui, Rust, Tauri, Axum, Vitest, cargo test/check

---

### Task 1: Reconcile AI request types and attachment pipeline

**Files:**

- Modify: `crates/ai/src/types.rs`
- Modify: `crates/ai/src/chat.rs`
- Modify: `crates/ai/src/tools/constants.rs`
- Modify: `apps/frontend/src/features/ai-assistant/types.ts`
- Modify: `apps/frontend/src/features/ai-assistant/hooks/use-chat-runtime.ts`

**Steps:**

1. Add failing Rust tests covering attachment validation plus edit-history
   truncation with `source_message_id`.
2. Extend `SendMessageRequest` / frontend request types so `attachments` and
   `sourceMessageId` both survive.
3. Restore upstream multimodal attachment handling for CSV, images, and PDFs
   without dropping Panorama’s edit-history rewrite behavior.
4. Run targeted Rust AI tests, then frontend tests/build.
5. Commit this slice separately.

### Task 2: Reconcile AI bulk activity tooling

**Files:**

- Modify: `crates/ai/src/tools/mod.rs`
- Modify: `crates/ai/src/tools/record_activity.rs`
- Create or restore: `crates/ai/src/tools/record_activities.rs`
- Modify: `crates/ai/src/chat.rs`
- Modify:
  `apps/frontend/src/features/ai-assistant/components/tool-uis/activities-tool-ui.tsx`
- Create or restore:
  `apps/frontend/src/features/ai-assistant/components/tool-uis/record-activities-tool-ui.tsx`
- Modify: `apps/frontend/src/features/ai-assistant/components/tool-uis/index.ts`
- Modify: `apps/frontend/src/features/ai-assistant/types.ts`

**Steps:**

1. Add failing tests for bulk activity tool payload/result handling.
2. Restore the upstream `record_activities` tool path, but preserve Panorama’s
   existing `record_activity` flow.
3. Decide whether to keep both UI paths or converge them behind one renderer
   after tests are green.
4. Run targeted Rust AI tests and frontend tests/build.
5. Commit this slice separately.

### Task 3: Reconcile remaining AI provider/runtime UX differences

**Files:**

- Modify: `crates/ai/src/ai_providers.json`
- Modify: `crates/ai/src/provider_service.rs`
- Modify: `crates/ai/src/providers.rs`
- Modify: `apps/frontend/src/features/ai-assistant/hooks/use-chat-model.ts`
- Modify: `apps/frontend/src/features/ai-assistant/hooks/use-provider-picker.ts`
- Modify: `apps/frontend/src/features/ai-assistant/components/model-picker.tsx`
- Modify:
  `apps/frontend/src/features/ai-assistant/components/provider-settings-card.tsx`
- Modify: `apps/frontend/src/features/ai-assistant/components/chat-shell.tsx`

**Steps:**

1. Diff current provider/runtime behavior against upstream and classify each
   difference as Panorama-only vs accidental drift.
2. Add tests where behavior changed materially.
3. Absorb only the upstream UX/runtime behavior that does not erase Panorama
   provider customization.
4. Re-run frontend tests/build plus targeted `cargo test -p panorama-ai --lib`.
5. Commit this slice separately.

### Task 4: Reconcile device sync / pairing lane

**Files:**

- Modify: `apps/frontend/src/features/devices-sync/**`
- Modify: `apps/server/src/api/device_sync_engine.rs`
- Modify: `apps/tauri/src/commands/device_sync/mod.rs`
- Modify: `apps/frontend/src/adapters/web/core.ts`

**Steps:**

1. Audit upstream pairing-flow coordinator changes and identify which ones are
   pure bugfixes versus structural rewrites.
2. Start with failing tests around the known upstream fixes: role selection,
   overwrite flow, loader sequencing, disconnect/reset behavior.
3. Merge the smallest upstream bugfix set first, then expand only if tests stay
   green.
4. Run frontend tests plus targeted Rust/Tauri checks.
5. Commit this lane separately.

### Task 5: Reconcile Connect/auth/backend lane

**Files:**

- Modify: `apps/frontend/src/context/auth-context.tsx`
- Modify:
  `apps/frontend/src/features/panorama-local-connectors/services/auth-service.ts`
- Modify:
  `apps/frontend/src/features/panorama-local-connectors/providers/panorama-local-connectors-provider.tsx`
- Modify: `crates/connect/src/broker/service.rs`
- Modify: `crates/connect/src/broker/orchestrator.rs`
- Review upstream-only file: `crates/connect/src/token_lifecycle.rs`

**Steps:**

1. Confirm which Connect differences are unused locally versus still on active
   code paths.
2. Add failing tests for any auth/session bugs we choose to absorb.
3. Pull in upstream token/session hardening and broker-sync fixes where Panorama
   has no conflicting behavior.
4. Run targeted `cargo test` / `cargo check` plus frontend tests/build.
5. Commit this lane separately.

### Task 6: Final validation and docs

**Files:**

- Modify: `docs/maintenance/upstream-sync-log.md`
- Modify: `docs/maintenance/panorama-patch-inventory.md`

**Steps:**

1. Run the full validation set:
   - `cargo test -p panorama-market-data --lib`
   - `cargo test -p panorama-core panorama`
   - `cargo test -p panorama-ai --lib`
   - `cargo check -p panorama-server`
   - `cargo check -p wealthfolio-app`
   - `pnpm --filter frontend test -- --run`
   - `pnpm build:types`
   - `pnpm build`
2. Update sync docs with what was absorbed, what stayed intentionally divergent,
   and what still remains.
3. Commit the final docs/checkpoint cleanup.
