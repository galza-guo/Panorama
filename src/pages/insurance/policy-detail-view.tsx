import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getAssetProfile } from "@/commands/market-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { parsePanoramaAssetAttributes } from "@/lib/panorama-asset-attributes";
import { QueryKeys } from "@/lib/query-keys";
import { Asset } from "@/lib/types";
import { AmountDisplay, Button, Page } from "@wealthfolio/ui";
import { InsurancePolicyEditorSheet } from "./components/insurance-policy-editor-sheet";

export default function PolicyDetailView() {
  const navigate = useNavigate();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const { symbol: encodedSymbol = "" } = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(encodedSymbol);

  const {
    data: asset,
    isLoading,
    isError,
  } = useQuery<Asset, Error>({
    queryKey: [QueryKeys.ASSET_DATA, symbol],
    queryFn: () => getAssetProfile(symbol),
    enabled: Boolean(symbol),
  });

  const attributes = useMemo(() => parsePanoramaAssetAttributes(asset?.attributes), [asset]);
  const ownerText = attributes.owner?.trim();
  const owner = ownerText && ownerText.length > 0 ? ownerText : "Unassigned";
  const providerText =
    typeof attributes.insurance_provider === "string"
      ? attributes.insurance_provider
      : attributes.trustee;
  const provider = providerText ?? "Not set";
  const totalPaidToDate =
    typeof attributes.total_paid_to_date === "number" ? attributes.total_paid_to_date : undefined;
  const withdrawableValue =
    typeof attributes.withdrawable_value === "number" ? attributes.withdrawable_value : undefined;
  const valuationDate =
    typeof attributes.valuation_date === "string" ? attributes.valuation_date : undefined;

  return (
    <Page className="flex flex-col px-4 pt-22 pb-10 md:px-6 md:pt-10 lg:px-8 lg:pt-12">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{asset?.name ?? symbol}</h1>
            <p className="text-muted-foreground text-sm">{symbol}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsEditorOpen(true)} disabled={!asset}>
              <Icons.Pencil className="mr-2 h-4 w-4" />
              Edit Policy
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <Icons.ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError || !asset ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm">Unable to load this policy.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Owner</CardTitle>
                </CardHeader>
                <CardContent className="text-base font-semibold">{owner}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Provider</CardTitle>
                </CardHeader>
                <CardContent className="text-base font-semibold">{provider}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Paid To Date</CardTitle>
                </CardHeader>
                <CardContent className="text-base font-semibold">
                  {totalPaidToDate === undefined ? (
                    <span className="text-muted-foreground">Not set</span>
                  ) : (
                    <AmountDisplay value={totalPaidToDate} currency={asset.currency} />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Withdrawable Value</CardTitle>
                </CardHeader>
                <CardContent className="text-base font-semibold">
                  {withdrawableValue === undefined ? (
                    <span className="text-muted-foreground">Not set</span>
                  ) : (
                    <AmountDisplay value={withdrawableValue} currency={asset.currency} />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Valuation Date</CardTitle>
                </CardHeader>
                <CardContent className="text-base font-semibold">
                  {valuationDate ?? <span className="text-muted-foreground">Not set</span>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Attributes JSON</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted/40 overflow-auto rounded-md p-3 text-xs">
                  {JSON.stringify(attributes, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Link to={`/holdings/${encodeURIComponent(symbol)}`} className="text-sm underline">
                Open Holding View
              </Link>
              <Link to="/activities/manage" className="text-sm underline">
                Edit via Activities
              </Link>
            </div>
          </>
        )}
      </div>

      <InsurancePolicyEditorSheet
        mode="edit"
        asset={asset ?? null}
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
      />
    </Page>
  );
}
