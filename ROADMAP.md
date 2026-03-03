# Panorama Roadmap

## Vision

To help individuals build their wealth with a safe, privacy-focused, and
localized tool that tracks global portfolios alongside HK/CN-specific assets
and workflows.

## Strategy

1. Build a polished application that focuses on the essentials
2. Underdo the competition by offering a simpler, more focused alternative
3. Fight feature creep and resist creating a bloated app
4. Avoid complexity at all costs
5. Provide clear insights on how portfolios are performing against long-term
   goals

## What We Believe In

1. **Your Privacy**: Your money info stays on your computer. You retain complete
   control over your financial information.
2. **Easy to Use**: Anyone can track their investments with our simple design.
3. **No Lock-in**: Local-first by default. Optional upstream services such as
   Wealthfolio Connect should remain exactly that: optional.
4. **Extensible**: Through the addons system and catalog, users can easily
   enhance functionality.
5. **Beautiful and Focused**: We believe in crafting an app that's visually
   appealing yet doesn't distract from its core purpose.

## Roadmap

### Phase 1: Foundation (Completed)

- [x] Track investments across multiple accounts
- [x] Local-first data storage (SQLite)
- [x] Simple, intuitive design
- [x] Multi-currency support with exchange rates
- [x] Performance analytics and historical tracking

### Phase 2: Core Features (Completed)

- [x] Data export (CSV, SQLite, JSON)
- [x] Multiple market data providers (Yahoo Finance, Alpha Vantage, MarketData)
- [x] Stock split handling
- [x] Enhanced portfolio history calculation
- [x] Cross-platform builds (Windows, macOS, Linux)
- [x] Advanced CSV import with field mapping
- [x] Addons system for extending functionality
- [x] Insurance asset workflow
- [x] MPF asset workflow
- [x] CN/HK symbol normalization and localized market data providers

### Phase 3: Multi-Platform (Current - v3.0)

- [x] Self-hosted web app with Docker support
- [x] REST API server (Axum)
- [x] Mobile app (iOS/Android via Tauri)
- [ ] Wealthfolio Connect: Device sync with end-to-end encryption (E2EE)
- [ ] Wealthfolio Connect: broker data sync service

**Wealthfolio Connect** is an optional paid subscription to sustain development:

- Automatic transaction sync from supported brokers
- Secure device-to-device sync with E2EE

### Phase 4: Wealth Tracking

- [ ] Liabilities and debt tracking
- [ ] Alternative assets (real estate, vehicles, collectibles)
- [ ] Options trading support

### Phase 5: Smart Tools

- [ ] AI assistant addon (local LLMs via Ollama/LM Studio, or BYOK for
      OpenAI/Anthropic)
- [ ] Portfolio analysis: sector allocation, concentration risk, dividend yield
- [ ] Monte Carlo projection for portfolio outcomes
- [ ] Retirement/FIRE planner with withdrawal strategies

### Phase 6: Ecosystem

- [ ] Addons catalog/marketplace for community addons
- [ ] Addon monetization for developers

### Always Doing

- Keeping the app safe and up-to-date
- Performance improvements based on user feedback
- Security audits and privacy enhancements

---

We're building Panorama to be a practical, local-first alternative to online
investment trackers, especially for users who need HK/CN market coverage
without giving up privacy. The plan will evolve, but the priorities stay the
same: private data, clear workflows, and focused functionality.

Ideas and feedback welcome - open an issue at
<https://github.com/galza-guo/Panorama/issues>.
