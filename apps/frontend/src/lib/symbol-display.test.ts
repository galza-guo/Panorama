import { describe, expect, it } from "vitest";

import { getSymbolPresentation } from "./symbol-display";

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

  it("recognizes Tiantian fund provider from provider config", () => {
    expect(
      getSymbolPresentation({
        symbol: "001594",
        providerConfig: { preferred_provider: "TIANTIAN_FUND" },
      }),
    ).toEqual({
      symbol: "001594",
      hint: "Fund / Tiantian",
    });
  });

  it("treats legacy fund suffix labels as Tiantian fund labels", () => {
    expect(getSymbolPresentation({ symbol: "001594.FUND" })).toEqual({
      symbol: "001594",
      hint: "Fund / Tiantian",
    });
  });

  it("strips legacy Mainland China exchange suffixes from display labels", () => {
    expect(getSymbolPresentation({ symbol: "600519.SH" })).toEqual({ symbol: "600519" });
    expect(getSymbolPresentation({ symbol: "000001.SZ" })).toEqual({ symbol: "000001" });
  });

  it("keeps ordinary symbols and share-class dots intact", () => {
    expect(getSymbolPresentation({ symbol: "AAPL" })).toEqual({ symbol: "AAPL" });
    expect(getSymbolPresentation({ symbol: "BRK.B" })).toEqual({ symbol: "BRK.B" });
  });
});
