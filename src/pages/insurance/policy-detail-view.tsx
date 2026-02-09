import { useMemo } from "react";
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

export default function PolicyDetailView() {
  const navigate = useNavigate();
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
  const guaranteedValue =
    typeof attributes.guaranteed_value === "number" ? attributes.guaranteed_value : undefined;
  const owner = attributes.owner?.trim() || "Unassigned";
  const policyType = attributes.policy_type?.trim() || "Unspecified";
  const trustee = attributes.trustee?.trim() || "Not set";

  return (
    <Page className="flex flex-col px-4 pt-22 pb-10 md:px-6 md:pt-10 lg:px-8 lg:pt-12">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{asset?.name ?? symbol}</h1>
            <p className="text-muted-foreground text-sm">{symbol}</p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
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
                  <CardTitle className="text-sm font-medium">Policy Type</CardTitle>
                </CardHeader>
                <CardContent className="text-base font-semibold">{policyType}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Trustee / Provider</CardTitle>
                </CardHeader>
                <CardContent className="text-base font-semibold">{trustee}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Guaranteed Value</CardTitle>
                </CardHeader>
                <CardContent className="text-base font-semibold">
                  {guaranteedValue === undefined ? (
                    <span className="text-muted-foreground">Not set</span>
                  ) : (
                    <AmountDisplay value={guaranteedValue} currency={asset.currency} />
                  )}
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
    </Page>
  );
}
