# Activity Types

Panorama categorizes financial movements into specific activity types to
accurately track your portfolio's performance and tax implications.

| Type             | Description                                       | Cash Impact | Asset Impact    |
| :--------------- | :------------------------------------------------ | :---------- | :-------------- |
| **BUY**          | Buy an asset                                      | Decrease    | Increase        |
| **SELL**         | Sell an asset                                     | Increase    | Decrease        |
| **DIVIDEND**     | Cash received from an asset (e.g. stock dividend) | Increase    | None            |
| **INTEREST**     | Interest received from cash or bonds              | Increase    | None            |
| **DEPOSIT**      | Add cash to an account                            | Increase    | None            |
| **WITHDRAWAL**   | Remove cash from an account                       | Decrease    | None            |
| **FEE**          | Cost of transaction or maintenance                | Decrease    | None            |
| **TAX**          | Tax paid                                          | Decrease    | None            |
| **TRANSFER_IN**  | Moving assets/cash into an account                | Increase    | Increase        |
| **TRANSFER_OUT** | Moving assets/cash out of an account              | Decrease    | Decrease        |
| **SPLIT**        | Stock split (e.g. 2-for-1)                        | None        | Change Quantity |

## Quick Start Cheat Sheet

- **Starting Fresh**: Use **DEPOSIT** to fund your account, then **BUY** to
  purchase assets.
- **Importing History**: If importing from a broker, ensure your CSV maps "Buy"
  and "Sell" correctly.
- **Income**: Use **DIVIDEND** for payouts from stocks/ETFs and **INTEREST** for
  bank interest.
