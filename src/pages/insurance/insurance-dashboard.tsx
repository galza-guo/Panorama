import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";

import { useAssets } from "@/pages/asset/hooks/use-assets";
import {
  getAssetOwner,
  isInsuranceAsset,
  parsePanoramaAssetAttributes,
} from "@/lib/panorama-asset-attributes";
import { AmountDisplay, Page } from "@panorama/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { InsurancePolicyEditorSheet } from "./components/insurance-policy-editor-sheet";

interface InsuranceRow {
  symbol: string;
  name: string;
  owner: string;
  provider: string;
  currency: string;
  valuationDate?: string;
  totalPaidToDate?: number;
  withdrawableValue?: number;
  dataSource: string;
}

type InsuranceEditorState = { mode: "create" } | { mode: "edit"; symbol: string } | null;

export default function InsuranceDashboard() {
  const navigate = useNavigate();
  const { assets, isLoading } = useAssets();
  const [editorState, setEditorState] = useState<InsuranceEditorState>(null);

  const insuranceRows = useMemo<InsuranceRow[]>(() => {
    return assets
      .filter(isInsuranceAsset)
      .map((asset) => {
        const attributes = parsePanoramaAssetAttributes(asset.attributes);
        const totalPaidToDate =
          typeof attributes.total_paid_to_date === "number"
            ? attributes.total_paid_to_date
            : undefined;
        const withdrawableValue =
          typeof attributes.withdrawable_value === "number"
            ? attributes.withdrawable_value
            : undefined;
        const providerText =
          typeof attributes.insurance_provider === "string"
            ? attributes.insurance_provider
            : attributes.trustee;
        const ownerText = getAssetOwner(asset);
        const valuationDate =
          typeof attributes.valuation_date === "string" ? attributes.valuation_date : undefined;
        const nameText = asset.name?.trim();
        const provider = providerText?.trim();

        return {
          symbol: asset.symbol,
          name: nameText && nameText.length > 0 ? nameText : asset.symbol,
          owner: ownerText ?? "Unassigned",
          provider: provider && provider.length > 0 ? provider : "Unspecified",
          currency: asset.currency ?? "USD",
          valuationDate,
          totalPaidToDate,
          withdrawableValue,
          dataSource: asset.dataSource,
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

  const ownerCount = useMemo(() => {
    return new Set(insuranceRows.map((row) => row.owner)).size;
  }, [insuranceRows]);

  const totalPaidByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of insuranceRows) {
      if (row.totalPaidToDate === undefined) continue;
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.totalPaidToDate);
    }
    return Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [insuranceRows]);

  const withdrawableByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of insuranceRows) {
      if (row.withdrawableValue === undefined) continue;
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.withdrawableValue);
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
              <CardTitle className="text-sm font-medium">Total Paid To Date</CardTitle>
            </CardHeader>
            <CardContent>
              {totalPaidByCurrency.length === 0 ? (
                <span className="text-muted-foreground text-sm">No values recorded</span>
              ) : (
                <div className="space-y-1">
                  {totalPaidByCurrency.map(([currency, value]) => (
                    <div key={currency} className="text-sm font-medium">
                      <AmountDisplay value={value} currency={currency} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Withdrawable Value</CardTitle>
            </CardHeader>
            <CardContent>
              {withdrawableByCurrency.length === 0 ? (
                <span className="text-muted-foreground text-sm">No values recorded</span>
              ) : (
                <div className="space-y-1">
                  {withdrawableByCurrency.map(([currency, value]) => (
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
              <CardTitle>Policy List</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditorState({ mode: "create" })}
              >
                <Icons.Plus className="mr-2 h-3 w-3" />
                Add Insurance Policy
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
            ) : insuranceRows.length === 0 ? (
              <div className="border-border/50 bg-success/10 rounded-lg border p-6 text-center">
                <p className="text-sm">No insurance assets found.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add your first policy to track invested and withdrawable value.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => setEditorState({ mode: "create" })}
                >
                  <Icons.Plus className="mr-2 h-3 w-3" />
                  Add Insurance Policy
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {insuranceRows.map((row) => (
                  <div
                    key={row.symbol}
                    className="border-border hover:bg-muted/40 rounded-md border px-3 py-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{row.name}</div>
                        <div className="text-muted-foreground text-xs">{row.symbol}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/insurance/${encodeURIComponent(row.symbol)}`)}
                        >
                          Open
                        </Button>
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
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
                      <div>{row.owner}</div>
                      <div>{row.provider}</div>
                      <div>
                        {row.totalPaidToDate === undefined ? (
                          <span className="text-muted-foreground">Paid: -</span>
                        ) : (
                          <span>
                            Paid:{" "}
                            <AmountDisplay value={row.totalPaidToDate} currency={row.currency} />
                          </span>
                        )}
                      </div>
                      <div>
                        {row.withdrawableValue === undefined ? (
                          <span className="text-muted-foreground">Withdrawable: -</span>
                        ) : (
                          <span>
                            Withdrawable:{" "}
                            <AmountDisplay value={row.withdrawableValue} currency={row.currency} />
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {row.valuationDate ? `As of ${row.valuationDate}` : "Date not set"}
                      </div>
                      <div className="text-muted-foreground text-xs">{row.dataSource}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <InsurancePolicyEditorSheet
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
