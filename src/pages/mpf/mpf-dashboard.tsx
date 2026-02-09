import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useAssets } from "@/pages/asset/hooks/use-assets";
import { getAssetOwner, isMpfAsset, parsePanoramaAssetAttributes } from "@/lib/panorama-asset-attributes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { AmountDisplay, Page } from "@wealthfolio/ui";

interface MpfRow {
  symbol: string;
  name: string;
  owner: string;
  trustee: string;
  currency: string;
  marketValueHint?: number;
  allocation: Record<string, number>;
}

function parseAllocation(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const output: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      output[name] = value;
    }
  }
  return output;
}

export default function MpfDashboard() {
  const { assets, isLoading } = useAssets();

  const rows = useMemo<MpfRow[]>(() => {
    return assets
      .filter(isMpfAsset)
      .map((asset) => {
        const attributes = parsePanoramaAssetAttributes(asset.attributes);
        const trustee = attributes.trustee?.trim() || "Unspecified";
        const marketValueHint =
          typeof attributes.market_value === "number" ? attributes.market_value : undefined;

        return {
          symbol: asset.symbol,
          name: asset.name?.trim() || asset.symbol,
          owner: getAssetOwner(asset) ?? "Unassigned",
          trustee,
          currency: asset.currency || "HKD",
          marketValueHint,
          allocation: parseAllocation(attributes.fund_allocation),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assets]);

  const trusteeCount = useMemo(() => new Set(rows.map((row) => row.trustee)).size, [rows]);

  const aggregateAllocation = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      for (const [fund, weight] of Object.entries(row.allocation)) {
        totals.set(fund, (totals.get(fund) ?? 0) + weight);
      }
    }

    const entries = Array.from(totals.entries());
    const totalWeight = entries.reduce((sum, [, value]) => sum + value, 0);
    if (totalWeight <= 0) {
      return [];
    }

    return entries
      .map(([fund, value]) => ({
        fund,
        value,
        percent: (value / totalWeight) * 100,
      }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 8);
  }, [rows]);

  const valueHintsByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.marketValueHint === undefined) continue;
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.marketValueHint);
    }
    return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <Page className="flex flex-col px-4 pt-22 pb-10 md:px-6 md:pt-10 lg:px-8 lg:pt-12">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">MPF</h1>
          <p className="text-muted-foreground text-sm">
            Monitor MPF accounts and fund allocation snapshots from asset attributes.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">MPF Assets</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{rows.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Trustees</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{trusteeCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Value Hints</CardTitle>
            </CardHeader>
            <CardContent>
              {valueHintsByCurrency.length === 0 ? (
                <span className="text-muted-foreground text-sm">Not provided</span>
              ) : (
                <div className="space-y-1">
                  {valueHintsByCurrency.map(([currency, value]) => (
                    <div key={currency} className="text-sm font-medium">
                      <AmountDisplay value={value} currency={currency} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fund Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))}
              </div>
            ) : aggregateAllocation.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No `fund_allocation` metadata found yet.
              </p>
            ) : (
              <div className="space-y-3">
                {aggregateAllocation.map((item) => (
                  <div key={item.fund} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.fund}</span>
                      <span className="text-muted-foreground">{item.percent.toFixed(1)}%</span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${Math.max(2, item.percent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MPF Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="border-border/50 bg-success/10 rounded-lg border p-6 text-center">
                <p className="text-sm">No MPF assets found.</p>
                <Link
                  to="/activities/manage"
                  className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                >
                  Add MPF activity
                  <Icons.ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <div
                    key={row.symbol}
                    className="border-border grid grid-cols-6 items-center gap-2 rounded-md border px-3 py-3"
                  >
                    <div className="col-span-2">
                      <div className="text-sm font-semibold">{row.name}</div>
                      <div className="text-muted-foreground text-xs">{row.symbol}</div>
                    </div>
                    <div className="text-sm">{row.owner}</div>
                    <div className="text-sm">{row.trustee}</div>
                    <div className="text-sm">{Object.keys(row.allocation).length} funds</div>
                    <div className="text-muted-foreground text-xs">{row.currency}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
