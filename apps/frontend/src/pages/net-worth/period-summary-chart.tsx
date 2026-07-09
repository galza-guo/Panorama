import { formatAmount } from "@/lib/utils";

interface ContributorItem {
  id: string;
  name: string;
  amount: string;
  detail?: string | null;
}

interface PeriodSummaryChartProps {
  gains: ContributorItem[];
  losses: ContributorItem[];
  currency: string;
  maxRows: number;
}

export function PeriodSummaryChart({ gains, losses, currency, maxRows }: PeriodSummaryChartProps) {
  const rows = Array.from({ length: maxRows }, (_, index) => ({
    gain: gains[index],
    loss: losses[index],
  }));
  const maxAmount = Math.max(
    1,
    ...gains.map((item) => Math.abs(Number(item.amount) || 0)),
    ...losses.map((item) => Math.abs(Number(item.amount) || 0)),
  );

  return (
    <div className="relative">
      <div
        data-testid="period-summary-center-axis"
        className="bg-border absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2"
      />
      <div className="space-y-2">
        {rows.map(({ gain, loss }, index) => (
          <div
            key={index}
            className="grid min-h-9 grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-x-3"
          >
            <ContributorSide item={loss} currency={currency} maxAmount={maxAmount} side="loss" />
            <div />
            <ContributorSide item={gain} currency={currency} maxAmount={maxAmount} side="gain" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ContributorSideProps {
  item?: ContributorItem;
  currency: string;
  maxAmount: number;
  side: "gain" | "loss";
}

function ContributorSide({ item, currency, maxAmount, side }: ContributorSideProps) {
  if (!item) {
    return <div />;
  }

  const amount = Number(item.amount) || 0;
  const width = `${Math.max(8, (Math.abs(amount) / maxAmount) * 100)}%`;
  const isGain = side === "gain";

  return (
    <div className={isGain ? "flex items-center gap-2" : "flex items-center justify-end gap-2"}>
      {!isGain && <ContributorLabel item={item} currency={currency} align="right" />}
      <div
        className={isGain ? "bg-success/70 h-4 rounded-r-sm" : "bg-destructive/70 h-4 rounded-l-sm"}
        style={{ width }}
      />
      {isGain && <ContributorLabel item={item} currency={currency} align="left" />}
    </div>
  );
}

interface ContributorLabelProps {
  item: ContributorItem;
  currency: string;
  align: "left" | "right";
}

function ContributorLabel({ item, currency, align }: ContributorLabelProps) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-left"}>
      <div className="truncate text-xs font-medium">{item.name}</div>
      <div className="text-muted-foreground truncate text-[11px]">
        {formatAmount(item.amount, currency)}
        {item.detail ? ` · ${item.detail}` : ""}
      </div>
    </div>
  );
}
