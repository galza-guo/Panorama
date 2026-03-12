import { describe, expect, it } from "vitest";

import {
  deriveTimeDepositAnnualRate,
  deriveTimeDepositCurrentValue,
  deriveTimeDepositMaturityValue,
  getEffectiveTimeDepositCurrentValue,
  getTimeDepositDerivedMetrics,
} from "./time-deposit-calculations";

describe("time deposit calculations", () => {
  it("derives maturity value from quoted annual rate", () => {
    expect(
      deriveTimeDepositMaturityValue({
        principal: 10000,
        startDate: "2026-01-01",
        maturityDate: "2026-04-11",
        quotedAnnualRatePct: 7.3,
      }),
    ).toBeCloseTo(10200, 6);
  });

  it("derives implied annual rate from maturity value", () => {
    expect(
      deriveTimeDepositAnnualRate({
        principal: 10000,
        startDate: "2026-01-01",
        maturityDate: "2026-04-11",
        guaranteedMaturityValue: 10200,
      }),
    ).toBeCloseTo(7.3, 6);
  });

  it("derives current value before maturity", () => {
    expect(
      deriveTimeDepositCurrentValue({
        principal: 10000,
        startDate: "2026-01-01",
        maturityDate: "2026-04-11",
        asOfDate: "2026-02-20",
        quotedAnnualRatePct: 7.3,
      }),
    ).toBeCloseTo(10100, 6);
  });

  it("uses maturity value after maturity", () => {
    expect(
      deriveTimeDepositCurrentValue({
        principal: 10000,
        startDate: "2026-01-01",
        maturityDate: "2026-04-11",
        asOfDate: "2026-05-01",
        guaranteedMaturityValue: 10200,
      }),
    ).toBeCloseTo(10200, 6);
  });

  it("returns derived metrics for progress and value", () => {
    expect(
      getTimeDepositDerivedMetrics({
        principal: 10000,
        startDate: "2026-01-01",
        maturityDate: "2026-04-11",
        asOfDate: "2026-02-20",
        guaranteedMaturityValue: 10200,
      }),
    ).toEqual({
      daysElapsed: 50,
      daysLeft: 50,
      totalDays: 100,
      progressPct: 0.5,
      annualizedReturnPct: 7.3,
      expectedMaturityValue: 10200,
      estimatedCurrentValue: 10100,
      holdingPeriodReturnPct: 1,
    });
  });

  it("prefers manual override when requested", () => {
    expect(
      getEffectiveTimeDepositCurrentValue({
        principal: 10000,
        startDate: "2026-01-01",
        maturityDate: "2026-04-11",
        asOfDate: "2026-02-20",
        quotedAnnualRatePct: 7.3,
        valuationMode: "manual",
        currentValueOverride: 10123.45,
      }),
    ).toBeCloseTo(10123.45, 6);
  });
});
