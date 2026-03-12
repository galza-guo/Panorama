import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AmountDisplay, Badge, Page } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { useAlternativeHoldings } from "@/hooks/use-alternative-assets";
import {
  asFiniteNumber,
  buildTimeDepositMetadata,
  buildTimeDepositMetadataPatch,
  getAssetOwner,
  isTimeDepositAsset,
  parsePanoramaAssetAttributes,
} from "@/lib/panorama-asset-attributes";
import {
  deriveTimeDepositMaturityValue,
  getEffectiveTimeDepositCurrentValue,
  getTimeDepositDerivedMetrics,
} from "@/lib/time-deposit-calculations";
import type { AlternativeAssetHolding } from "@/lib/types";
import { useAlternativeAssetMutations } from "@/pages/asset/alternative-assets/hooks";

import {
  TimeDepositEditorSheet,
  type TimeDepositFormValues,
} from "./components/time-deposit-editor-sheet";

type EditorState = { mode: "create" } | { mode: "edit"; assetId: string } | null;

interface TimeDepositRow {
  id: string;
  name: string;
  owner: string;
  provider: string;
  currency: string;
  principal?: number;
  currentValue?: number;
  isEstimatedCurrentValue: boolean;
  maturityValue?: number;
  daysLeft?: number;
  maturityDate?: string;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getTodayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function parsePositiveNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function buildTimeDepositStatus(values: Pick<TimeDepositFormValues, "valuationDate" | "maturityDate">) {
  return values.valuationDate >= values.maturityDate ? "matured" : "active";
}

function buildTimeDepositCreateMetadata(values: TimeDepositFormValues) {
  const principal = parsePositiveNumber(values.principal);

  return {
    ...buildTimeDepositMetadata({
      owner: values.owner,
      provider: values.provider,
      principal,
      start_date: toIsoDate(values.startDate),
      maturity_date: toIsoDate(values.maturityDate),
      quoted_annual_rate:
        values.inputMode === "rate" ? parsePositiveNumber(values.quotedAnnualRate) : undefined,
      guaranteed_maturity_value:
        values.inputMode === "maturity"
          ? parsePositiveNumber(values.guaranteedMaturityValue)
          : undefined,
      valuation_mode: values.valuationMode,
      current_value_override:
        values.valuationMode === "manual"
          ? parsePositiveNumber(values.currentValueOverride)
          : undefined,
      valuation_date: toIsoDate(values.valuationDate),
      status: buildTimeDepositStatus(values),
    }),
    purchase_price: values.principal.trim(),
    purchase_date: toIsoDate(values.startDate),
  };
}

function buildTimeDepositPatchMetadata(values: TimeDepositFormValues) {
  const principal = parsePositiveNumber(values.principal);

  return {
    ...buildTimeDepositMetadataPatch({
      owner: values.owner,
      provider: values.provider,
      principal,
      start_date: toIsoDate(values.startDate),
      maturity_date: toIsoDate(values.maturityDate),
      quoted_annual_rate:
        values.inputMode === "rate" ? parsePositiveNumber(values.quotedAnnualRate) : undefined,
      guaranteed_maturity_value:
        values.inputMode === "maturity"
          ? parsePositiveNumber(values.guaranteedMaturityValue)
          : undefined,
      valuation_mode: values.valuationMode,
      current_value_override:
        values.valuationMode === "manual"
          ? parsePositiveNumber(values.currentValueOverride)
          : undefined,
      valuation_date: toIsoDate(values.valuationDate),
      status: buildTimeDepositStatus(values),
    }),
    purchase_price: values.principal.trim(),
    purchase_date: toIsoDate(values.startDate),
  };
}

function getEffectiveCurrentValue(values: TimeDepositFormValues): number | undefined {
  const principal = parsePositiveNumber(values.principal);
  const quotedAnnualRate = parsePositiveNumber(values.quotedAnnualRate);
  const guaranteedMaturityValue = parsePositiveNumber(values.guaranteedMaturityValue);
  const currentValueOverride = parsePositiveNumber(values.currentValueOverride);

  if (!principal || values.maturityDate <= values.startDate) {
    return undefined;
  }

  if (values.inputMode === "rate" && quotedAnnualRate === undefined) {
    return undefined;
  }

  if (values.inputMode === "maturity" && guaranteedMaturityValue === undefined) {
    return undefined;
  }

  return getEffectiveTimeDepositCurrentValue({
    principal,
    startDate: values.startDate,
    maturityDate: values.maturityDate,
    asOfDate: values.valuationDate,
    quotedAnnualRatePct: quotedAnnualRate,
    guaranteedMaturityValue,
    valuationMode: values.valuationMode,
    currentValueOverride,
  });
}

function getStoredValuationForHolding(holding: AlternativeAssetHolding): { date: string; value?: number } {
  const attributes = parsePanoramaAssetAttributes(holding.metadata);
  const principal = asFiniteNumber(attributes.principal ?? holding.purchasePrice);
  const quotedAnnualRate = asFiniteNumber(attributes.quoted_annual_rate);
  const guaranteedMaturityValue = asFiniteNumber(attributes.guaranteed_maturity_value);
  const currentValueOverride = asFiniteNumber(attributes.current_value_override);
  const startDate =
    typeof attributes.start_date === "string" ? attributes.start_date : holding.purchaseDate;
  const maturityDate =
    typeof attributes.maturity_date === "string" ? attributes.maturity_date : undefined;
  const valuationDate =
    typeof attributes.valuation_date === "string" && attributes.valuation_date.trim()
      ? attributes.valuation_date.trim()
      : holding.valuationDate.slice(0, 10);

  if (!principal || !startDate || !maturityDate) {
    return { date: valuationDate, value: asFiniteNumber(holding.marketValue) };
  }

  return {
    date: valuationDate,
    value: getEffectiveTimeDepositCurrentValue({
      principal,
      startDate,
      maturityDate,
      asOfDate: valuationDate,
      quotedAnnualRatePct: quotedAnnualRate,
      guaranteedMaturityValue,
      valuationMode: attributes.valuation_mode === "manual" ? "manual" : "derived",
      currentValueOverride,
    }),
  };
}

function formatValueForMutation(value: number | undefined): string | undefined {
  return value !== undefined && Number.isFinite(value) ? String(Number(value.toFixed(2))) : undefined;
}

export default function TimeDepositsDashboard({ today }: { today?: Date } = {}) {
  const navigate = useNavigate();
  const { data: holdings = [], isLoading } = useAlternativeHoldings();
  const [editorState, setEditorState] = useState<EditorState>(null);
  const { createMutation, updateMetadataMutation, updateValuationMutation } =
    useAlternativeAssetMutations();

  const timeDepositHoldings = useMemo(() => {
    return holdings.filter(isTimeDepositAsset).sort((a, b) => a.name.localeCompare(b.name));
  }, [holdings]);

  const rows = useMemo<TimeDepositRow[]>(() => {
    const asOfDate = toIsoDate(today ?? getTodayDate());

    return timeDepositHoldings.map((holding) => {
      const attributes = parsePanoramaAssetAttributes(holding.metadata);
      const principal = asFiniteNumber(attributes.principal ?? holding.purchasePrice);
      const quotedAnnualRate = asFiniteNumber(attributes.quoted_annual_rate);
      const currentValueOverride = asFiniteNumber(attributes.current_value_override);
      const valuationMode = attributes.valuation_mode === "manual" ? "manual" : "derived";
      const startDate =
        typeof attributes.start_date === "string" ? attributes.start_date : undefined;
      const maturityDate =
        typeof attributes.maturity_date === "string" ? attributes.maturity_date : undefined;
      const guaranteedMaturityValue =
        asFiniteNumber(attributes.guaranteed_maturity_value) ??
        (principal !== undefined &&
        startDate !== undefined &&
        maturityDate !== undefined &&
        quotedAnnualRate !== undefined
          ? deriveTimeDepositMaturityValue({
              principal,
              startDate,
              maturityDate,
              quotedAnnualRatePct: quotedAnnualRate,
            })
          : undefined);
      const canDeriveCurrentValue =
        principal !== undefined &&
        startDate !== undefined &&
        maturityDate !== undefined &&
        (quotedAnnualRate !== undefined || guaranteedMaturityValue !== undefined);
      const currentValue =
        canDeriveCurrentValue
          ? getEffectiveTimeDepositCurrentValue({
              principal,
              startDate,
              maturityDate,
              asOfDate,
              quotedAnnualRatePct: quotedAnnualRate,
              guaranteedMaturityValue,
              valuationMode,
              currentValueOverride,
            })
          : asFiniteNumber(holding.marketValue);
      const derivedMetrics =
        principal !== undefined &&
        startDate !== undefined &&
        maturityDate !== undefined &&
        (quotedAnnualRate !== undefined || guaranteedMaturityValue !== undefined)
          ? getTimeDepositDerivedMetrics({
              principal,
              startDate,
              maturityDate,
              asOfDate,
              quotedAnnualRatePct: quotedAnnualRate,
              guaranteedMaturityValue,
            })
          : undefined;

      return {
        id: holding.id,
        name: holding.name,
        owner: getAssetOwner(holding) ?? "Unassigned",
        provider:
          typeof attributes.provider === "string" && attributes.provider.trim()
            ? attributes.provider.trim()
            : "Unspecified",
        currency: holding.currency,
        principal,
        currentValue,
        isEstimatedCurrentValue: canDeriveCurrentValue && valuationMode === "derived",
        maturityValue: guaranteedMaturityValue,
        daysLeft: derivedMetrics?.daysLeft,
        maturityDate,
      };
    });
  }, [timeDepositHoldings, today]);

  const editingHolding = useMemo(() => {
    if (editorState?.mode !== "edit") {
      return null;
    }

    return timeDepositHoldings.find((holding) => holding.id === editorState.assetId) ?? null;
  }, [editorState, timeDepositHoldings]);

  const currentValueByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.currentValue === undefined) {
        continue;
      }
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.currentValue);
    }
    return Array.from(totals.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [rows]);

  const maturityValueByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.maturityValue === undefined) {
        continue;
      }
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.maturityValue);
    }
    return Array.from(totals.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [rows]);

  const nextDaysLeft = useMemo(() => {
    const values = rows
      .map((row) => row.daysLeft)
      .filter((value): value is number => value !== undefined && value >= 0);

    return values.length > 0 ? Math.min(...values) : undefined;
  }, [rows]);

  const isSaving =
    createMutation.isPending ||
    updateMetadataMutation.isPending ||
    updateValuationMutation.isPending;

  const handleSubmit = async (values: TimeDepositFormValues) => {
    const currentValue = formatValueForMutation(getEffectiveCurrentValue(values));
    const valuationDate = toIsoDate(values.valuationDate);
    const createMetadata = buildTimeDepositCreateMetadata(values);
    const patchMetadata = buildTimeDepositPatchMetadata(values);

    if (!currentValue) {
      return;
    }

    if (editorState?.mode === "edit" && editingHolding) {
      await updateMetadataMutation.mutateAsync({
        assetId: editingHolding.id,
        name: values.name,
        notes: values.notes || null,
        metadata: patchMetadata,
      });

      const existingValuation = getStoredValuationForHolding(editingHolding);
      if (
        existingValuation.date !== valuationDate ||
        formatValueForMutation(existingValuation.value) !== currentValue
      ) {
        await updateValuationMutation.mutateAsync({
          assetId: editingHolding.id,
          request: {
            value: currentValue,
            date: valuationDate,
          },
        });
      }
    } else {
      const response = await createMutation.mutateAsync({
        kind: "other",
        name: values.name,
        currency: values.currency,
        currentValue,
        valueDate: valuationDate,
        metadata: createMetadata,
      });

      if (values.notes) {
        await updateMetadataMutation.mutateAsync({
          assetId: response.assetId,
          name: values.name,
          notes: values.notes,
          metadata: patchMetadata,
        });
      }
    }

    setEditorState(null);
  };

  return (
    <Page className="flex flex-col px-4 pt-22 pb-10 md:px-6 md:pt-10 lg:px-8 lg:pt-12">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Time Deposits</h1>
          <p className="text-muted-foreground text-sm">
            Track guaranteed term deposits with derived current value, maturity proceeds, and days
            left.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Deposits</CardTitle>
            </CardHeader>
            <CardContent data-testid="summary-count" className="text-2xl font-semibold">
              {rows.length}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Current Value</CardTitle>
            </CardHeader>
            <CardContent>
              {currentValueByCurrency.length === 0 ? (
                <span className="text-muted-foreground text-sm">No values recorded</span>
              ) : (
                <div className="space-y-1">
                  {currentValueByCurrency.map(([currency, value]) => (
                    <div
                      key={currency}
                      data-testid={`summary-current-${currency}`}
                      data-value={value.toFixed(2)}
                      className="text-sm font-medium"
                    >
                      <AmountDisplay value={value} currency={currency} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Maturity Value</CardTitle>
            </CardHeader>
            <CardContent>
              {maturityValueByCurrency.length === 0 ? (
                <span className="text-muted-foreground text-sm">No values recorded</span>
              ) : (
                <div className="space-y-1">
                  {maturityValueByCurrency.map(([currency, value]) => (
                    <div
                      key={currency}
                      data-testid={`summary-maturity-${currency}`}
                      data-value={value.toFixed(2)}
                      className="text-sm font-medium"
                    >
                      <AmountDisplay value={value} currency={currency} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Days Left</CardTitle>
            </CardHeader>
            <CardContent
              data-testid="summary-next-days-left"
              data-value={nextDaysLeft ?? ""}
              className="text-2xl font-semibold"
            >
              {nextDaysLeft ?? "—"}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Deposit List</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditorState({ mode: "create" })}>
                <Icons.Plus className="mr-2 h-3 w-3" />
                Add Time Deposit
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
                <p className="text-sm">No time deposits found.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add your first term deposit to track guaranteed maturity value and days left.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => setEditorState({ mode: "create" })}
                >
                  <Icons.Plus className="mr-2 h-3 w-3" />
                  Add Time Deposit
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
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold">{row.name}</div>
                          {row.daysLeft !== undefined ? (
                            <Badge variant="outline" className="text-[10px]">
                              {row.daysLeft}d left
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground text-xs">{row.provider}</div>
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

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
                      <div>{row.owner}</div>
                      <div>
                        {row.principal === undefined ? (
                          <span className="text-muted-foreground">Principal: -</span>
                        ) : (
                          <AmountDisplay value={row.principal} currency={row.currency} />
                        )}
                      </div>
                      <div>
                        {row.currentValue === undefined ? (
                          <span className="text-muted-foreground">Current: -</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <AmountDisplay value={row.currentValue} currency={row.currency} />
                            {row.isEstimatedCurrentValue ? (
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                Est.
                              </Badge>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div>
                        {row.maturityValue === undefined ? (
                          <span className="text-muted-foreground">Maturity: -</span>
                        ) : (
                          <AmountDisplay value={row.maturityValue} currency={row.currency} />
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {row.daysLeft === undefined ? "Days left: -" : `${row.daysLeft} days left`}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {row.maturityDate ? `Matures ${row.maturityDate}` : "Maturity date not set"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editorState ? (
        <TimeDepositEditorSheet
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
