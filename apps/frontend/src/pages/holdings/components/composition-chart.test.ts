import { describe, expect, it } from "vitest";

import { getSymbolPresentation } from "@/lib/symbol-display";

describe("getSymbolPresentation", () => {
  it("uses a bare primary label for Tiantian fund display codes", () => {
    expect(
      getSymbolPresentation({
        symbol: "001594.FUND",
        preferredProvider: "TIANTIAN_FUND",
      }),
    ).toEqual({
      symbol: "001594",
      hint: "Fund / Tiantian",
    });
  });

  it("recognizes legacy fund suffix labels even without a provider", () => {
    expect(getSymbolPresentation({ symbol: "001594.FUND" })).toEqual({
      symbol: "001594",
      hint: "Fund / Tiantian",
    });
  });

  it("does not add hints for ordinary symbols", () => {
    expect(getSymbolPresentation({ symbol: "AAPL", preferredProvider: "YAHOO" })).toEqual({
      symbol: "AAPL",
    });
  });
});
