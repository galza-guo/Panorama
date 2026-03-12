const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TimeDepositDateInput = Date | string;

interface TimeDepositTermInput {
  principal: number;
  startDate: TimeDepositDateInput;
  maturityDate: TimeDepositDateInput;
}

interface TimeDepositRateInput extends TimeDepositTermInput {
  quotedAnnualRatePct: number;
}

interface TimeDepositMaturityInput extends TimeDepositTermInput {
  guaranteedMaturityValue: number;
}

interface TimeDepositCurrentValueInput extends TimeDepositTermInput {
  asOfDate: TimeDepositDateInput;
  quotedAnnualRatePct?: number;
  guaranteedMaturityValue?: number;
}

interface EffectiveCurrentValueInput extends TimeDepositCurrentValueInput {
  valuationMode?: "derived" | "manual";
  currentValueOverride?: number;
}

export interface TimeDepositDerivedMetrics {
  daysElapsed: number;
  daysLeft: number;
  totalDays: number;
  progressPct: number;
  annualizedReturnPct: number;
  expectedMaturityValue: number;
  estimatedCurrentValue: number;
  holdingPeriodReturnPct: number;
}

function toUtcDate(input: TimeDepositDateInput): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }

  const [year, month, day] = input.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getDayDifference(startDate: TimeDepositDateInput, endDate: TimeDepositDateInput): number {
  const start = toUtcDate(startDate);
  const end = toUtcDate(endDate);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number, precision = 10): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function resolveExpectedMaturityValue(
  input: Pick<TimeDepositCurrentValueInput, "principal" | "startDate" | "maturityDate" | "quotedAnnualRatePct" | "guaranteedMaturityValue">,
): number {
  if (typeof input.guaranteedMaturityValue === "number") {
    return input.guaranteedMaturityValue;
  }

  if (typeof input.quotedAnnualRatePct === "number") {
    return deriveTimeDepositMaturityValue({
      principal: input.principal,
      startDate: input.startDate,
      maturityDate: input.maturityDate,
      quotedAnnualRatePct: input.quotedAnnualRatePct,
    });
  }

  return input.principal;
}

function resolveAnnualizedReturnPct(
  input: Pick<TimeDepositCurrentValueInput, "principal" | "startDate" | "maturityDate" | "quotedAnnualRatePct" | "guaranteedMaturityValue">,
): number {
  if (typeof input.guaranteedMaturityValue === "number") {
    return (
      deriveTimeDepositAnnualRate({
        principal: input.principal,
        startDate: input.startDate,
        maturityDate: input.maturityDate,
        guaranteedMaturityValue: input.guaranteedMaturityValue,
      }) ?? 0
    );
  }

  return input.quotedAnnualRatePct ?? 0;
}

export function deriveTimeDepositMaturityValue(input: TimeDepositRateInput): number {
  const totalDays = Math.max(getDayDifference(input.startDate, input.maturityDate), 0);

  if (totalDays === 0) {
    return input.principal;
  }

  return roundTo(input.principal * (1 + (input.quotedAnnualRatePct / 100) * (totalDays / 365)));
}

export function deriveTimeDepositAnnualRate(input: TimeDepositMaturityInput): number | undefined {
  const totalDays = Math.max(getDayDifference(input.startDate, input.maturityDate), 0);

  if (totalDays === 0 || input.principal <= 0) {
    return undefined;
  }

  return roundTo(((input.guaranteedMaturityValue / input.principal - 1) * 365 * 100) / totalDays);
}

export function deriveTimeDepositCurrentValue(input: TimeDepositCurrentValueInput): number {
  const totalDays = Math.max(getDayDifference(input.startDate, input.maturityDate), 0);
  const expectedMaturityValue = resolveExpectedMaturityValue(input);

  if (totalDays === 0) {
    return expectedMaturityValue;
  }

  const elapsedDays = clamp(getDayDifference(input.startDate, input.asOfDate), 0, totalDays);
  return roundTo(
    input.principal + (expectedMaturityValue - input.principal) * (elapsedDays / totalDays),
  );
}

export function getEffectiveTimeDepositCurrentValue(input: EffectiveCurrentValueInput): number {
  if (input.valuationMode === "manual" && typeof input.currentValueOverride === "number") {
    return input.currentValueOverride;
  }

  return deriveTimeDepositCurrentValue(input);
}

export function getTimeDepositDerivedMetrics(
  input: TimeDepositCurrentValueInput,
): TimeDepositDerivedMetrics {
  const totalDays = Math.max(getDayDifference(input.startDate, input.maturityDate), 0);
  const daysElapsed = clamp(getDayDifference(input.startDate, input.asOfDate), 0, totalDays);
  const expectedMaturityValue = resolveExpectedMaturityValue(input);
  const estimatedCurrentValue = deriveTimeDepositCurrentValue(input);
  const annualizedReturnPct = resolveAnnualizedReturnPct(input);
  const progressPct = totalDays === 0 ? 1 : daysElapsed / totalDays;
  const holdingPeriodReturnPct =
    input.principal > 0 ? roundTo(((estimatedCurrentValue / input.principal) - 1) * 100) : 0;

  return {
    daysElapsed,
    daysLeft: Math.max(totalDays - daysElapsed, 0),
    totalDays,
    progressPct,
    annualizedReturnPct: roundTo(annualizedReturnPct),
    expectedMaturityValue,
    estimatedCurrentValue,
    holdingPeriodReturnPct,
  };
}
