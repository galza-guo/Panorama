# Upstream Sync Log (Panorama)

This file records every upstream sync attempt and defines the repeatable sync
SOP.

## Sync cadence policy

1. Default cadence: monthly.
2. Sync target: latest upstream release tag in the period (for example, `v3.0.3`).
3. Skip intermediate patch tags unless they contain a required urgent fix.
4. Only sync `upstream/main` directly for urgent hotfix cherry-picks.

## Standard sync SOP

1. Fetch upstream tags: `git fetch upstream --tags`.
2. Create isolated sync branch from `origin/panorama-v3`:
   `git checkout -b codex/sync-<tag> origin/panorama-v3`.
3. Merge target tag: `git merge --no-ff <tag>`.
4. Resolve conflicts by lane using `docs/maintenance/panorama-patch-inventory.md`.
5. Run validation set:
   `cargo test -p wealthfolio-market-data --lib`
   `cargo test -p wealthfolio-core panorama`
   `cargo check -p wealthfolio-server`
   `cargo check -p wealthfolio-app`
   `pnpm --filter frontend test -- --run`
   `pnpm build:types`
   `pnpm build`
6. Open PR to `panorama-v3` with title format:
   `sync(upstream): <from_tag_or_sha> -> <to_tag>`.
7. After merge, update this log and refresh patch inventory statuses.

## Quick decision rules

- If no conflicts and validation passes: merge same day.
- If conflicts only in known fork lanes: merge after lane-owner check.
- If conflicts touch unknown core areas: defer and create focused follow-up patch.

## Sync history

| Date | Branch | From | To | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-03-04 | `panorama-v3` cutover | legacy fork line | `upstream/main` (v3 baseline) | merged | v3 migration completed and default branch switched |
| 2026-03-05 | selective `v3.0.3` review | `origin/panorama-v3` @ `68d2b393` | `v3.0.3` | partially absorbed | selected upstream `v3.0.3` fixes were reviewed and ported, but the tag was not fully merged as a clean baseline |
| 2026-04-10 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | absorbed selective Connect UI/session work plus AI provider UX, message-edit support, AI history windowing, and Ollama `/v1` URL normalization; documented Panorama fork lanes still protected |
| 2026-04-12 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored upstream AI thread footer spacing, AI markdown external-link routing, and mobile touch/Tauri lockdown compatibility from the `v3.2.1` line; remaining gaps are now concentrated in higher-risk device-sync and pairing-flow changes |
| 2026-04-15 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | absorbed upstream pairing-source hardening, Tauri Connect token refresh/runtime convergence, broker-sync plan gating, and Connect holdings/activity mapping improvements including option-position ingestion; existing Panorama-only lanes were kept intact |
| 2026-04-15 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored device-sync snapshot waiting semantics when a newly paired device has no bootstrap snapshot yet, plus trusted-device snapshot reuse/conflict fallback and clearer waiting-state UX on Panorama’s current pairing flow |
| 2026-04-15 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | added a session-scoped snapshot freshness gate for claimer confirmation so Panorama waits for a post-confirmation snapshot, while keeping the current pairing architecture and avoiding new persistence schema changes |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored upstream AI provider merging for saved non-catalog runtime models so fetched/custom model selections survive round-trip through the merged provider response; kept Panorama-specific AI provider catalog additions and picker UX divergences intact |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the device-sync HMAC signing path for pairing completion/confirmation across frontend, web crypto API, Tauri crypto commands, and the shared device-sync crate so session proofs again use the negotiated session key instead of a plain hash |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the upstream Connect holdings guard that preserves a same-day manual snapshot instead of overwriting it during broker-imported holdings sync, while keeping Panorama's current Connect runtime/auth structure intact |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the upstream fallback for legacy nested `draft.rowIndex` payloads in the AI batch activity tool UI so persisted or mixed-shape `record_activities` results keep row statuses aligned during review/submission; Panorama AI provider/catalog forks remain untouched |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored upstream `record_activities` behavior coverage for all-valid batches, per-type required fields, and subtype preservation so Panorama’s current batch activity runtime stays pinned to the `v3.2.1` contract without changing protected provider forks |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the upstream shared activity-table helper module and rewired the AI activities tool UIs to use it again, bringing badge styling and amount/quantity/date formatting back in line with `v3.2.1` while keeping Panorama’s provider-specific UX forks intact |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored upstream AI edit-runtime semantics across frontend and Rust so message edits now truncate context by `parentMessageId` only and no longer use Panorama’s `sourceMessageId` history-rewrite path; provider-specific catalog/picker forks remain the only protected AI divergence |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the remaining non-provider AI assistant frontend files to exact upstream `v3.2.1` content, including dropping local-only helper tests, so the frontend AI lane now differs only where Panorama intentionally keeps provider-related forks |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the remaining non-provider AI Rust runtime/tooling files to upstream `v3.2.1` content; the only non-provider residue left is a narrow compatibility shim in `env.rs`, `tools/activities.rs`, `tools/import_csv.rs`, and `tools/income.rs` because Panorama’s current core traits still differ from the upstream signatures those files expect |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the upstream device-sync frontend shape by removing Panorama’s local `DeviceSyncProvider` layer, bringing the pairing/device-sync UI back to the upstream hook-and-command flow, and re-aligning the web adapter command surface needed by the current device-sync runtime while keeping the Panorama Connect visibility gate as the only intended local divergence |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the upstream device-sync backend coordinator/runtime surface across the shared device-sync engine, web API, and Tauri commands so the newly restored pairing flow can run end-to-end again; frontend tests, type build, frontend build, and a new device-sync runtime regression test passed, while top-level `cargo check -p wealthfolio-server` / `cargo check -p wealthfolio-app` remain blocked by an existing unrelated AI/storage trait mismatch in `crates/storage-sqlite/src/ai_chat/repository.rs` |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the upstream refresh-token-only Connect session payload flow across the frontend adapters/provider and Tauri command surface, re-enabled broker-sync entitlement gating in both server and desktop entrypoints, and removed an unused extra Connect client helper; frontend tests, type build, and frontend build passed, while `cargo check -p wealthfolio-server` / `cargo check -p wealthfolio-app` are still blocked by the same pre-existing AI/storage trait mismatch in `crates/storage-sqlite/src/ai_chat/repository.rs` |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | restored the upstream broker-sync fallback that reuses the previous holding average cost when the broker omits purchase price, and re-enabled broker quote creation from BUY/SELL trade prices inside the current Connect runtime; new `wealthfolio-connect` regression tests passed alongside the standard frontend test/type/build checks, while `cargo check -p wealthfolio-server` / `cargo check -p wealthfolio-app` remain blocked by the same pre-existing AI/storage trait mismatch in `crates/storage-sqlite/src/ai_chat/repository.rs` |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | in_progress | removed the stale `delete_messages_starting_from` method from `crates/storage-sqlite/src/ai_chat/repository.rs` after the AI parent-only edit revert, which clears the old `ChatRepositoryTrait` mismatch and lets `cargo check -p wealthfolio-app` pass again; `CONNECT_API_URL is NOT set` remains only as the existing build-script warning |
| 2026-04-16 | main worktree selective sync | `Panorama main` | `v3.2.1` | ready_for_release | final release audit passed after fixing a QR scan CSS selector typo and adding missing pairing-dialog accessibility descriptions; Panorama version metadata was bumped to `3.2.1` across app/addon/release files to match the upstream release tag before tagging and draft-release automation |
