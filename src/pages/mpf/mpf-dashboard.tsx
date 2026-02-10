import { useMemo, useState } from "react";

import { useAssets } from "@/pages/asset/hooks/use-assets";
import {
  getAssetOwner,
  isMpfAsset,
  normalizeMpfSubfunds,
  parsePanoramaAssetAttributes,
} from "@/lib/panorama-asset-attributes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { AmountDisplay, Page } from "@panorama/ui";
import { MpfAssetEditorSheet } from "./components/mpf-asset-editor-sheet";

interface MpfRow {
  symbol: string;
  name: string;
  owner: string;
  trustee: string;
  currency: string;
  totalValue?: number;
  valuationDate?: string;
  subfunds: {
    name: string;
    units?: number;
    totalValue?: number;
  }[];
  subfundCount: number;
}

type MpfEditorState = { mode: "create" } | { mode: "edit"; symbol: string } | null;

function formatUnits(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(value);
}

export default function MpfDashboard() {
  const { assets, isLoading } = useAssets();
  const [editorState, setEditorState] = useState<MpfEditorState>(null);

  const rows = useMemo<MpfRow[]>(() => {
    return assets
      .filter(isMpfAsset)
      .map((asset) => {
        const attributes = parsePanoramaAssetAttributes(asset.attributes);
        const trusteeText = attributes.trustee?.trim();
        const trustee = trusteeText && trusteeText.length > 0 ? trusteeText : "Unspecified";
        const marketValueHint =
          typeof attributes.market_value === "number" ? attributes.market_value : undefined;
        const valuationDate =
          typeof attributes.valuation_date === "string" ? attributes.valuation_date : undefined;
        const nameText = asset.name?.trim();
        const subfunds = normalizeMpfSubfunds(attributes.mpf_subfunds).map((subfund) => {
          const derivedValue =
            typeof subfund.market_value === "number"
              ? subfund.market_value
              : typeof subfund.units === "number" && typeof subfund.nav === "number"
                ? subfund.units * subfund.nav
                : undefined;

          return {
            name: subfund.name,
            units: subfund.units,
            totalValue: derivedValue,
          };
        });

        const subfundValueTotal = subfunds.reduce(
          (sum, subfund) => sum + (typeof subfund.totalValue === "number" ? subfund.totalValue : 0),
          0,
        );
        const hasSubfundValue = subfunds.some((subfund) => typeof subfund.totalValue === "number");
        const totalValue = marketValueHint ?? (hasSubfundValue ? subfundValueTotal : undefined);
        const subfundCount = subfunds.length;

        return {
          symbol: asset.symbol,
          name: nameText && nameText.length > 0 ? nameText : asset.symbol,
          owner: getAssetOwner(asset) ?? "Unassigned",
          trustee,
          currency: asset.currency ?? "HKD",
          totalValue,
          valuationDate,
          subfunds,
          subfundCount,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assets]);

  const editingAsset = useMemo(
    () =>
      editorState?.mode === "edit"
        ? assets.find((asset) => asset.symbol === editorState.symbol) ?? null
        : null,
    [assets, editorState],
  );

  const trusteeCount = useMemo(() => new Set(rows.map((row) => row.trustee)).size, [rows]);

  const totalValueByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.totalValue === undefined) continue;
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.totalValue);
    }
    return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <Page className="flex flex-col px-4 pt-22 pb-10 md:px-6 md:pt-10 lg:px-8 lg:pt-12">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">MPF</h1>
          <p className="text-muted-foreground text-sm">
            Monitor MPF accounts, subfund units, and latest available values.
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
              <CardTitle className="text-sm font-medium">Total NAV</CardTitle>
            </CardHeader>
            <CardContent>
              {totalValueByCurrency.length === 0 ? (
                <span className="text-muted-foreground text-sm">Not provided</span>
              ) : (
                <div className="space-y-1">
                  {totalValueByCurrency.map(([currency, value]) => (
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
            <div className="flex items-center justify-between gap-3">
              <CardTitle>MPF Accounts</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditorState({ mode: "create" })}
              >
                <Icons.Plus className="mr-2 h-3 w-3" />
                Add MPF Asset
              </Button>
            </div>
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
                <p className="text-muted-foreground mt-1 text-xs">
                  Add your first MPF asset and enter valuation/subfund details.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => setEditorState({ mode: "create" })}
                >
                  <Icons.Plus className="mr-2 h-3 w-3" />
                  Add MPF Asset
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <div
                    key={row.symbol}
                    className="border-border hover:bg-muted/40 rounded-md border px-3 py-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{row.name}</div>
                        <div className="text-muted-foreground text-xs">{row.symbol}</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditorState({ mode: "edit", symbol: row.symbol })}
                      >
                        <Icons.Pencil className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                      <div>{row.owner}</div>
                      <div>{row.trustee}</div>
                      <div>{row.subfundCount} subfunds</div>
                      <div className="text-muted-foreground text-xs md:col-span-2">
                        {row.currency}
                        {row.valuationDate ? ` · ${row.valuationDate}` : ""}
                      </div>
                    </div>

                    <div className="border-border/50 bg-muted/30 mt-3 rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">Total NAV</span>
                        {row.totalValue === undefined ? (
                          <span className="text-muted-foreground text-xs">Not available</span>
                        ) : (
                          <span className="text-sm font-semibold">
                            <AmountDisplay value={row.totalValue} currency={row.currency} />
                          </span>
                        )}
                      </div>

                      {row.subfunds.length === 0 ? (
                        <p className="text-muted-foreground text-xs">No subfund records yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {row.subfunds.map((subfund, index) => (
                            <div
                              key={`${row.symbol}-${subfund.name}-${index}`}
                              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs"
                            >
                              <span className="truncate">{subfund.name}</span>
                              <span className="text-muted-foreground">
                                {typeof subfund.units === "number"
                                  ? `${formatUnits(subfund.units)} units`
                                  : "Units: -"}
                              </span>
                              {typeof subfund.totalValue === "number" ? (
                                <span className="font-medium">
                                  <AmountDisplay value={subfund.totalValue} currency={row.currency} />
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Value: -</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MpfAssetEditorSheet
        asset={editingAsset}
        mode={editorState?.mode === "create" ? "create" : "edit"}
        open={Boolean(editorState)}
        onOpenChange={(open) => {
          if (!open) {
            setEditorState(null);
          }
        }}
      />
    </Page>
  );
}
