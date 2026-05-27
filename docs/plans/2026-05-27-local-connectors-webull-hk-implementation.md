# Local Connectors And Webull HK Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local connector layer and implement Webull HK account linking with prospective takeover from the link date onward.

**Architecture:** Add provider-neutral connection/link models in core and SQLite, then implement Webull HK as the first local connector. Feed synced balances and positions into existing Panorama account and holdings snapshot flows so insights continue to read normal app data.

**Tech Stack:** Rust core crates, SQLite/Diesel storage, Tauri commands, React frontend, OS keyring secrets, Webull HK HTTP APIs.

---

## Task 1: Add Connector Domain Models

**Files:**

- Create: `crates/core/src/connectors/mod.rs`
- Create: `crates/core/src/connectors/connectors_model.rs`
- Create: `crates/core/src/connectors/connectors_traits.rs`
- Modify: `crates/core/src/lib.rs`
- Test: `crates/core/src/connectors/connectors_model_tests.rs`

**Step 1: Write failing tests**

Add tests for provider/capability serialization and default link behavior.

Run:

```bash
cargo test -p wealthfolio-core connectors_model_tests -- --nocapture
```

Expected: fail because the module does not exist.

**Step 2: Implement models**

Add:

- `ConnectorProvider` with `WebullHk`
- `ConnectorEnvironment` with `Sandbox` and `Production`
- `ConnectorCapability`
- `ExternalConnection`
- `NewExternalConnection`
- `ExternalAccountLink`
- `NewExternalAccountLink`
- `ExternalAccountLinkStatus`

Use `SCREAMING_SNAKE_CASE` serde values to match existing API style.

**Step 3: Run tests**

Run:

```bash
cargo test -p wealthfolio-core connectors_model_tests -- --nocapture
```

Expected: pass.

**Step 4: Commit**

```bash
git add crates/core/src/connectors crates/core/src/lib.rs
git commit -m "feat: add local connector domain models"
```

## Task 2: Add SQLite Storage

**Files:**

- Create: `crates/storage-sqlite/migrations/2026-05-27-000003_local_connectors/up.sql`
- Create: `crates/storage-sqlite/migrations/2026-05-27-000003_local_connectors/down.sql`
- Create: `crates/storage-sqlite/src/connectors/mod.rs`
- Create: `crates/storage-sqlite/src/connectors/model.rs`
- Create: `crates/storage-sqlite/src/connectors/repository.rs`
- Modify: `crates/storage-sqlite/src/lib.rs`
- Modify: `crates/storage-sqlite/src/schema.rs`
- Test: `crates/storage-sqlite/src/connectors/repository.rs`

**Step 1: Write failing repository tests**

Cover:

- create/list/update connection
- create/list account links
- unique active remote account link per connection
- lookup links by local account id

Run:

```bash
cargo test -p wealthfolio-storage-sqlite connectors::repository -- --nocapture
```

Expected: fail because storage does not exist.

**Step 2: Add migration**

Create tables:

- `external_connections`
- `external_account_links`

Do not store secrets in either table.

**Step 3: Implement repository**

Implement the connector repository traits from core. Keep conversion code in `model.rs`, following the existing storage module pattern.

**Step 4: Run tests**

Run:

```bash
cargo test -p wealthfolio-storage-sqlite connectors::repository -- --nocapture
```

Expected: pass.

**Step 5: Commit**

```bash
git add crates/storage-sqlite/migrations/2026-05-27-000003_local_connectors crates/storage-sqlite/src/connectors crates/storage-sqlite/src/lib.rs crates/storage-sqlite/src/schema.rs
git commit -m "feat: persist local connector links"
```

## Task 3: Add Webull HK HTTP Client Foundation

**Files:**

- Create: `crates/connect/src/webull_hk/mod.rs`
- Create: `crates/connect/src/webull_hk/auth.rs`
- Create: `crates/connect/src/webull_hk/client.rs`
- Create: `crates/connect/src/webull_hk/models.rs`
- Modify: `crates/connect/src/lib.rs`
- Test: `crates/connect/src/webull_hk/auth.rs`

**Step 1: Write failing signer test**

Use Webull's documented signature example to verify HMAC-SHA1 signing.

Run:

```bash
cargo test -p wealthfolio-connect webull_hk::auth -- --nocapture
```

Expected: fail because signer does not exist.

**Step 2: Implement auth**

Implement:

- endpoint selection for sandbox/production
- compact JSON body serialization for signing
- MD5 body hash for POST requests
- sorted query/header signature string
- HMAC-SHA1 Base64 signature
- required Webull headers

**Step 3: Implement token endpoints**

Add create-token and check-token calls. Store only returned status/expiry in normal models; token secret storage is handled by Tauri service later.

**Step 4: Run tests**

Run:

```bash
cargo test -p wealthfolio-connect webull_hk::auth -- --nocapture
cargo check -p wealthfolio-connect
```

Expected: pass.

**Step 5: Commit**

```bash
git add crates/connect/src/webull_hk crates/connect/src/lib.rs
git commit -m "feat: add Webull HK client foundation"
```

## Task 4: Implement Webull HK Account Snapshot Sync

**Files:**

- Modify: `crates/connect/src/webull_hk/client.rs`
- Modify: `crates/connect/src/webull_hk/models.rs`
- Create: `crates/connect/src/webull_hk/sync.rs`
- Test: `crates/connect/src/webull_hk/sync.rs`

**Step 1: Write failing mapping tests**

Cover:

- account list maps to remote account summaries
- balance currencies map to cash balances
- positions map to holdings positions
- numeric strings parse without float rounding

Run:

```bash
cargo test -p wealthfolio-connect webull_hk::sync -- --nocapture
```

Expected: fail because mapping does not exist.

**Step 2: Implement endpoint calls**

Add:

- `GET /openapi/account/list`
- `GET /openapi/assets/balance`
- `GET /openapi/assets/positions`
- `GET /openapi/instrument/stock/list`

**Step 3: Implement holdings mapper**

Return provider-neutral balances/positions that the app can save as a holdings snapshot.

**Step 4: Run tests**

Run:

```bash
cargo test -p wealthfolio-connect webull_hk::sync -- --nocapture
cargo check -p wealthfolio-connect
```

Expected: pass.

**Step 5: Commit**

```bash
git add crates/connect/src/webull_hk
git commit -m "feat: map Webull HK balances and positions"
```

## Task 5: Add Tauri Commands And Secret Handling

**Files:**

- Create: `apps/tauri/src/commands/webull_hk.rs`
- Modify: `apps/tauri/src/commands/mod.rs`
- Modify: `apps/tauri/src/lib.rs`
- Modify: `apps/tauri/src/context/providers.rs`
- Test: `apps/tauri/src/commands/webull_hk.rs`

**Step 1: Write command tests where practical**

Cover command payload validation and secret-key naming helpers.

Run:

```bash
cargo test -p wealthfolio-app webull_hk -- --nocapture
```

Expected: fail because command module does not exist.

**Step 2: Implement commands**

Add commands for:

- create/update/delete connection metadata
- store/delete credentials in keyring
- create/check token
- list remote Webull accounts
- link remote account to local account
- sync linked account from `source_from_date`

**Step 3: Use existing account/snapshot services**

Set linked accounts to `TrackingMode::Holdings`. Save snapshots through existing holdings snapshot service rather than Webull-specific tables.

**Step 4: Run checks**

Run:

```bash
cargo test -p wealthfolio-app webull_hk -- --nocapture
cargo check -p wealthfolio-app
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/tauri/src/commands/webull_hk.rs apps/tauri/src/commands/mod.rs apps/tauri/src/lib.rs apps/tauri/src/context/providers.rs
git commit -m "feat: expose Webull HK local connector commands"
```

## Task 6: Add Webull HK Frontend Setup And Linking

**Files:**

- Create: `apps/frontend/src/features/local-connectors/webull-hk/`
- Create: `apps/frontend/src/features/local-connectors/webull-hk/webull-hk-connect-page.tsx`
- Create: `apps/frontend/src/features/local-connectors/webull-hk/webull-hk-service.ts`
- Create: `apps/frontend/src/features/local-connectors/webull-hk/types.ts`
- Modify: `apps/frontend/src/pages/settings/settings-layout.tsx`
- Test: `apps/frontend/src/features/local-connectors/webull-hk/webull-hk-connect-page.test.tsx`

**Step 1: Write failing UI tests**

Cover:

- credential form
- sandbox/production toggle
- token status
- remote account list
- link to new account
- link to existing account with takeover warning

Run:

```bash
pnpm --filter frontend test src/features/local-connectors/webull-hk/webull-hk-connect-page.test.tsx -- --run
```

Expected: fail because UI does not exist.

**Step 2: Implement service wrappers**

Follow the existing adapter/command pattern for Tauri commands.

**Step 3: Implement setup UI**

Keep the first screen functional: connection list, add connection, verify token, list accounts, link accounts.

**Step 4: Run frontend checks**

Run:

```bash
pnpm --filter frontend test src/features/local-connectors/webull-hk/webull-hk-connect-page.test.tsx -- --run
pnpm --filter frontend type-check
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/frontend/src/features/local-connectors apps/frontend/src/pages/settings/settings-layout.tsx
git commit -m "feat: add Webull HK connector setup"
```

## Task 7: Add Prospective Order Import

**Files:**

- Modify: `crates/connect/src/webull_hk/client.rs`
- Modify: `crates/connect/src/webull_hk/models.rs`
- Create: `crates/connect/src/webull_hk/order_import.rs`
- Modify: `apps/tauri/src/commands/webull_hk.rs`
- Test: `crates/connect/src/webull_hk/order_import.rs`

**Step 1: Write failing order mapping tests**

Cover:

- filled buy order to activity
- filled sell order to activity
- partial fill marked reviewable
- cancelled/unfilled order skipped
- commission/fees from order detail

Run:

```bash
cargo test -p wealthfolio-connect webull_hk::order_import -- --nocapture
```

Expected: fail because order import does not exist.

**Step 2: Implement endpoints**

Add:

- `GET /openapi/trade/order/history`
- `GET /openapi/trade/order/detail`

Only query from `source_from_date` onward.

**Step 3: Implement mapper**

Create reviewable activities with idempotency keys based on connection id, remote account id, and Webull order ids.

**Step 4: Run tests**

Run:

```bash
cargo test -p wealthfolio-connect webull_hk::order_import -- --nocapture
cargo check -p wealthfolio-connect
```

Expected: pass.

**Step 5: Commit**

```bash
git add crates/connect/src/webull_hk apps/tauri/src/commands/webull_hk.rs
git commit -m "feat: import Webull HK orders from link date"
```

## Task 8: Add Webull HK As Market Data Provider

**Files:**

- Create: `crates/market-data/src/provider/webull_hk.rs`
- Modify: `crates/market-data/src/provider/mod.rs`
- Modify: `crates/market-data/src/lib.rs`
- Modify: `apps/tauri/src/context/providers.rs`
- Test: `crates/market-data/src/provider/webull_hk.rs`

**Step 1: Write failing provider tests**

Cover category mapping and quote response parsing.

Run:

```bash
cargo test -p wealthfolio-market-data webull_hk -- --nocapture
```

Expected: fail because provider does not exist.

**Step 2: Implement HTTP market data**

Start with snapshot and historical bars. Leave streaming for a later phase.

**Step 3: Wire provider settings**

Enable Webull HK market data only when a valid connection is configured as the market-data credential source.

**Step 4: Run checks**

Run:

```bash
cargo test -p wealthfolio-market-data webull_hk -- --nocapture
cargo check -p wealthfolio-app
```

Expected: pass.

**Step 5: Commit**

```bash
git add crates/market-data/src/provider/webull_hk.rs crates/market-data/src/provider/mod.rs crates/market-data/src/lib.rs apps/tauri/src/context/providers.rs
git commit -m "feat: add Webull HK market data provider"
```

## Task 9: Full Verification

**Files:**

- No code changes unless verification reveals issues.

**Step 1: Run targeted tests**

```bash
cargo test -p wealthfolio-core connectors
cargo test -p wealthfolio-storage-sqlite connectors
cargo test -p wealthfolio-connect webull_hk
cargo test -p wealthfolio-market-data webull_hk
pnpm --filter frontend test src/features/local-connectors/webull-hk -- --run
```

Expected: all pass.

**Step 2: Run compile/build checks**

```bash
cargo check -p wealthfolio-app
cargo check -p wealthfolio-server
pnpm --filter frontend type-check
pnpm --filter frontend build
```

Expected: all pass. Existing Vite sourcemap/chunk warnings are acceptable if unchanged.

**Step 3: Manual sandbox smoke test**

Using Webull sandbox credentials:

1. Create connection.
2. Verify token.
3. List accounts.
4. Link a remote account to a new Panorama account.
5. Run sync.
6. Confirm holdings/net worth/allocation update.

**Step 4: Commit fixes if needed**

```bash
git add <changed-files>
git commit -m "fix: stabilize Webull HK connector verification"
```
