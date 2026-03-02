import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AmountDisplay, Page } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { useAlternativeHoldings } from "@/hooks/use-alternative-assets";
import {
  asFiniteNumber,
  buildMpfMetadata,
  buildMpfMetadataPatch,
  getAssetOwner,
  isMpfAsset,
  normalizeMpfSubfunds,
  parsePanoramaAssetAttributes,
  type PanoramaMpfSubfund,
} from "@/lib/panorama-asset-attributes";
import { useAlternativeAssetMutations } from "@/pages/asset/alternative-assets/hooks";

import { MpfAssetEditorSheet, type MpfAssetFormValues } from "./components/mpf-asset-editor-sheet";

type EditorState = { mode: "create" } | { mode: "edit"; assetId: string } | null;

interface MpfSubfundRow {
  name: string;
  units?: number;
  totalValue?: number;
}

interface MpfRow {
  id: string;
  name: string;
  owner: string;
  trustee: string;
  currency: string;
  totalValue?: number;
  valuationDate?: string;
  subfunds: MpfSubfundRow[];
  subfundCount: number;
}

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

function formatUnits(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(value);
}

function mergeSubfunds(
  existingRaw: unknown,
  nextRows: MpfAssetFormValues["subfunds"],
): PanoramaMpfSubfund[] {
  const existingByName = new Map(
    normalizeMpfSubfunds(existingRaw).map((subfund) => [subfund.name.trim().toLowerCase(), subfund] as const),
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
        ...(existing?.allocation_pct !== undefined ? { allocation_pct: existing.allocation_pct } : {}),
      } satisfies PanoramaMpfSubfund;
    })
    .filter((entry): entry is PanoramaMpfSubfund => Boolean(entry));
}

export default function MpfDashboard() {
  const navigate = useNavigate();
  const { data: holdings = [], isLoading } = useAlternativeHoldings();
  const [editorState, setEditorState] = useState<EditorState>(null);
  const { createMutation, updateMetadataMutation, updateValuationMutation } =
    useAlternativeAssetMutations();

  const mpfHoldings = useMemo(() => {
    return holdings.filter(isMpfAsset).sort((a, b) => a.name.localeCompare(b.name));
  }, [holdings]);

  const rows = useMemo<MpfRow[]>(() => {
    return mpfHoldings.map((holding) => {
      const attributes = parsePanoramaAssetAttributes(holding.metadata);
      const subfunds = normalizeMpfSubfunds(attributes.mpf_subfunds).map((subfund) => {
        const totalValue =
          typeof subfund.market_value === "number"
            ? subfund.market_value
            : typeof subfund.units === "number" && typeof subfund.nav === "number"
              ? subfund.units * subfund.nav
              : undefined;

        return {
          name: subfund.name,
          units: subfund.units,
          totalValue,
        };
      });

      const derivedSubfundTotal = subfunds.reduce((sum, subfund) => sum + (subfund.totalValue ?? 0), 0);
      const totalValue = asFiniteNumber(holding.marketValue) ?? (derivedSubfundTotal > 0 ? derivedSubfundTotal : undefined);
      const trustee = typeof attributes.trustee === "string" ? attributes.trustee.trim() : "";

      return {
        id: holding.id,
        name: holding.name,
        owner: getAssetOwner(holding) ?? "Unassigned",
        trustee: trustee || "Unspecified",
        currency: holding.currency,
        totalValue,
        valuationDate: typeof attributes.valuation_date === "string" ? attributes.valuation_date : undefined,
        subfunds,
        subfundCount: subfunds.length,
      };
    });
  }, [mpfHoldings]);

  const editingHolding = useMemo(() => {
    if (editorState?.mode !== "edit") {
      return null;
    }

    return mpfHoldings.find((holding) => holding.id === editorState.assetId) ?? null;
  }, [editorState, mpfHoldings]);

  const trusteeCount = useMemo(() => new Set(rows.map((row) => row.trustee)).size, [rows]);

  const totalValueByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.totalValue === undefined) {
        continue;
      }
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.totalValue);
    }
    return Array.from(totals.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [rows]);

  const isSaving =
    createMutation.isPending ||
    updateMetadataMutation.isPending ||
    updateValuationMutation.isPending;

  const handleSubmit = async (values: MpfAssetFormValues) => {
    const valuationDate = toIsoDate(values.valuationDate);

    if (editorState?.mode === "edit" && editingHolding) {
      const existingAttributes = parsePanoramaAssetAttributes(editingHolding.metadata);
      const mergedSubfunds = mergeSubfunds(existingAttributes.mpf_subfunds, values.subfunds);

      await updateMetadataMutation.mutateAsync({
        assetId: editingHolding.id,
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

      const existingQuoteDate = editingHolding.valuationDate.slice(0, 10);
      const valuationChanged =
        editingHolding.marketValue !== values.currentValue || existingQuoteDate !== valuationDate;

      if (valuationChanged) {
        await updateValuationMutation.mutateAsync({
          assetId: editingHolding.id,
          request: {
            value: values.currentValue,
            date: valuationDate,
          },
        });
      }
    } else {
      const subfunds = mergeSubfunds([], values.subfunds);
      const response = await createMutation.mutateAsync({
        kind: "other",
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
    }

    setEditorState(null);
  };

  return (
    <Page className="flex flex-col px-4 pt-22 pb-10 md:px-6 md:pt-10 lg:px-8 lg:pt-12">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">MPF</h1>
          <p className="text-muted-foreground text-sm">
            Monitor MPF accounts, trustee metadata, and subfund unit breakdowns with Panorama metadata.
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
              <Button type="button" size="sm" variant="outline" onClick={() => setEditorState({ mode: "create" })}>
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
                  Add your first MPF asset and enter trustee, valuation, and subfund details.
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
                    key={row.id}
                    className="border-border hover:bg-muted/40 rounded-md border px-3 py-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{row.name}</div>
                        <div className="text-muted-foreground text-xs">{row.trustee}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/holdings/${encodeURIComponent(row.id)}`)}
                        >
                          Open
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditorState({ mode: "edit", assetId: row.id })}
                        >
                          <Icons.Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                      </div>
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
                              key={`${row.id}-${subfund.name}-${index}`}
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

      {editorState ? (
        <MpfAssetEditorSheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditorState(null);
            }
          }}
          mode={editorState.mode}
          holding={editingHolding}
          onSubmit={handleSubmit}
          isSubmitting={isSaving}
        />
      ) : null}
    </Page>
  );
}
