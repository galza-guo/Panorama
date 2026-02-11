# Market Data & FX

Panorama provides powerful multi-currency and global market support.

## Supported Assets

- **Stocks & ETFs**: US, UK, Europe, Asia, and more.
- **Cryptocurrencies**: Bitcoin, Ethereum, and thousands of altcoins.
- **Currencies**: Forex pairs.

## Ticker Formats

Panorama generally follows the **Yahoo Finance** ticker format.

- **US Stocks**: `AAPL`, `MSFT`
- **London**: `VOD.L`
- **Paris**: `MC.PA`
- **Crypto**: `BTC-USD`

## Currency Handling

Panorama handles currency conversion automatically at four levels:

1.  **Base Currency**: The main currency for your entire portfolio dashboard
    (e.g., USD).
2.  **Account Currency**: The currency a specific account is denominated in
    (e.g., a EUR bank account).
3.  **Asset Currency**: The currency an asset trades in (e.g., TSLA trades in
    USD).
4.  **Activity Currency**: The currency used for a specific transaction.

Historical exchange rates are used to calculate the value of past transactions
correctly.
