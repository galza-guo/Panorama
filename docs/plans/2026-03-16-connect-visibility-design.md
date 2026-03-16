# Wealthfolio Connect Visibility Design

**Goal:** Add a user-facing toggle in General settings that hides Wealthfolio Connect entry points when disabled.

**Approach:** Store a new persisted settings flag, `wealthfolioConnectVisible`, defaulting to `true`. Use that setting to filter the main sidebar, the Settings > Connections navigation item, and route access to `/connect` and `/settings/connect`.

**Scope:**
- Add persisted settings field in core/storage/frontend types.
- Add a General settings toggle at the bottom of the page.
- Hide Wealthfolio Connect in the main sidebar and Settings navigation when disabled.
- Redirect hidden routes away from Connect pages.

**Out of Scope:**
- Disabling backend Connect/device-sync capabilities.
- Hiding Market Data or AI Providers from the Connections group.
- Any changes to Wealthfolio Connect functionality itself.
