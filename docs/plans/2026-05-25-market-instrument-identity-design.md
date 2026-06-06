# Market Instrument Identity Design

**Goal:** Make market instrument identity unambiguous across search, import,
asset creation, and quote sync so codes such as `001594` cannot become duplicate
or stale assets.

## Context

Panorama currently stores enough fields to identify most market assets:

- `instrument_type`
- `instrument_symbol`
- `instrument_exchange_mic`
- `quote_ccy`
- `provider_config.preferred_provider`

The problem is that some paths still infer meaning from a plain display code. A
six-digit code such as `001594` can be interpreted as:

- a Tiantian OTC fund
- a mainland exchange-traded instrument
- a provider-specific lookup string

This creates confusing search results such as both `001594` and `001594.FUND`
with the same title. It also allows stale duplicates: the canonical fund
updates, while the bare duplicate fails sync.

## Decision

Do not use bare ticker/code text as the durable identity.

Use a canonical market identity for every market asset. The display code can
remain friendly, but quote sync and duplicate detection must use the canonical
identity.

Examples:

- Tiantian fund: `FUND:CN:001594`
- Mainland stock: `EQUITY:CN:XSHG:600519`
- Mainland Shenzhen stock: `EQUITY:CN:XSHE:000001`
- HK stock: `EQUITY:HK:XHKG:0700`
- US stock: `EQUITY:US:XNAS:AAPL`
- Crypto: `CRYPTO:BTC/USD`
- FX: `FX:EUR/USD`

For the database model, this can map to existing fields instead of requiring a
new table:

- Tiantian fund: `instrument_type=FUND`, `instrument_symbol=001594`,
  `instrument_exchange_mic=NULL`, `display_code=001594.FUND`,
  `preferred_provider=TIANTIAN_FUND`
- Mainland stock: `instrument_type=EQUITY`, `instrument_symbol=600519`,
  `instrument_exchange_mic=XSHG`, `preferred_provider=EASTMONEY_CN`
- HK stock: `instrument_type=EQUITY`, `instrument_symbol=0700`,
  `instrument_exchange_mic=XHKG`, provider chosen by settings
- Crypto: `instrument_type=CRYPTO`, `instrument_symbol=BTC`, `quote_ccy=USD`
- FX: `instrument_type=FX`, `instrument_symbol=EUR`, `quote_ccy=USD`

## Why Bare `001594` Is Not Enough

Bare `001594` is useful as user input and display text, but not as a saved
identity.

It loses the fact that this is a fund routed through Tiantian. Without that
context, the app can infer a mainland exchange route and ask the wrong provider.
The right rule is:

- users may type `001594`
- search resolves it to one canonical result
- saved asset identity carries `instrument_type=FUND`,
  `instrument_symbol=001594`, and `TIANTIAN_FUND`
- display can still show `001594.FUND` to make the fund route obvious
- sync never guesses again

## Product Behavior

Search should show one clear result for a known fund:

`001594.FUND · 天弘中证银行ETF联接A · Tiantian Fund`

It should not show a second `001594` result with the same title unless it is
truly a different listed instrument.

For ambiguous input, the app may show multiple choices, but each choice must be
visibly different by provider, exchange, or instrument type.

## Data Flow

All user-facing entry points should share one resolver:

```text
raw input -> provider candidates -> canonical identity -> dedupe -> asset create/update
```

The resolver should return:

- display code
- canonical instrument fields
- preferred provider
- quote currency
- provider-specific quote symbol, if needed
- dedupe key

Quote sync should use only saved canonical fields and provider overrides. It
should not reinterpret a bare display code.

## Dedupe Rules

Search and creation should dedupe by canonical identity, not by raw symbol text.

Examples:

- `001594`, `001594.FUND`, and a Tiantian search result for fund code `001594`
  all dedupe to one fund identity.
- `600519`, `600519.SH`, and `600519` with `XSHG` dedupe to one Shanghai equity
  identity.
- `0700`, `0700.HK`, and `0700` with `XHKG` dedupe to one HK equity identity.
- `BTC-USD` and `BTC` with quote currency `USD` dedupe to one crypto identity.

## Existing Data Repair

Add a conservative repair path for known duplicate patterns:

1. Find bare six-digit assets with the same name as a canonical `.FUND` asset.
2. Confirm the canonical asset uses `TIANTIAN_FUND`.
3. If the bare asset has no activities, deactivate or delete it after backup.
4. If the bare asset has activities, migrate activities and quotes to the
   canonical asset only after an explicit verification step.

For the observed local case:

- keep the canonical asset displayed as `001594.FUND`
- remove or deactivate stale `001594`
- no activity migration is needed because the bare asset has no activities

## Scope

### In Scope

- one canonical identity function for search and asset creation
- explicit `FUND` instrument type for funds
- provider-aware search dedupe
- Tiantian fund canonicalization
- mainland exchange canonicalization
- HK/US suffix canonicalization through MIC
- crypto and FX canonicalization
- conservative duplicate repair for existing data

### Out Of Scope

- redesigning the asset table
- changing quote history storage
- changing user-visible ticker labels everywhere
- automatic risky merges when both duplicate assets have activities

## Verification

Minimum checks:

- searching `001594` returns one fund result, not two identical titles
- creating from `001594` stores `instrument_type=FUND`,
  `instrument_symbol=001594`, and displays `001594.FUND`
- syncing that asset fetches Tiantian quotes through the latest available NAV
- searching `600519` still routes to EastMoney Shanghai equity
- searching `0700.HK` still resolves as HK equity
- existing duplicate repair does not touch assets with unrelated names or
  activities
