import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Separator } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { RefreshQuotesConfirmDialog } from "./refresh-quotes-confirm-dialog";

import { useAlternativeHoldings } from "@/hooks/use-alternative-assets";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import {
  buildMpfMetadata,
  buildMpfMetadataPatch,
  normalizeMpfSubfunds,
  parsePanoramaAssetAttributes,
  type PanoramaMpfSubfund,
} from "@/lib/panorama-asset-attributes";
import { QueryKeys } from "@/lib/query-keys";
import type { AlternativeAssetHolding } from "@/lib/types";
import {
  MpfAssetEditorSheet,
  type MpfAssetFormValues,
} from "@/pages/mpf/components/mpf-asset-editor-sheet";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { syncPanoramaMpfUnitPrices } from "@/adapters";
import { useAlternativeAssetMutations } from "./alternative-assets/hooks";
import { SettingsHeader } from "../settings/settings-header";
import { AssetEditSheet } from "./asset-edit-sheet";
import { getPanoramaAssetCategory, ParsedAsset, toParsedAsset } from "./asset-utils";
import { AssetsTable } from "./assets-table";
import { AssetsTableMobile } from "./assets-table-mobile";
import { useAssetManagement } from "./hooks/use-asset-management";
import { useAssets } from "./hooks/use-assets";
import { useLatestQuotes } from "./hooks/use-latest-quotes";

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function mergeSubfunds(
  existingRaw: unknown,
  nextRows: MpfAssetFormValues["subfunds"],
): PanoramaMpfSubfund[] {
  const existingByName = new Map(
    normalizeMpfSubfunds(existingRaw).map(
      (subfund) => [subfund.name.trim().toLowerCase(), subfund] as const,
    ),
  );

  return nextRows
    .map((row) => {
      const name = row.name.trim();
      if (!name) {
        return null;
      }

      const units = parseOptionalNumber(row.units);
      const existing = existingByName.get(name.toLowerCase());

      return {
        name,
        ...(existing?.code ? { code: existing.code } : {}),
        ...(units !== undefined ? { units } : {}),
        ...(existing?.nav !== undefined ? { nav: existing.nav } : {}),
        ...(existing?.market_value !== undefined ? { market_value: existing.market_value } : {}),
        ...(existing?.allocation_pct !== undefined
          ? { allocation_pct: existing.allocation_pct }
          : {}),
      } satisfies PanoramaMpfSubfund;
    })
    .filter((entry): entry is PanoramaMpfSubfund => Boolean(entry));
}

export default function AssetsPage() {
  const queryClient = useQueryClient();
  const { assets, isLoading } = useAssets();
  const { data: alternativeHoldings = [] } = useAlternativeHoldings();
  const { deleteAssetMutation } = useAssetManagement();
  const { createMutation, updateMetadataMutation, updateValuationMutation } =
    useAlternativeAssetMutations();
  const refetchQuotesMutation = useSyncMarketDataMutation(true);
  const updateQuotesMutation = useSyncMarketDataMutation(false);
  const syncMpfMutation = useMutation({
    mutationFn: syncPanoramaMpfUnitPrices,
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.NET_WORTH] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.NET_WORTH_HISTORY] });
      toast({
        title: "MPF sync complete",
        description:
          updated > 0 ? `${updated} MPF asset(s) updated.` : "No MPF price updates were found.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "MPF sync failed",
        description: error instanceof Error ? error.message : "Unable to sync MPF prices.",
        variant: "destructive",
      });
    },
  });
  const isMobileViewport = useIsMobileViewport();

  const parsedAssets = useMemo(() => assets.map(toParsedAsset), [assets]);
  const assetIds = useMemo(() => parsedAssets.map((asset) => asset.id), [parsedAssets]);
  const { data: latestQuotes = {}, isLoading: isQuotesLoading } = useLatestQuotes(assetIds);

  const [editingAsset, setEditingAsset] = useState<ParsedAsset | null>(null);
  const [isCreatingMpfAsset, setIsCreatingMpfAsset] = useState(false);
  const [editingMpfAssetId, setEditingMpfAssetId] = useState<string | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<ParsedAsset | null>(null);
  const [assetPendingRefetch, setAssetPendingRefetch] = useState<ParsedAsset | null>(null);

  const editingMpfHolding = useMemo<AlternativeAssetHolding | null>(() => {
    if (!editingMpfAssetId) {
      return null;
    }

    return alternativeHoldings.find((holding) => holding.id === editingMpfAssetId) ?? null;
  }, [alternativeHoldings, editingMpfAssetId]);

  const isSavingMpfAsset =
    createMutation.isPending ||
    updateMetadataMutation.isPending ||
    updateValuationMutation.isPending;

  const handleEditAsset = (asset: ParsedAsset) => {
    if (getPanoramaAssetCategory(asset) === "MPF") {
      setIsCreatingMpfAsset(false);
      setEditingMpfAssetId(asset.id);
      return;
    }

    setEditingAsset(asset);
  };

  const handleDelete = async () => {
    if (!assetPendingDelete) return;
    await deleteAssetMutation.mutateAsync(assetPendingDelete.id);
    setAssetPendingDelete(null);
  };

  const handleUpdateQuotes = (asset: ParsedAsset) => {
    if (getPanoramaAssetCategory(asset) === "MPF") {
      syncMpfMutation.mutate();
      return;
    }

    updateQuotesMutation.mutate([asset.id]);
  };

  const handleRefetchQuotes = (asset: ParsedAsset) => {
    setAssetPendingRefetch(asset);
  };

  const handleMpfSubmit = async (values: MpfAssetFormValues) => {
    const valuationDate = toIsoDate(values.valuationDate);

    if (!editingMpfHolding) {
      const subfunds = mergeSubfunds([], values.subfunds);
      const response = await createMutation.mutateAsync({
        kind: "mpf",
        name: values.name,
        currency: values.currency,
        currentValue: values.currentValue,
        valueDate: valuationDate,
        metadata: buildMpfMetadata({
          owner: values.owner,
          trustee: values.trustee,
          mpf_scheme: values.scheme,
          valuation_date: valuationDate,
          mpf_subfunds: subfunds,
        }),
      });

      if (values.notes) {
        await updateMetadataMutation.mutateAsync({
          assetId: response.assetId,
          name: values.name,
          notes: values.notes,
          metadata: buildMpfMetadataPatch({
            owner: values.owner,
            trustee: values.trustee,
            mpf_scheme: values.scheme,
            valuation_date: valuationDate,
            mpf_subfunds: subfunds,
          }),
        });
      }

      setIsCreatingMpfAsset(false);
      return;
    }

    const existingAttributes = parsePanoramaAssetAttributes(editingMpfHolding.metadata);
    const mergedSubfunds = mergeSubfunds(existingAttributes.mpf_subfunds, values.subfunds);

    await updateMetadataMutation.mutateAsync({
      assetId: editingMpfHolding.id,
      name: values.name,
      notes: values.notes || null,
      metadata: buildMpfMetadataPatch({
        owner: values.owner,
        trustee: values.trustee,
        mpf_scheme: values.scheme,
        valuation_date: valuationDate,
        mpf_subfunds: mergedSubfunds,
      }),
    });

    const existingQuoteDate = editingMpfHolding.valuationDate.slice(0, 10);
    const valuationChanged =
      editingMpfHolding.marketValue !== values.currentValue || existingQuoteDate !== valuationDate;

    if (valuationChanged) {
      await updateValuationMutation.mutateAsync({
        assetId: editingMpfHolding.id,
        request: {
          value: values.currentValue,
          date: valuationDate,
        },
      });
    }

    setEditingMpfAssetId(null);
  };

  return (
    <div className="space-y-6">
      <SettingsHeader heading="Assets" text="Browse and manage assets tracked in your portfolio.">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setEditingAsset(null);
            setEditingMpfAssetId(null);
            setIsCreatingMpfAsset(true);
          }}
        >
          <Icons.Plus className="mr-2 h-3 w-3" />
          Add MPF Asset
        </Button>
      </SettingsHeader>
      <Separator />
      <div className="w-full">
        {isMobileViewport ? (
          <AssetsTableMobile
            assets={parsedAssets}
            latestQuotes={latestQuotes}
            isLoading={isLoading || isQuotesLoading}
            onEdit={handleEditAsset}
            onDelete={(asset) => setAssetPendingDelete(asset)}
            onUpdateQuotes={handleUpdateQuotes}
            onRefetchQuotes={handleRefetchQuotes}
            isUpdatingQuotes={updateQuotesMutation.isPending || syncMpfMutation.isPending}
            isRefetchingQuotes={refetchQuotesMutation.isPending || syncMpfMutation.isPending}
          />
        ) : (
          <AssetsTable
            assets={parsedAssets}
            latestQuotes={latestQuotes}
            isLoading={isLoading || isQuotesLoading}
            onEdit={handleEditAsset}
            onDelete={(asset) => setAssetPendingDelete(asset)}
            onUpdateQuotes={handleUpdateQuotes}
            onRefetchQuotes={handleRefetchQuotes}
            isUpdatingQuotes={updateQuotesMutation.isPending || syncMpfMutation.isPending}
            isRefetchingQuotes={refetchQuotesMutation.isPending || syncMpfMutation.isPending}
          />
        )}
      </div>

      <AssetEditSheet
        asset={editingAsset}
        latestQuote={editingAsset ? (latestQuotes[editingAsset.id]?.quote ?? null) : null}
        open={!!editingAsset}
        onOpenChange={(open) => {
          if (!open) {
            setEditingAsset(null);
          }
        }}
      />

      <MpfAssetEditorSheet
        open={isCreatingMpfAsset || Boolean(editingMpfAssetId)}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreatingMpfAsset(false);
            setEditingMpfAssetId(null);
          }
        }}
        mode={editingMpfAssetId ? "edit" : "create"}
        holding={editingMpfHolding}
        onSubmit={handleMpfSubmit}
        isSubmitting={isSavingMpfAsset}
      />

      <AlertDialog
        open={!!assetPendingDelete}
        onOpenChange={(open) => {
          if (!open) {
            setAssetPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset</AlertDialogTitle>
            <AlertDialogDescription>
              {assetPendingDelete
                ? `Are you sure you want to delete ${assetPendingDelete.displayCode ?? assetPendingDelete.name ?? "this asset"}? This will also remove its related quote and cannot be undone.`
                : "Are you sure you want to delete this asset? This will also remove related quotes and cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteAssetMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 dark:text-foreground"
            >
              {deleteAssetMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RefreshQuotesConfirmDialog
        open={!!assetPendingRefetch}
        onOpenChange={(open) => {
          if (!open) setAssetPendingRefetch(null);
        }}
        onConfirm={() => {
          if (assetPendingRefetch) {
            if (getPanoramaAssetCategory(assetPendingRefetch) === "MPF") {
              syncMpfMutation.mutate();
            } else {
              refetchQuotesMutation.mutate([assetPendingRefetch.id]);
            }
          }
          setAssetPendingRefetch(null);
        }}
        assetName={assetPendingRefetch?.displayCode ?? assetPendingRefetch?.name ?? undefined}
      />
    </div>
  );
}
