import { describe, expect, it } from "vitest";

import { getPercentageToDisplay } from "./account-page";

describe("getPercentageToDisplay", () => {
  it("uses money-weighted return for transactions accounts in ALL interval", () => {
    expect(
      getPercentageToDisplay({
        isHoldingsMode: false,
        selectedIntervalCode: "ALL",
        performance: {
          periodReturn: 0.271408,
          cumulativeMwr: 0.000828,
        },
      }),
    ).toBe(0.000828);
  });

  it("keeps simple return for holdings accounts", () => {
    expect(
      getPercentageToDisplay({
        isHoldingsMode: true,
        selectedIntervalCode: "ALL",
        performance: {
          periodReturn: 0.25,
          cumulativeMwr: 0.01,
        },
      }),
    ).toBe(0.25);
  });
});
