## Project Overview

Wealthfolio - Desktop investment tracker with local-first data. React + Vite
frontend, Tauri/Rust backend, SQLite storage.

Key directories:

- `apps/frontend/` — React app (pages, components, commands, hooks)
- `apps/tauri/` — Tauri desktop/mobile app (IPC commands)
- `apps/server/` — Axum HTTP server (web mode)
- `crates/` — Rust crates (core logic, storage, market-data, connect,
  device-sync)
- `packages/` — Shared TS packages (addon-sdk, ui, addon-dev-tools)
- `addons/` — Distributable addon plugins

## Quick Commands

- Dev desktop: `pnpm tauri dev`
- Dev web: `pnpm run dev:web`
- Tests: `pnpm test` | `cargo test`
- Type check: `pnpm type-check`
- Lint: `pnpm lint`

## macOS 27 / Xcode 27 Beta Tooling

Panorama has a generated Tauri Apple project under `apps/tauri/gen/apple/`. This
machine may be on macOS 27 with Xcode 27 beta installed at
`/Applications/Xcode-beta.app`, while the active global developer directory may
still be `/Library/Developer/CommandLineTools`.

Plain `xcodebuild`, `xcrun simctl`, or tools that depend on global
`xcode-select` may fail with errors like `xcodebuild requires Xcode`,
`unable to find utility "simctl"`, or `SDK "iphonesimulator" cannot be located`.
Do not assume Xcode or simulators are missing.

Use Xcode beta explicitly per command:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild -list -project ProjectName.xcodeproj
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcrun --sdk iphonesimulator --show-sdk-path
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcrun simctl list devices available
```

For building:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
xcodebuild -project ProjectName.xcodeproj \
  -scheme SchemeName \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

DeviceHub exists at
`/Applications/Xcode-beta.app/Contents/Applications/DeviceHub.app`. Relevant CLI
tools are still under the Xcode beta developer directory:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcrun --find xcodebuild
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcrun --find simctl
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcrun --find devicectl
```

Do not ask Gallant to install Xcode or switch global `xcode-select` until you
have tried the explicit
`DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` path. Some
automation/MCP tools may still fail if they internally call global
`xcode-select`; in that case, prefer direct shell commands with the
`DEVELOPER_DIR` prefix, including simulator screenshot/install/launch commands.

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if
  any.

---

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer
rewrites due to overcomplication, and clarifying questions come before
implementation rather than after mistakes.
