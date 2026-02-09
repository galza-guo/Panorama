import { Link, useNavigate } from "react-router-dom";
import { useMemo } from "react";

import { useAssets } from "@/pages/asset/hooks/use-assets";
import {
  getAssetOwner,
  isInsuranceAsset,
  parsePanoramaAssetAttributes,
} from "@/lib/panorama-asset-attributes";
import { AmountDisplay, Page } from "@wealthfolio/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";

interface InsuranceRow {
  symbol: string;
  name: string;
  owner: string;
  policyType: string;
  currency: string;
  guaranteedValue?: number;
  dataSource: string;
}

export default function InsuranceDashboard() {
  const navigate = useNavigate();
  const { assets, isLoading } = useAssets();

  const insuranceRows = useMemo<InsuranceRow[]>(() => {
    return assets
      .filter(isInsuranceAsset)
      .map((asset) => {
        const attributes = parsePanoramaAssetAttributes(asset.attributes);
        const guaranteedValue =
          typeof attributes.guaranteed_value === "number" ? attributes.guaranteed_value : undefined;

        return {
          symbol: asset.symbol,
          name: asset.name?.trim() || asset.symbol,
          owner: getAssetOwner(asset) ?? "Unassigned",
          policyType: attributes.policy_type?.trim() || "Unspecified",
          currency: asset.currency || "USD",
          guaranteedValue,
          dataSource: asset.dataSource,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assets]);

  const ownerCount = useMemo(() => {
    return new Set(insuranceRows.map((row) => row.owner)).size;
  }, [insuranceRows]);

  const guaranteedByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of insuranceRows) {
      if (row.guaranteedValue === undefined) continue;
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.guaranteedValue);
    }
    return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [insuranceRows]);

  return (
    <Page className="flex flex-col px-4 pt-22 pb-10 md:px-6 md:pt-10 lg:px-8 lg:pt-12">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insurance</h1>
          <p className="text-muted-foreground text-sm">
            Track policy-level assets and owner metadata from the shared asset table.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Policies</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{insuranceRows.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Owners</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{ownerCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Guaranteed Value</CardTitle>
            </CardHeader>
            <CardContent>
              {guaranteedByCurrency.length === 0 ? (
                <span className="text-muted-foreground text-sm">No values recorded</span>
              ) : (
                <div className="space-y-1">
                  {guaranteedByCurrency.map(([currency, value]) => (
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
            <CardTitle>Policy List</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : insuranceRows.length === 0 ? (
              <div className="border-border/50 bg-success/10 rounded-lg border p-6 text-center">
                <p className="text-sm">No insurance assets found.</p>
                <Link
                  to="/activities/manage"
                  className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                >
                  Add policy activity
                  <Icons.ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {insuranceRows.map((row) => (
                  <button
                    key={row.symbol}
                    type="button"
                    onClick={() => navigate(`/insurance/${encodeURIComponent(row.symbol)}`)}
                    className="border-border hover:bg-muted/40 grid w-full grid-cols-6 items-center gap-2 rounded-md border px-3 py-3 text-left transition-colors"
                  >
                    <div className="col-span-2">
                      <div className="text-sm font-semibold">{row.name}</div>
                      <div className="text-muted-foreground text-xs">{row.symbol}</div>
                    </div>
                    <div className="text-sm">{row.owner}</div>
                    <div className="text-sm">{row.policyType}</div>
                    <div className="text-sm">
                      {row.guaranteedValue === undefined ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <AmountDisplay value={row.guaranteedValue} currency={row.currency} />
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">{row.dataSource}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
