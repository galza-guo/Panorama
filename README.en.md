<div align="center">
  <a href="https://github.com/galza-guo/Panorama">
    <img src="apps/frontend/public/logo.svg" alt="Panorama logo" width="84" height="84">
  </a>

  <h1>Panorama</h1>

  <p><strong>Local-first wealth tracker for HK/CN and global portfolios</strong></p>
  <p><strong>面向港股 / A 股 / 全球资产的本地优先财富追踪工具</strong></p>
  <p><strong>Forked from Wealthfolio · 基于 Wealthfolio 的分叉项目</strong></p>

  <p>
    <a href="README.md">中文 README</a>
    ·
    <a href="https://github.com/galza-guo/Panorama/releases">Releases</a>
    ·
    <a href="ROADMAP.md">Roadmap</a>
    ·
    <a href="https://github.com/galza-guo/Panorama/issues">Issues</a>
    ·
    <a href="https://github.com/afadil/wealthfolio">Upstream Wealthfolio</a>
  </p>
</div>

> [!IMPORTANT]
> **Panorama is a community fork of Wealthfolio.**
> **Panorama 是 Wealthfolio 的社区分叉项目。**
>
> It is not the official Wealthfolio distribution. This repository maintains Panorama releases, docs, and localized enhancements on top of the upstream project.
> 它不是 Wealthfolio 官方发行版；这个仓库维护的是 Panorama 自己的发布、文档与本地化增强。

![Panorama screenshot](apps/frontend/public/screenshot.webp)

## What Panorama Is

Panorama builds on top of Wealthfolio v3. It keeps the local-first model, SQLite storage, on-device data ownership, and the addon system, while focusing more directly on workflows that matter to HK/CN users: Hong Kong equities, A-shares, Chinese funds, and long-held real-world assets such as Time Deposits, Insurance, and MPF.

This repository is the main home for Panorama releases, issue tracking, documentation, and notes around upstream synchronization.

## Why This Fork Exists

- Keep Wealthfolio's focused, local-first product direction
- Improve market coverage, symbol handling, and day-to-day price updates for HK/CN assets
- Extend workflows for Time Deposits, Insurance, MPF, and other specialized assets without breaking upstream compatibility unnecessarily
- Keep the upstream AI Assistant and add `DeepSeek` as an additional provider
- Offer more practical sync flows for multi-device or household finance use, especially shared-folder sync on desktop
- Stay compatible with the Wealthfolio v3 addon API where practical

## What Panorama Emphasizes

- **Better China-market coverage**: in addition to the broader market-data stack, Panorama includes more localized paths for A-shares, HK equities, and Chinese funds; the repository includes `EastmoneyCnProvider`.
- **Time deposits as first-class assets**: Time Deposits can derive current value from quoted rates or maturity value, and surface maturity-related information instead of being tracked as a dead manual entry.
- **Specialized assets with dedicated flows**: Insurance and MPF are not side notes; MPF also includes unit-price sync support.
- **Sync that matches real use**: the desktop app includes a shared-folder sync flow that fits tools such as `Syncthing` for multi-device or shared household tracking.
- **AI that stays practical**: Panorama keeps the upstream AI Assistant and adds `DeepSeek` API support.

## Highlights

- Multi-account, multi-asset, multi-currency portfolio tracking
- Performance review, historical portfolio views, and allocation insights
- Localized support for HK equities, A-shares, and Chinese funds
- Time Deposits with derived current value and maturity tracking
- Specialized workflows for Insurance and MPF, including MPF unit-price sync
- AI Assistant with `DeepSeek` provider support
- Desktop shared-folder sync for Syncthing-style setups
- Shared core logic across desktop and web mode
- Addon system, TypeScript SDK, and developer tooling
- Local-first data storage with no requirement to keep your financial data in the cloud

## Who It Is For

- Investors with a mix of HK/CN and global assets
- People who want their financial records to stay local
- Users who need asset types that many mainstream trackers do not handle well
- Households or partners who want to keep the same set of records aligned across devices

## Quick Start

Install `Node.js`, `pnpm`, `Rust`, and `Tauri`, then run:

```bash
git clone https://github.com/galza-guo/Panorama.git
cd Panorama
pnpm install
cp .env.example .env
pnpm tauri dev
```

Common commands:

| Goal | Command |
| --- | --- |
| Desktop dev | `pnpm tauri dev` |
| Web dev | `pnpm run dev:web` |
| Frontend tests | `pnpm test` |
| Rust tests | `cargo test` |
| Type check | `pnpm type-check` |
| Main checks | `pnpm check` |

For web mode, it is recommended to copy `.env.web.example` to `.env.web` before running `pnpm run dev:web`.

If you are building addons, start from the [Addon Documentation Hub](docs/addons/index.md).

## Documentation

- [Activity Types](docs/activities/activity-types.md)
- [Addon Documentation Hub](docs/addons/index.md)
- [Adapter Architecture](docs/architecture/adapters.md)
- [Roadmap](ROADMAP.md)
- [Branding and Upstream Attribution](TRADEMARKS.md)

## Open Source and Attribution

- License: [AGPL-3.0](LICENSE)
- Upstream: [afadil/wealthfolio](https://github.com/afadil/wealthfolio)
- Panorama keeps `Panorama` as the visible product name. Some internal identifiers still use `Wealthfolio` for compatibility and easier upstream sync.

## Acknowledgement / 致谢

Panorama is built on top of Wealthfolio, and we want that upstream provenance to stay explicit. Thanks to the [Wealthfolio](https://github.com/afadil/wealthfolio) project for making that upstream foundation available.

Panorama 建立在 Wealthfolio 的基础之上，我们也会持续把这层上游关系写清楚。感谢 [Wealthfolio](https://github.com/afadil/wealthfolio) 这个上游开源项目提供起点。

`Wealthfolio` is a trademark of Teymz Inc. See [TRADEMARKS.md](TRADEMARKS.md) for attribution and branding guidance.
