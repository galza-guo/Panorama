import type {
  MoneyMovementItem,
  MoneyMovementSummary,
  PeriodSummary,
  PeriodSummaryPeriod,
  ValueMovementItem,
  ValueMovementSummary,
} from "@/lib/types";

import { invoke } from "./platform";

type DecimalLike = string | number;

interface RawPeriodSummary extends Omit<
  PeriodSummary,
  "startNetWorth" | "endNetWorth" | "totalChange" | "moneyMovement" | "valueMovement" | "residual"
> {
  startNetWorth: DecimalLike;
  endNetWorth: DecimalLike;
  totalChange: DecimalLike;
  moneyMovement: RawMoneyMovementSummary;
  valueMovement: RawValueMovementSummary;
  residual: {
    amount: DecimalLike;
    reason?: string | null;
  };
}

interface RawMoneyMovementSummary extends Omit<
  MoneyMovementSummary,
  "inflowsTotal" | "outflowsTotal" | "net" | "topInflows" | "topOutflows"
> {
  inflowsTotal: DecimalLike;
  outflowsTotal: DecimalLike;
  net: DecimalLike;
  topInflows: RawMoneyMovementItem[];
  topOutflows: RawMoneyMovementItem[];
}

interface RawMoneyMovementItem extends Omit<MoneyMovementItem, "amountBase" | "amountOriginal"> {
  amountBase: DecimalLike;
  amountOriginal: DecimalLike;
}

interface RawValueMovementSummary extends Omit<
  ValueMovementSummary,
  "gainsTotal" | "lossesTotal" | "net" | "topGains" | "topLosses"
> {
  gainsTotal: DecimalLike;
  lossesTotal: DecimalLike;
  net: DecimalLike;
  topGains: RawValueMovementItem[];
  topLosses: RawValueMovementItem[];
}

interface RawValueMovementItem extends Omit<ValueMovementItem, "amountBase" | "percentChange"> {
  amountBase: DecimalLike;
  percentChange?: DecimalLike | null;
}

export const getPeriodSummary = async (
  startDate: string,
  endDate: string,
  period: PeriodSummaryPeriod,
): Promise<PeriodSummary> => {
  const summary = await invoke<RawPeriodSummary>("get_period_summary", {
    startDate,
    endDate,
    period,
  });

  return normalizePeriodSummary(summary);
};

function normalizePeriodSummary(summary: RawPeriodSummary): PeriodSummary {
  return {
    ...summary,
    startNetWorth: decimalToString(summary.startNetWorth),
    endNetWorth: decimalToString(summary.endNetWorth),
    totalChange: decimalToString(summary.totalChange),
    moneyMovement: normalizeMoneyMovement(summary.moneyMovement),
    valueMovement: normalizeValueMovement(summary.valueMovement),
    residual: {
      ...summary.residual,
      amount: decimalToString(summary.residual.amount),
    },
  };
}

function normalizeMoneyMovement(summary: RawMoneyMovementSummary): MoneyMovementSummary {
  return {
    inflowsTotal: decimalToString(summary.inflowsTotal),
    outflowsTotal: decimalToString(summary.outflowsTotal),
    net: decimalToString(summary.net),
    topInflows: summary.topInflows.map(normalizeMoneyMovementItem),
    topOutflows: summary.topOutflows.map(normalizeMoneyMovementItem),
  };
}

function normalizeMoneyMovementItem(item: RawMoneyMovementItem): MoneyMovementItem {
  return {
    ...item,
    amountBase: decimalToString(item.amountBase),
    amountOriginal: decimalToString(item.amountOriginal),
  };
}

function normalizeValueMovement(summary: RawValueMovementSummary): ValueMovementSummary {
  return {
    gainsTotal: decimalToString(summary.gainsTotal),
    lossesTotal: decimalToString(summary.lossesTotal),
    net: decimalToString(summary.net),
    topGains: summary.topGains.map(normalizeValueMovementItem),
    topLosses: summary.topLosses.map(normalizeValueMovementItem),
  };
}

function normalizeValueMovementItem(item: RawValueMovementItem): ValueMovementItem {
  return {
    ...item,
    amountBase: decimalToString(item.amountBase),
    percentChange:
      item.percentChange === null || item.percentChange === undefined
        ? item.percentChange
        : decimalToString(item.percentChange),
  };
}

function decimalToString(value: DecimalLike): string {
  return typeof value === "number" ? value.toString() : value;
}
