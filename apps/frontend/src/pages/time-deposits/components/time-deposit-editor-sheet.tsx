import { useEffect, useMemo, useState } from "react";

import { CurrencyInput, DatePickerInput } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";

import { asFiniteNumber, parsePanoramaAssetAttributes } from "@/lib/panorama-asset-attributes";
import { useSettingsContext } from "@/lib/settings-provider";
import { type AlternativeAssetHolding } from "@/lib/types";
import {
  getEffectiveTimeDepositCurrentValue,
  getTimeDepositDerivedMetrics,
} from "@/lib/time-deposit-calculations";

type TimeDepositInputMode = "rate" | "maturity";
type TimeDepositValuationMode = "derived" | "manual";

export interface TimeDepositFormValues {
  name: string;
  currency: string;
  owner: string;
  provider: string;
  principal: string;
  startDate: Date;
  maturityDate: Date;
  valuationDate: Date;
  inputMode: TimeDepositInputMode;
  quotedAnnualRate: string;
  guaranteedMaturityValue: string;
  valuationMode: TimeDepositValuationMode;
  currentValueOverride: string;
  notes: string;
}

interface TimeDepositEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  holding?: AlternativeAssetHolding | null;
  onSubmit: (values: TimeDepositFormValues) => Promise<void>;
  isSubmitting?: boolean;
  today?: Date;
}

function toDate(value?: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getTodayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function toEditableNumber(value?: number | string): string {
  const parsed = asFiniteNumber(value);
  return parsed !== undefined ? String(parsed) : "";
}

function formatPreviewNumber(value?: number): string {
  return value !== undefined && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function formatPercent(value?: number): string {
  return value !== undefined && Number.isFinite(value) ? `${value.toFixed(2)}%` : "—";
}

function buildDefaultValues(
  holding: AlternativeAssetHolding | null | undefined,
  baseCurrency: string,
  today: Date,
): TimeDepositFormValues {
  const attributes = parsePanoramaAssetAttributes(holding?.metadata);
  const startDate = toDate(attributes.start_date ?? holding?.purchaseDate) ?? new Date();
  const quotedAnnualRate = toEditableNumber(attributes.quoted_annual_rate);
  const guaranteedMaturityValue = toEditableNumber(attributes.guaranteed_maturity_value);
  const valuationMode: TimeDepositValuationMode =
    attributes.valuation_mode === "manual" ? "manual" : "derived";

  return {
    name: holding?.name ?? "",
    currency: holding?.currency ?? baseCurrency,
    owner: typeof attributes.owner === "string" ? attributes.owner : "",
    provider: typeof attributes.provider === "string" ? attributes.provider : "",
    principal: toEditableNumber(attributes.principal ?? holding?.purchasePrice),
    startDate,
    maturityDate: toDate(attributes.maturity_date) ?? addDays(startDate, 90),
    valuationDate: today,
    inputMode: quotedAnnualRate || !guaranteedMaturityValue ? "rate" : "maturity",
    quotedAnnualRate,
    guaranteedMaturityValue,
    valuationMode,
    currentValueOverride:
      valuationMode === "manual"
        ? toEditableNumber(attributes.current_value_override ?? holding?.marketValue)
        : toEditableNumber(attributes.current_value_override),
    notes: holding?.notes ?? "",
  };
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

export function TimeDepositEditorSheet({
  open,
  onOpenChange,
  mode,
  holding,
  onSubmit,
  isSubmitting = false,
  today,
}: TimeDepositEditorSheetProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "HKD";
  const defaults = useMemo(
    () => buildDefaultValues(holding, baseCurrency, today ?? getTodayDate()),
    [holding, baseCurrency, open, today?.getTime()],
  );
  const [values, setValues] = useState<TimeDepositFormValues>(defaults);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(defaults);
      setError(null);
    }
  }, [defaults, open]);

  const updateValue = <T extends keyof TimeDepositFormValues>(
    field: T,
    value: TimeDepositFormValues[T],
  ) => {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const derivedMetrics = useMemo(() => {
    const principal = parsePositiveNumber(values.principal);
    if (!principal || values.maturityDate <= values.startDate) {
      return null;
    }

    if (values.inputMode === "rate") {
      const quotedAnnualRate = parsePositiveNumber(values.quotedAnnualRate);
      if (!quotedAnnualRate) {
        return null;
      }

      return getTimeDepositDerivedMetrics({
        principal,
        startDate: values.startDate,
        maturityDate: values.maturityDate,
        asOfDate: values.valuationDate,
        quotedAnnualRatePct: quotedAnnualRate,
      });
    }

    const guaranteedMaturityValue = parsePositiveNumber(values.guaranteedMaturityValue);
    if (!guaranteedMaturityValue) {
      return null;
    }

    return getTimeDepositDerivedMetrics({
      principal,
      startDate: values.startDate,
      maturityDate: values.maturityDate,
      asOfDate: values.valuationDate,
      guaranteedMaturityValue,
    });
  }, [values]);

  const effectiveCurrentValue = useMemo(() => {
    const principal = parsePositiveNumber(values.principal);
    if (!principal || values.maturityDate <= values.startDate) {
      return undefined;
    }

    const quotedAnnualRate = parsePositiveNumber(values.quotedAnnualRate);
    const guaranteedMaturityValue = parsePositiveNumber(values.guaranteedMaturityValue);
    const currentValueOverride = parsePositiveNumber(values.currentValueOverride);

    if (values.inputMode === "rate" && !quotedAnnualRate) {
      return undefined;
    }

    if (values.inputMode === "maturity" && !guaranteedMaturityValue) {
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
  }, [values]);

  const handleSubmit = async () => {
    const trimmedName = values.name.trim();
    const trimmedCurrency = values.currency.trim().toUpperCase();
    const principal = parsePositiveNumber(values.principal);

    if (!trimmedName) {
      setError("Deposit name is required.");
      return;
    }

    if (!trimmedCurrency) {
      setError("Currency is required.");
      return;
    }

    if (!principal) {
      setError("Principal is required.");
      return;
    }

    if (values.maturityDate <= values.startDate) {
      setError("Maturity date must be after start date.");
      return;
    }

    if (values.inputMode === "rate" && !parsePositiveNumber(values.quotedAnnualRate)) {
      setError("Quoted annual rate is required.");
      return;
    }

    if (values.inputMode === "maturity" && !parsePositiveNumber(values.guaranteedMaturityValue)) {
      setError("Guaranteed maturity value is required.");
      return;
    }

    if (values.valuationMode === "manual" && !parsePositiveNumber(values.currentValueOverride)) {
      setError("Manual current value is required.");
      return;
    }

    setError(null);
    await onSubmit({
      ...values,
      name: trimmedName,
      currency: trimmedCurrency,
      owner: values.owner.trim(),
      provider: values.provider.trim(),
      principal: values.principal.trim(),
      quotedAnnualRate: values.quotedAnnualRate.trim(),
      guaranteedMaturityValue: values.guaranteedMaturityValue.trim(),
      currentValueOverride: values.currentValueOverride.trim(),
      notes: values.notes.trim(),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Add Time Deposit" : "Edit Time Deposit"}</SheetTitle>
          <SheetDescription>
            Track principal, maturity, derived current value, and annualized return on top of
            Panorama&apos;s alternative asset model.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="time-deposit-name">Deposit Name</Label>
              <Input
                id="time-deposit-name"
                value={values.name}
                onChange={(event) => updateValue("name", event.target.value)}
                placeholder="HSBC 3M Time Deposit"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time-deposit-currency">Currency</Label>
              <CurrencyInput
                id="time-deposit-currency"
                aria-label="Currency"
                value={values.currency}
                onChange={(value) => updateValue("currency", value)}
                placeholder="Select currency"
                valueDisplay="code"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time-deposit-principal">Principal</Label>
              <Input
                id="time-deposit-principal"
                value={values.principal}
                onChange={(event) => updateValue("principal", event.target.value)}
                placeholder="10000"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time-deposit-owner">Owner</Label>
              <Input
                id="time-deposit-owner"
                value={values.owner}
                onChange={(event) => updateValue("owner", event.target.value)}
                placeholder="Primary holder"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time-deposit-provider">Provider</Label>
              <Input
                id="time-deposit-provider"
                value={values.provider}
                onChange={(event) => updateValue("provider", event.target.value)}
                placeholder="HSBC"
              />
            </div>

            <div className="space-y-2" data-testid="start-date-field">
              <Label>Start Date</Label>
              <DatePickerInput
                value={values.startDate}
                onChange={(date) => updateValue("startDate", date ?? values.startDate)}
              />
            </div>

            <div className="space-y-2" data-testid="maturity-date-field">
              <Label>Maturity Date</Label>
              <DatePickerInput
                value={values.maturityDate}
                onChange={(date) => updateValue("maturityDate", date ?? values.maturityDate)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Entry Mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={values.inputMode === "rate" ? "default" : "outline"}
                  onClick={() => updateValue("inputMode", "rate")}
                >
                  Rate-Based
                </Button>
                <Button
                  type="button"
                  variant={values.inputMode === "maturity" ? "default" : "outline"}
                  onClick={() => updateValue("inputMode", "maturity")}
                >
                  Known Maturity Value
                </Button>
              </div>
            </div>

            {values.inputMode === "rate" ? (
              <div className="space-y-2">
                <Label htmlFor="time-deposit-rate">Quoted Annual Rate (%)</Label>
                <Input
                  id="time-deposit-rate"
                  value={values.quotedAnnualRate}
                  onChange={(event) => updateValue("quotedAnnualRate", event.target.value)}
                  placeholder="3.2"
                  inputMode="decimal"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="time-deposit-maturity-value">Guaranteed Maturity Value</Label>
                <Input
                  id="time-deposit-maturity-value"
                  value={values.guaranteedMaturityValue}
                  onChange={(event) => updateValue("guaranteedMaturityValue", event.target.value)}
                  placeholder="10200"
                  inputMode="decimal"
                />
              </div>
            )}

            <div className="space-y-3 rounded-lg border p-4 md:col-span-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="time-deposit-manual-mode"
                  checked={values.valuationMode === "manual"}
                  onCheckedChange={(checked) =>
                    updateValue("valuationMode", checked ? "manual" : "derived")
                  }
                />
                <Label htmlFor="time-deposit-manual-mode">Use manual current value</Label>
              </div>

              {values.valuationMode === "manual" && (
                <div className="space-y-2">
                  <Label htmlFor="time-deposit-current-value">Manual Current Value</Label>
                  <Input
                    id="time-deposit-current-value"
                    value={values.currentValueOverride}
                    onChange={(event) => updateValue("currentValueOverride", event.target.value)}
                    placeholder="10123.45"
                    inputMode="decimal"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4 md:col-span-2">
              <div className="text-sm font-medium">Preview</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground text-sm">Current Value</span>
                  <span data-testid="preview-current-value" className="font-medium">
                    {formatPreviewNumber(effectiveCurrentValue)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground text-sm">Maturity Value</span>
                  <span data-testid="preview-maturity-value" className="font-medium">
                    {formatPreviewNumber(derivedMetrics?.expectedMaturityValue)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground text-sm">Annualized Return</span>
                  <span data-testid="preview-annualized-return" className="font-medium">
                    {formatPercent(derivedMetrics?.annualizedReturnPct)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground text-sm">Days Left</span>
                  <span className="font-medium">{derivedMetrics?.daysLeft ?? "—"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="time-deposit-notes">Notes</Label>
              <Textarea
                id="time-deposit-notes"
                value={values.notes}
                onChange={(event) => updateValue("notes", event.target.value)}
                placeholder="Optional deposit notes"
                rows={4}
              />
            </div>
          </div>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : mode === "create" ? "Create Time Deposit" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
