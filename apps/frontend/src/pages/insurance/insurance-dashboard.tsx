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
  buildInsuranceMetadata,
  buildInsuranceMetadataPatch,
  getAssetOwner,
  isInsuranceAsset,
  parsePanoramaAssetAttributes,
} from "@/lib/panorama-asset-attributes";
import { useAlternativeAssetMutations } from "@/pages/asset/alternative-assets/hooks";

import {
  InsurancePolicyEditorSheet,
  type InsurancePolicyFormValues,
} from "./components/insurance-policy-editor-sheet";

type EditorState = { mode: "create" } | { mode: "edit"; assetId: string } | null;

interface InsuranceRow {
  id: string;
  name: string;
  owner: string;
  provider: string;
  currency: string;
  currentValue?: number;
  totalPaidToDate?: number;
  withdrawableValue?: number;
  valuationDate?: string;
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

export default function InsuranceDashboard() {
  const navigate = useNavigate();
  const { data: holdings = [], isLoading } = useAlternativeHoldings();
  const [editorState, setEditorState] = useState<EditorState>(null);
  const { createMutation, updateMetadataMutation, updateValuationMutation } =
    useAlternativeAssetMutations();

  const insuranceHoldings = useMemo(() => {
    return holdings.filter(isInsuranceAsset).sort((a, b) => a.name.localeCompare(b.name));
  }, [holdings]);

  const rows = useMemo<InsuranceRow[]>(() => {
    return insuranceHoldings.map((holding) => {
      const attributes = parsePanoramaAssetAttributes(holding.metadata);
      const provider =
        typeof attributes.insurance_provider === "string"
          ? attributes.insurance_provider.trim()
          : "";

      return {
        id: holding.id,
        name: holding.name,
        owner: getAssetOwner(holding) ?? "Unassigned",
        provider: provider || "Unspecified",
        currency: holding.currency,
        currentValue: asFiniteNumber(holding.marketValue),
        totalPaidToDate: asFiniteNumber(attributes.total_paid_to_date),
        withdrawableValue: asFiniteNumber(attributes.withdrawable_value),
        valuationDate:
          typeof attributes.valuation_date === "string" ? attributes.valuation_date : undefined,
      };
    });
  }, [insuranceHoldings]);

  const editingHolding = useMemo(() => {
    if (editorState?.mode !== "edit") {
      return null;
    }

    return insuranceHoldings.find((holding) => holding.id === editorState.assetId) ?? null;
  }, [editorState, insuranceHoldings]);

  const totalPaidByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.totalPaidToDate === undefined) {
        continue;
      }
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.totalPaidToDate);
    }
    return Array.from(totals.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [rows]);

  const withdrawableByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.withdrawableValue === undefined) {
        continue;
      }
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.withdrawableValue);
    }
    return Array.from(totals.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [rows]);

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

  const ownerCount = useMemo(() => new Set(rows.map((row) => row.owner)).size, [rows]);

  const isSaving =
    createMutation.isPending ||
    updateMetadataMutation.isPending ||
    updateValuationMutation.isPending;

  const handleSubmit = async (values: InsurancePolicyFormValues) => {
    const valuationDate = toIsoDate(values.valuationDate);
    const totalPaidToDate = parseOptionalNumber(values.totalPaidToDate);
    const withdrawableValue = parseOptionalNumber(values.withdrawableValue);

    if (editorState?.mode === "edit" && editingHolding) {
      await updateMetadataMutation.mutateAsync({
        assetId: editingHolding.id,
        name: values.name,
        notes: values.notes,
        metadata: buildInsuranceMetadataPatch({
          owner: values.owner,
          policy_type: values.policyType,
          insurance_provider: values.provider,
          valuation_date: valuationDate,
          total_paid_to_date: totalPaidToDate,
          withdrawable_value: withdrawableValue,
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
      const response = await createMutation.mutateAsync({
        kind: "other",
        name: values.name,
        currency: values.currency,
        currentValue: values.currentValue,
        valueDate: valuationDate,
        metadata: buildInsuranceMetadata({
          owner: values.owner,
          policy_type: values.policyType,
          insurance_provider: values.provider,
          valuation_date: valuationDate,
          total_paid_to_date: totalPaidToDate,
          withdrawable_value: withdrawableValue,
        }),
      });

      if (values.notes) {
        await updateMetadataMutation.mutateAsync({
          assetId: response.assetId,
          name: values.name,
          notes: values.notes,
          metadata: buildInsuranceMetadataPatch({
            owner: values.owner,
            policy_type: values.policyType,
            insurance_provider: values.provider,
            valuation_date: valuationDate,
            total_paid_to_date: totalPaidToDate,
            withdrawable_value: withdrawableValue,
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
          <h1 className="text-2xl font-semibold tracking-tight">Insurance</h1>
          <p className="text-muted-foreground text-sm">
            Track policy value, paid-in capital, and withdrawable balances with Panorama metadata.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Policies</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{rows.length}</CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Owners</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{ownerCount}</CardContent>
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
              <Button type="button" size="sm" variant="outline" onClick={() => setEditorState({ mode: "create" })}>
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
            ) : rows.length === 0 ? (
              <div className="border-border/50 bg-success/10 rounded-lg border p-6 text-center">
                <p className="text-sm">No insurance assets found.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add your first policy to track contributions and withdrawable value.
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
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="border-border hover:bg-muted/40 rounded-md border px-3 py-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{row.name}</div>
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

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
                      <div>{row.owner}</div>
                      <div>
                        {row.currentValue === undefined ? (
                          <span className="text-muted-foreground">Current: -</span>
                        ) : (
                          <AmountDisplay value={row.currentValue} currency={row.currency} />
                        )}
                      </div>
                      <div>
                        {row.totalPaidToDate === undefined ? (
                          <span className="text-muted-foreground">Paid: -</span>
                        ) : (
                          <AmountDisplay value={row.totalPaidToDate} currency={row.currency} />
                        )}
                      </div>
                      <div>
                        {row.withdrawableValue === undefined ? (
                          <span className="text-muted-foreground">Withdrawable: -</span>
                        ) : (
                          <AmountDisplay value={row.withdrawableValue} currency={row.currency} />
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {row.valuationDate ? `Valuation ${row.valuationDate}` : "Valuation date not set"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {totalPaidByCurrency.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Total Paid To Date</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {totalPaidByCurrency.map(([currency, value]) => (
                <div key={currency} className="text-sm font-medium">
                  <AmountDisplay value={value} currency={currency} />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {editorState ? (
        <InsurancePolicyEditorSheet
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
