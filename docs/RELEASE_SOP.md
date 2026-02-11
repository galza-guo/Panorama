# Panorama Release SOP

This repo uses a script-first release flow so humans and AI agents can run the
same process.

## Versioning Policy

- Panorama is treated as a new product line.
- The first Panorama release tag is `v0.1.0`.
- Release tags must use `v<semver>` (example: `v0.1.1`, `v0.2.0`).

## One-Pass Release Commands

1. Prepare and auto-fix release metadata and version files:

```bash
pnpm release:prepare 0.1.0
```

2. Review changes:

```bash
git diff
```

3. Commit and create tag:

```bash
pnpm release:cut 0.1.0
```

4. Push commit and tag:

```bash
git push origin HEAD && git push origin v0.1.0
```

Or do step 3+4 together:

```bash
node scripts/release.mjs cut 0.1.0 --push
```

## What `release:prepare` Guarantees

- Aligns versions across:
  - `package.json`
  - `src-core/Cargo.lock` (local package entries)
  - `src-core/Cargo.toml`
  - `src-server/Cargo.lock` (local package entries)
  - `src-server/Cargo.toml`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock` (local package entries)
  - `src-tauri/tauri.conf.json`
- Enforces updater settings in `src-tauri/tauri.conf.json`:
  - `bundle.createUpdaterArtifacts = "v1Compatible"`
  - updater endpoint =
    `https://github.com/galza-guo/Panorama/releases/latest/download/latest.json`
- Enforces release workflow defaults:
  - tag trigger pattern: `v*.*.*`
  - published release (not draft)
  - release metadata validation step

## One-Time Updater Key Setup

Tauri updater artifacts must be signed. Without this key, every matrix job will
fail at `pnpm tauri build`.

1. Generate a key pair (one-time):

```bash
pnpm tauri signer generate -w ~/.tauri/panorama.key
```

2. Ensure `src-tauri/tauri.conf.json` `plugins.updater.pubkey` matches your
`~/.tauri/panorama.key.pub` value.
3. Add repository secrets:
   - Preferred:
     - `TAURI_PRIVATE_KEY` = full content of `~/.tauri/panorama.key`
     - `TAURI_KEY_PASSWORD` = key password
   - Legacy names also supported by workflow fallback:
     - `TAURI_SIGNING_PRIVATE_KEY`
     - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## CI Enforcement

The release workflow runs:

```bash
node scripts/release.mjs check --tag "${{ github.ref_name }}"
```

If metadata is wrong, CI fails with explicit repair commands.
If signing key secrets are missing, CI now fails early with a clear error before
running the expensive build matrix.

## AI Agent Prompt Template

Use this exact instruction to delegate release work:

```text
请按 docs/RELEASE_SOP.md 执行发布，目标版本是 vX.Y.Z。
要求：运行 release prepare、完成版本对齐、commit、打 tag，并推送。
```

## Recovery

If release files drift or mismatch:

```bash
node scripts/release.mjs check --fix --version 0.1.0 --tag v0.1.0
```
