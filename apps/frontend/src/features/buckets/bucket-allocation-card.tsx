import type { BucketAllocation } from "@/lib/types";
import { formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { Card } from "@wealthfolio/ui/components/ui/card";

function formatSignedPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "No target";
  }

  const rounded = Math.round(value * 10) / 10;
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded}%`;
}

export function BucketAllocationCard({
  allocation,
  baseCurrency = "USD",
  isLoading = false,
}: {
  allocation?: BucketAllocation;
  baseCurrency?: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="bg-muted/50 mb-3 h-4 w-28 animate-pulse rounded" />
        <div className="bg-muted/30 mb-4 h-5 w-full animate-pulse rounded" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="bg-muted/30 h-11 animate-pulse rounded" />
          ))}
        </div>
      </Card>
    );
  }

  const visibleBuckets =
    allocation?.buckets?.filter(
      (bucket) =>
        bucket.currentAmount > 0 ||
        bucket.targetPercent !== null ||
        bucket.targetPercent !== undefined ||
        bucket.bucketId === "unassigned",
    ) ?? [];

  if (!allocation || visibleBuckets.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
          Bucket Allocation
        </p>
        <p className="text-muted-foreground mt-2 text-sm">No tracked assets in this scope.</p>
      </Card>
    );
  }

  const stripBuckets = visibleBuckets.filter((bucket) => bucket.currentPercent > 0);

  return (
    <Card className="p-4">
      <p className="text-muted-foreground mb-2 text-sm font-medium uppercase tracking-wider">
        Bucket Allocation
      </p>

      <div className="mb-4 flex h-5 w-full overflow-hidden rounded">
        {stripBuckets.map((bucket, index) => (
          <div
            key={bucket.bucketId}
            className="h-full transition-opacity hover:opacity-80"
            style={{
              width: `${bucket.currentPercent}%`,
              backgroundColor: bucket.color,
              boxShadow:
                index === stripBuckets.length - 1 ? "none" : "inset -1px 0 0 var(--background)",
            }}
            title={`${bucket.bucketName} ${formatPercent(bucket.currentPercent / 100)}`}
          />
        ))}
      </div>

      <div className="space-y-3">
        {visibleBuckets.map((bucket) => (
          <div
            key={bucket.bucketId}
            className="flex items-start justify-between gap-3 rounded-xl border px-3 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: bucket.color }}
                />
                <p className="truncate text-sm font-medium">{bucket.bucketName}</p>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Target{" "}
                {bucket.targetPercent !== null && bucket.targetPercent !== undefined
                  ? `${bucket.targetPercent}%`
                  : "None"}
                {" · "}Deviation {formatSignedPercent(bucket.deviationPercent)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium">
                <PrivacyAmount value={bucket.currentAmount} currency={allocation.currency || baseCurrency} />
              </p>
              <p className="text-muted-foreground text-xs">
                {formatPercent(bucket.currentPercent / 100)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
