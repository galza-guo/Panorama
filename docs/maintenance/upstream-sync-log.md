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
