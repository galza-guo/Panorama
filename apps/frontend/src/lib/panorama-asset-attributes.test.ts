import { describe, expect, it } from "vitest";

import { AlternativeAssetKind, type AlternativeAssetHolding } from "./types";
import {
  asFiniteNumber,
  buildInsuranceMetadata,
  buildInsuranceMetadataPatch,
  buildMpfMetadata,
  buildMpfMetadataPatch,
  buildTimeDepositMetadata,
  buildTimeDepositMetadataPatch,
  buildFundAllocationFromSubfunds,
  getAssetOwner,
  getTimeDepositDisplaySnapshot,
  isInsuranceAsset,
  isMpfAsset,
  isTimeDepositAsset,
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
      payment_status: "paying",
      next_due_date: "2026-03-22",
    });

    const attributes = parsePanoramaAssetAttributes(holding.metadata);

    expect(isInsuranceAsset(holding)).toBe(true);
    expect(isMpfAsset(holding)).toBe(false);
    expect(getAssetOwner(holding)).toBe("Alice");
    expect(asFiniteNumber(attributes.total_paid_to_date)).toBe(1200.5);
    expect(attributes.payment_status).toBe("paying");
    expect(attributes.next_due_date).toBe("2026-03-22");
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

  it("detects time deposits from Panorama metadata markers", () => {
    const holding = createHolding({
      panorama_category: "time_deposit",
      sub_type: "time_deposit",
      owner: " Alice ",
      provider: " HSBC ",
      principal: "10000",
      start_date: "2026-01-01",
      maturity_date: "2026-04-11",
      quoted_annual_rate: "7.3",
      guaranteed_maturity_value: "10200",
    });

    const attributes = parsePanoramaAssetAttributes(holding.metadata);

    expect(isTimeDepositAsset(holding)).toBe(true);
    expect(isInsuranceAsset(holding)).toBe(false);
    expect(isMpfAsset(holding)).toBe(false);
    expect(getAssetOwner(holding)).toBe("Alice");
    expect(asFiniteNumber(attributes.principal)).toBe(10000);
    expect(asFiniteNumber(attributes.guaranteed_maturity_value)).toBe(10200);
  });

  it("derives a display snapshot for time deposit holdings", () => {
    const holding = createHolding({
      panorama_category: "time_deposit",
      sub_type: "time_deposit",
      owner: " Alice ",
      provider: " HSBC ",
      principal: "10000",
      start_date: "2026-01-01",
      maturity_date: "2026-04-11",
      quoted_annual_rate: "7.3",
      valuation_mode: "derived",
    });

    expect(getTimeDepositDisplaySnapshot(holding, "2026-02-20")).toEqual({
      currentValue: 10100,
      valuationDate: "2026-02-20",
      daysLeft: 50,
      gain: 100,
      gainPct: 0.01,
      isEstimatedValue: true,
    });
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

  it("builds mpf metadata and patch payloads with derived allocation data", () => {
    const subfunds = [
      {
        name: "Core Accumulation",
        units: 125.5,
        allocation_pct: 60.5,
      },
      {
        name: "Equity Fund",
        units: 80,
        allocation_pct: 39.5,
      },
    ];

    expect(
      buildMpfMetadata({
        owner: "Alice",
        trustee: "HSBC Trustee",
        mpf_scheme: "Employer Scheme",
        valuation_date: "2026-03-02",
        mpf_subfunds: subfunds,
      }),
    ).toEqual({
      panorama_category: "mpf",
      sub_type: "mpf",
      owner: "Alice",
      trustee: "HSBC Trustee",
      mpf_scheme: "Employer Scheme",
      valuation_date: "2026-03-02",
      mpf_subfunds: subfunds,
      fund_allocation: {
        "Core Accumulation": 60.5,
        "Equity Fund": 39.5,
      },
    });

    expect(
      buildMpfMetadataPatch({
        owner: "",
        trustee: "HSBC Trustee",
        mpf_scheme: "",
        valuation_date: "2026-03-02",
        mpf_subfunds: [],
      }),
    ).toEqual({
      panorama_category: "mpf",
      sub_type: "mpf",
      owner: null,
      trustee: "HSBC Trustee",
      mpf_scheme: null,
      valuation_date: "2026-03-02",
      mpf_subfunds: null,
      fund_allocation: null,
    });
  });

  it("builds time deposit metadata and patch payloads", () => {
    expect(
      buildTimeDepositMetadata({
        owner: " Alice ",
        provider: " HSBC ",
        principal: 10000,
        start_date: "2026-01-01",
        maturity_date: "2026-04-11",
        quoted_annual_rate: 7.3,
        guaranteed_maturity_value: 10200,
        valuation_mode: "derived",
        status: "active",
      }),
    ).toEqual({
      panorama_category: "time_deposit",
      sub_type: "time_deposit",
      owner: "Alice",
      provider: "HSBC",
      principal: 10000,
      start_date: "2026-01-01",
      maturity_date: "2026-04-11",
      quoted_annual_rate: 7.3,
      guaranteed_maturity_value: 10200,
      valuation_mode: "derived",
      status: "active",
    });

    expect(
      buildTimeDepositMetadataPatch({
        owner: "",
        provider: " HSBC ",
        principal: undefined,
        start_date: "2026-01-01",
        maturity_date: "",
        quoted_annual_rate: undefined,
        guaranteed_maturity_value: 10200,
        valuation_mode: "manual",
        current_value_override: 10080,
        valuation_date: "2026-02-20",
        status: "active",
      }),
    ).toEqual({
      panorama_category: "time_deposit",
      sub_type: "time_deposit",
      owner: null,
      provider: "HSBC",
      principal: null,
      start_date: "2026-01-01",
      maturity_date: null,
      quoted_annual_rate: null,
      guaranteed_maturity_value: 10200,
      valuation_mode: "manual",
      current_value_override: 10080,
      valuation_date: "2026-02-20",
      status: "active",
    });
  });

  it("builds insurance metadata and patch payloads", () => {
    expect(
      buildInsuranceMetadata({
        owner: " Alice ",
        policy_type: " Whole Life ",
        insurance_provider: " AIA ",
        start_date: "2024-01-01",
        valuation_date: "2026-03-13",
        total_paid_to_date: 100000,
        payment_status: "paying",
        next_due_date: "2026-03-22",
      }),
    ).toEqual({
      panorama_category: "insurance",
      sub_type: "insurance",
      owner: "Alice",
      policy_type: "Whole Life",
      insurance_provider: "AIA",
      start_date: "2024-01-01",
      valuation_date: "2026-03-13",
      total_paid_to_date: 100000,
      payment_status: "paying",
      next_due_date: "2026-03-22",
    });

    expect(
      buildInsuranceMetadataPatch({
        owner: "",
        policy_type: "",
        insurance_provider: " AIA ",
        start_date: "",
        valuation_date: "2026-03-13",
        total_paid_to_date: undefined,
        payment_status: "paid_up",
        next_due_date: "",
      }),
    ).toEqual({
      panorama_category: "insurance",
      sub_type: "insurance",
      owner: null,
      policy_type: null,
      insurance_provider: "AIA",
      start_date: null,
      valuation_date: "2026-03-13",
      total_paid_to_date: null,
      payment_status: "paid_up",
      next_due_date: null,
    });
  });
});
