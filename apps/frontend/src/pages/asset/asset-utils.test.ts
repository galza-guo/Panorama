import { describe, expect, it } from "vitest";

import type { Asset } from "@/lib/types";

import {
  getPanoramaAssetCategory,
  getPanoramaAssetEditLabel,
  getTimeDepositDisplayState,
} from "./asset-utils";

function buildAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "ALT-TD-1",
    name: "HSBC 3M Deposit",
    displayCode: "Time Deposit",
    description: null,
    kind: "OTHER",
    quoteCcy: "HKD",
    quoteSource: null,
    quoteMode: "MANUAL",
    metadata: {
      panorama_category: "time_deposit",
      sub_type: "time_deposit",
      principal: "10000",
      start_date: "2026-01-01",
      maturity_date: "2026-04-11",
      quoted_annual_rate: "7.3",
      valuation_mode: "derived",
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Asset;
}

describe("asset utils", () => {
  it("detects time deposits as a Panorama category", () => {
    expect(getPanoramaAssetCategory(buildAsset())).toBe("Time Deposit");
  });

  it("returns a specialized edit label for time deposits", () => {
    expect(getPanoramaAssetEditLabel(buildAsset())).toBe("Edit Time Deposit");
  });

  it("derives shared display state for estimated time deposits", () => {
    expect(getTimeDepositDisplayState(buildAsset(), "2026-02-20")).toEqual({
      daysLeft: 50,
      isEstimatedValue: true,
    });
  });

  it("does not mark manual time deposit values as estimated", () => {
    expect(
      getTimeDepositDisplayState(
        buildAsset({
          metadata: {
            panorama_category: "time_deposit",
            sub_type: "time_deposit",
            principal: "10000",
            start_date: "2026-01-01",
            maturity_date: "2026-04-11",
            quoted_annual_rate: "7.3",
            valuation_mode: "manual",
          },
        }),
        "2026-02-20",
      ),
    ).toEqual({
      daysLeft: 50,
      isEstimatedValue: false,
    });
  });
});
