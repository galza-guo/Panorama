import type { Asset } from "./types";

import { isInsuranceAsset, isMpfAsset } from "./panorama-asset-attributes";

function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    symbol: "TEST.FUND",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    currency: "HKD",
    dataSource: "MANUAL",
    ...overrides,
  };
}

describe("panorama asset classification", () => {
  it("keeps MPF assets out of insurance list even when cash-flow fields exist", () => {
    const asset = createAsset({
      assetClass: "MPF",
      attributes: JSON.stringify({
        total_paid_to_date: 10000,
        withdrawable_value: 12000,
        trustee: "Manulife",
      }),
    });

    expect(isMpfAsset(asset)).toBe(true);
    expect(isInsuranceAsset(asset)).toBe(false);
  });

  it("keeps insurance assets out of MPF list", () => {
    const asset = createAsset({
      assetClass: "Insurance",
      attributes: JSON.stringify({
        insurance_provider: "AIA",
        total_paid_to_date: 8000,
        withdrawable_value: 7800,
      }),
    });

    expect(isInsuranceAsset(asset)).toBe(true);
    expect(isMpfAsset(asset)).toBe(false);
  });

  it("detects legacy insurance assets with only cash-flow fields", () => {
    const asset = createAsset({
      attributes: JSON.stringify({
        total_paid_to_date: 5000,
        withdrawable_value: 4200,
      }),
    });

    expect(isInsuranceAsset(asset)).toBe(true);
    expect(isMpfAsset(asset)).toBe(false);
  });
});
