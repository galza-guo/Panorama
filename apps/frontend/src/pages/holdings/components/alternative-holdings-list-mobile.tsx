import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { getTimeDepositDisplaySnapshot } from "@/lib/panorama-asset-attributes";
import type { AlternativeAssetHolding } from "@/lib/types";
import { ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES } from "@/lib/types";
import { AmountDisplay, GainPercent, Separator, Badge } from "@wealthfolio/ui";
import { Card } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useMemo } from "react";

interface AlternativeHoldingsListMobileProps {
  holdings: AlternativeAssetHolding[];
  isLoading: boolean;
  onRowClick?: (holding: AlternativeAssetHolding) => void;
}

export function AlternativeHoldingsListMobile({
  holdings,
  isLoading,
  onRowClick,
}: AlternativeHoldingsListMobileProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const asOfDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (!holdings || holdings.length === 0) {
    return null;
  }

  const sorted = [...holdings].sort(
    (a, b) =>
      (getTimeDepositDisplaySnapshot(b, asOfDate)?.currentValue ?? parseFloat(b.marketValue)) -
      (getTimeDepositDisplaySnapshot(a, asOfDate)?.currentValue ?? parseFloat(a.marketValue)),
  );

  return (
    <div className="space-y-2">
      {sorted.map((holding) => {
        const timeDepositDisplay = getTimeDepositDisplaySnapshot(holding, asOfDate);
        const kindDisplay =
          ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES[
            holding.kind.toUpperCase() as keyof typeof ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES
          ] ?? holding.kind;

        const gain =
          timeDepositDisplay?.gain ?? (holding.unrealizedGain ? parseFloat(holding.unrealizedGain) : null);
        const gainPct =
          timeDepositDisplay?.gainPct ??
          (holding.unrealizedGainPct ? parseFloat(holding.unrealizedGainPct) : null);
        const currentValue =
          timeDepositDisplay?.currentValue ?? parseFloat(holding.marketValue);

        return (
          <Card
            key={holding.id}
            className="hover:bg-muted/50 cursor-pointer p-3 transition-colors"
            onClick={() => onRowClick?.(holding)}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-1 items-center gap-3 overflow-hidden">
                <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                  <AssetKindIcon kind={holding.kind} size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{holding.name}</p>
                    {timeDepositDisplay?.daysLeft !== undefined ? (
                      <Badge variant="outline" className="text-[10px]">
                        {timeDepositDisplay.daysLeft}d left
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground truncate text-sm">{kindDisplay}</p>
                </div>
              </div>
              <div className="ml-2 text-right">
                <div
                  data-testid={`mobile-time-deposit-value-${holding.id}`}
                  className="flex items-center justify-end gap-1.5"
                >
                  {timeDepositDisplay?.isEstimatedValue ? (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      Est.
                    </Badge>
                  ) : null}
                  <AmountDisplay
                    value={currentValue}
                    currency={holding.currency}
                    isHidden={isBalanceHidden}
                    className="font-medium"
                  />
                </div>
                {gain !== null && gainPct !== null && (
                  <div className="flex items-center justify-end gap-1">
                    <AmountDisplay
                      value={gain}
                      currency={holding.currency}
                      isHidden={isBalanceHidden}
                      colorFormat
                      className="text-xs"
                    />
                    <Separator orientation="vertical" className="mx-1 h-4" />
                    <GainPercent value={gainPct} className="text-xs" />
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function AssetKindIcon({ kind, size = 20 }: { kind: string; size?: number }) {
  switch (kind.toLowerCase()) {
    case "property":
      return <Icons.RealEstateDuotone size={size} />;
    case "vehicle":
      return <Icons.VehicleDuotone size={size} />;
    case "collectible":
      return <Icons.CollectibleDuotone size={size} />;
    case "precious":
      return <Icons.PreciousDuotone size={size} />;
    case "mpf":
      return <Icons.Briefcase size={size} />;
    case "liability":
      return <Icons.LiabilityDuotone size={size} />;
    default:
      return <Icons.OtherAssetDuotone size={size} />;
  }
}
