# Market Data & FX

Panorama provides powerful multi-currency and global market support.

## Supported Assets

- **Stocks & ETFs**: US, UK, Europe, Asia (A-Shares, HK), and more.
- **Cryptocurrencies**: Bitcoin, Ethereum, and thousands of altcoins.
- **Currencies**: Forex pairs.

## Ticker Formats

Panorama supports **Yahoo Finance** formats for most global assets, and specific
formats for Chinese markets.

- **US Stocks**: `AAPL`, `MSFT`
- **China A-Shares**: `600519.SH` (Shanghai), `000001.SZ` (Shenzhen)
- **China Funds**: `161725.OF` (Public/OTC Funds)
- **Hong Kong**: `0700.HK` (Tencent)
- **London**: `VOD.L`
- **Crypto**: `BTC-USD`

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
