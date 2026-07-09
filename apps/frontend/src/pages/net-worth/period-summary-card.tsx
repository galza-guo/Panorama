import { Skeleton } from "@panorama/ui/components/ui/skeleton";

import type { MoneyMovementItem, PeriodSummary, ValueMovementItem } from "@/lib/types";
import { formatAmount } from "@/lib/utils";
import { PeriodSummaryChart } from "./period-summary-chart";

interface PeriodSummaryCardProps {
  summary?: PeriodSummary;
  isLoading: boolean;
  intervalDescription?: string;
  currency: string;
}

export function PeriodSummaryCard({
  summary,
  isLoading,
  intervalDescription,
  currency,
}: PeriodSummaryCardProps) {
  if (isLoading) {
    return (
      <div className="border-border bg-card shadow-xs rounded-lg border p-4 md:p-5">
        <Skeleton className="h-5 w-44" />
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    );
  }

  if (!summary?.actualStartDate || !summary.actualEndDate) {
    return null;
  }

  const totalChange = Number(summary.totalChange) || 0;
  const residual = Number(summary.residual.amount) || 0;

  return (
    <section
      data-testid="period-summary-card"
      className="border-border bg-card shadow-xs rounded-lg border p-4 md:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Period summary</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {summary.actualStartDate} to {summary.actualEndDate}
            {intervalDescription ? ` · ${intervalDescription}` : ""}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-muted-foreground text-xs">Net worth change</p>
          <p
            className={
              totalChange >= 0
                ? "text-success text-lg font-semibold"
                : "text-destructive text-lg font-semibold"
            }
          >
            {formatAmount(summary.totalChange, currency)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <SummaryLane
          title="Money movement"
          net={summary.moneyMovement.net}
          positiveLabel="Inflows"
          positiveTotal={summary.moneyMovement.inflowsTotal}
          negativeLabel="Outflows"
          negativeTotal={summary.moneyMovement.outflowsTotal}
          gains={summary.moneyMovement.topInflows.map(moneyContributor)}
          losses={summary.moneyMovement.topOutflows.map(moneyContributor)}
          currency={currency}
          maxRows={3}
        />
        <SummaryLane
          title="Holding value movement"
          net={summary.valueMovement.net}
          positiveLabel="Gains"
          positiveTotal={summary.valueMovement.gainsTotal}
          negativeLabel="Losses"
          negativeTotal={summary.valueMovement.lossesTotal}
          gains={summary.valueMovement.topGains.map(valueContributor)}
          losses={summary.valueMovement.topLosses.map(valueContributor)}
          currency={currency}
          maxRows={5}
        />
      </div>

      {(Math.abs(residual) > 0.01 || summary.warnings.length > 0) && (
        <div className="border-border bg-muted/30 mt-5 rounded-md border px-3 py-2">
          <p className="text-muted-foreground text-xs">
            Residual: {formatAmount(summary.residual.amount, currency)}
            {summary.residual.reason ? ` · ${summary.residual.reason}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}

interface SummaryLaneProps {
  title: string;
  net: string;
  positiveLabel: string;
  positiveTotal: string;
  negativeLabel: string;
  negativeTotal: string;
  gains: ContributorItem[];
  losses: ContributorItem[];
  currency: string;
  maxRows: number;
}

interface ContributorItem {
  id: string;
  name: string;
  amount: string;
  detail?: string | null;
}

function SummaryLane({
  title,
  net,
  positiveLabel,
  positiveTotal,
  negativeLabel,
  negativeTotal,
  gains,
  losses,
  currency,
  maxRows,
}: SummaryLaneProps) {
  const netAmount = Number(net) || 0;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-muted-foreground text-xs font-semibold uppercase">{title}</h3>
          <p
            className={
              netAmount >= 0
                ? "text-success text-sm font-medium"
                : "text-destructive text-sm font-medium"
            }
          >
            {formatAmount(net, currency)}
          </p>
        </div>
        <div className="text-muted-foreground text-right text-[11px]">
          <div>
            {positiveLabel}: {formatAmount(positiveTotal, currency)}
          </div>
          <div>
            {negativeLabel}: {formatAmount(negativeTotal, currency)}
          </div>
        </div>
      </div>
      <PeriodSummaryChart gains={gains} losses={losses} currency={currency} maxRows={maxRows} />
    </div>
  );
}

function moneyContributor(item: MoneyMovementItem): ContributorItem {
  return {
    id: item.activityId,
    name: item.note || item.accountName || item.activityType,
    amount: item.amountBase,
    detail: item.note ? item.accountName : item.activityType,
  };
}

function valueContributor(item: ValueMovementItem): ContributorItem {
  return {
    id: item.holdingId,
    name: item.symbol || item.name,
    amount: item.amountBase,
    detail: item.accountName,
  };
}
