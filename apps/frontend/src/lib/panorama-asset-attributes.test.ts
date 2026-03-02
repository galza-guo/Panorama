import { describe, expect, it } from "vitest";

import { AlternativeAssetKind, type AlternativeAssetHolding } from "./types";
import {
  asFiniteNumber,
  buildFundAllocationFromSubfunds,
  getAssetOwner,
  isInsuranceAsset,
  isMpfAsset,
  normalizeMpfSubfunds,
  parsePanoramaAssetAttributes,
} from "./panorama-asset-attributes";

function createHolding(
  metadata?: AlternativeAssetHolding["metadata"],
  overrides: Partial<AlternativeAssetHolding> = {},
): AlternativeAssetHolding {
  return {
    id: "ALT-123",
    kind: AlternativeAssetKind.OTHER,
    name: "Panorama Asset",
    symbol: "Other",
    currency: "HKD",
    marketValue: "1000",
    valuationDate: "2026-03-02T00:00:00Z",
    metadata,
    ...overrides,
  };
}

describe("panorama asset attributes", () => {
  it("detects insurance holdings from Panorama metadata markers", () => {
    const holding = createHolding({
      panorama_category: "insurance",
      sub_type: "insurance",
      owner: " Alice ",
      insurance_provider: "AIA",
      total_paid_to_date: "1200.5",
      withdrawable_value: 980.25,
    });

    const attributes = parsePanoramaAssetAttributes(holding.metadata);

    expect(isInsuranceAsset(holding)).toBe(true);
    expect(isMpfAsset(holding)).toBe(false);
    expect(getAssetOwner(holding)).toBe("Alice");
    expect(asFiniteNumber(attributes.total_paid_to_date)).toBe(1200.5);
    expect(asFiniteNumber(attributes.withdrawable_value)).toBe(980.25);
  });

  it("keeps insurance and mpf classifications mutually exclusive", () => {
    const holding = createHolding({
      panorama_category: "insurance",
      insurance_provider: "AIA",
      mpf_scheme: "Employer Plan",
      trustee: "HSBC",
    });

    expect(isInsuranceAsset(holding)).toBe(false);
    expect(isMpfAsset(holding)).toBe(true);
  });

  it("normalizes mpf subfunds and derives fallback fund allocations", () => {
    const subfunds = normalizeMpfSubfunds([
      {
        name: " Core Accumulation ",
        allocation_pct: "60.5",
      },
      {
        name: "Equity Fund",
        market_value: 3950,
      },
      {
        invalid: true,
      },
    ]);

    expect(subfunds).toEqual([
      {
        name: "Core Accumulation",
        allocation_pct: 60.5,
      },
      {
        name: "Equity Fund",
        market_value: 3950,
      },
    ]);

    expect(
      buildFundAllocationFromSubfunds([
        { name: "Bond Fund", market_value: 2000 },
        { name: "Equity Fund", market_value: 3000 },
      ]),
    ).toEqual({
      "Bond Fund": 40,
      "Equity Fund": 60,
    });
  });
});
