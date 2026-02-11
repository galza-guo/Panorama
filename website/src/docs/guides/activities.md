# Managing Activities

Activities are the heart of Panorama. Every trade, dividend, or deposit is an
"Activity".

## Adding Activities

You can add activities in two ways:

1.  **Manual Entry**: Click the "**+**" button, select the activity type (Buy,
    Sell, etc.), and fill in the details.
2.  **CSV Import**: Import a history file from your broker.

## CSV Import Guide

Panorama supports a generic CSV format. Your CSV should ideally have the
following columns:

- `Date` (YYYY-MM-DD)
- `Type` (Buy, Sell, Deposit, etc.)
- `Symbol` (e.g. AAPL)
- `Quantity`
- `Price`
- `Fee` (Optional)
- `Currency` (Optional, defaults to account currency)

## Editing & Deleting

You can edit or delete any activity from the **Activities** tab. Click on a row
to open the details pane, where you can modify values or delete the entry
entirely.
