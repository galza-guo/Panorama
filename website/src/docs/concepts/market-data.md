# Market Data & FX

Panorama provides powerful multi-currency and global market support.

## Supported Assets

- **Stocks & ETFs**: US, UK, Europe, Asia (A-Shares, HK), and more.
- **Cryptocurrencies**: Bitcoin, Ethereum, and thousands of altcoins.
- **Currencies**: Forex pairs.

## Market Data Sources

Panorama fetches real-time quotes from multiple public providers:

- **Global Markets**: Yahoo Finance, Alpha Vantage, and other open APIs.
- **China A-Shares**: Powered by East Money (东方财富) - no API key required.
- **Chinese Funds**: NAV data from Tiantian Fund (天天基金).
- **Exchange Rates**: Sourced from Open Exchange Rates (OXR) for reliable FX data.

All market data queries are made directly from your computer to these providers.
No intermediate servers are involved.

## Currency Handling

Panorama handles currency conversion automatically at four levels:

1.  **Base Currency**: The main currency for your entire portfolio dashboard
    (e.g., USD, CNY).
2.  **Account Currency**: The currency a specific account is denominated in
    (e.g., a EUR bank account).
3.  **Asset Currency**: The currency an asset trades in (e.g., TSLA trades in
    USD).
4.  **Activity Currency**: The currency used for a specific transaction.

Historical exchange rates are used to calculate the value of past transactions
correctly.
