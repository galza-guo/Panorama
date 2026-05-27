# Local Connectors And Webull HK Design

**Goal:** Add local external account connectors for individuals and families, with Webull HK as the first provider.

## Context

Panorama already has the right center of gravity: the local account is the thing that powers holdings, net worth, performance, insights, health checks, and imports. A broker API should not become a parallel portfolio system. It should feed the same local account data model.

The old Wealthfolio Connect path is cloud-centered and currently hidden by default. The new path should be local-first: credentials stay on the user's machine, secrets go to OS keyring, and Panorama talks to provider APIs directly from the desktop backend.

Webull HK's individual Trading API supports account list, balances, positions, order history, order detail, order placement, market data, and event streams. The richer account activities ledger is documented under Webull's Broker API, which is intended for broker/platform use rather than ordinary personal accounts.

## Design Decision

Build a provider-neutral local connector layer, then implement Webull HK as the first connector.

Keep Panorama accounts as the source of truth for the app. A connector is only an external data source that can be linked to one or more Panorama accounts.

Use a prospective takeover model for Webull HK:

- before the link date, existing Panorama history is preserved
- from the link date onward, Webull HK becomes the source of truth for linked account holdings
- no automatic backwards rewrite
- optional order-history import can start from the link date
- full ledger rebuild remains unavailable unless Webull exposes a personal account activity ledger

## Connector Model

Add two concepts.

`ExternalConnection` represents provider credentials and capabilities:

- `id`
- `provider` such as `WEBULL_HK`
- `display_name`
- `environment` such as `SANDBOX` or `PRODUCTION`
- `owner_name`
- `status`
- `capabilities_json`
- `metadata_json`
- timestamps

Secrets are not stored here. Use keyring keys namespaced by connection id:

- `connector:webull_hk:<connection_id>:app_key`
- `connector:webull_hk:<connection_id>:app_secret`
- `connector:webull_hk:<connection_id>:access_token`

`ExternalAccountLink` maps one remote account to one Panorama account:

- `id`
- `connection_id`
- `provider`
- `remote_account_id`
- `local_account_id`
- `remote_account_number_masked`
- `remote_account_type`
- `linked_at`
- `source_from_date`
- `sync_mode`
- `status`
- `metadata_json`
- timestamps

One Webull HK connection can expose multiple remote accounts. Each remote account can link to a new or existing Panorama account.

## Capabilities

Do not model every provider as a "broker." Use capability traits:

- `PortfolioSnapshotSync`: accounts, balances, positions
- `OrderHistoryImport`: orders and fills where available
- `FullActivityLedgerSync`: full transaction ledger, including cash/dividends/tax/transfers
- `Trading`: preview, place, replace, cancel orders
- `MarketData`: quotes, bars, snapshots
- `Streaming`: live quotes and order events
- `Web3Wallet`: chain balances and transfers

Initial Webull HK capability matrix:

- `PortfolioSnapshotSync`: yes
- `OrderHistoryImport`: yes, limited by the Trading API order-history window
- `FullActivityLedgerSync`: no
- `Trading`: later, sandbox first
- `MarketData`: later, separate from account linking
- `Streaming`: later

## Webull HK Account Sync

The first production behavior is holdings snapshot sync.

Flow:

1. User creates a Webull HK connection.
2. Panorama stores App Key, App Secret, and token in keyring.
3. Panorama queries Webull's account list.
4. User links each remote account to a new or existing Panorama account.
5. The link stores `source_from_date`.
6. Sync fetches balance and positions.
7. Panorama saves a normal holdings snapshot using existing snapshot storage.

This keeps insights and reporting working because they continue to read normal Panorama data.

## Webull HK Order Import

Order import should be separate from holdings snapshot sync.

Use Webull order history and order detail only from `source_from_date` onward. Import filled or partially filled orders as reviewable activities. Use order detail for commission and fee breakdown where needed.

Do not call this a full account history import. It does not cover non-order events such as dividends, deposits, withdrawals, tax withholding, interest, FX cash movements, transfers, and corporate actions.

If a user does not sync for longer than the order-history look-back window, order import may miss old orders. Holdings snapshot sync still keeps current portfolio state correct.

## Existing Account Linking

When linking to an existing account, show a plain warning:

> Webull HK will become the source of truth for this account from the selected date onward. Existing history before that date will be kept.

Rules:

- do not delete existing activities
- do not delete existing holdings snapshots
- set tracking mode to `HOLDINGS`
- store the link's `source_from_date`
- future Webull snapshots supersede manual holdings from that date onward
- unlinking stops future sync but keeps already-imported data

## Market Data

Market data is a separate provider capability.

If at least one valid Webull HK connection exists, Panorama can offer Webull HK as a market data provider for covered symbols. This must not require an account link. A user may use Webull quotes for non-Webull holdings if entitlement and symbol coverage allow it.

If several Webull HK connections exist, Panorama should choose one configured default market-data connection to avoid unnecessary API calls and rate-limit pressure.

## Out Of Scope

- Webull Broker API for institutional/omnibus accounts
- historical full ledger rewrite
- cloud relay service
- arbitrary custom trading connector config
- web mode secrets beyond existing backend secret-store behavior

## Verification

Minimum checks:

- a Webull connection can list multiple remote accounts
- each remote account can link to a distinct Panorama account
- linking an existing account preserves old data
- sync from the link date saves holdings snapshots through existing portfolio storage
- insights/net worth/allocation continue to work from normal account data
- order import is labelled limited/reviewable
- Webull market data can be enabled without linking a Webull account

## References

- Webull HK OpenAPI index: https://developer.webull.hk/apis/llms.txt
- Webull HK Authentication Overview: https://developer.webull.hk/apis/docs/authentication/overview.md
- Webull HK Trading API Overview: https://developer.webull.hk/apis/docs/trade-api/overview.md
- Webull HK Accounts: https://developer.webull.hk/apis/docs/trade-api/account.md
- Webull HK Order History: https://developer.webull.hk/apis/docs/reference/order-history.md
- Webull HK Order Detail: https://developer.webull.hk/apis/docs/reference/order-detail.md
- Webull HK Market Data API: https://developer.webull.hk/apis/docs/market-data-api/data-api.md
