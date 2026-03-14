import { useEffect, useMemo, useState } from "react";

import { CurrencyInput, DatePickerInput } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
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

import { useSettingsContext } from "@/lib/settings-provider";
import type { AlternativeAssetHolding } from "@/lib/types";
import { asFiniteNumber, parsePanoramaAssetAttributes } from "@/lib/panorama-asset-attributes";

export interface InsurancePolicyFormValues {
  name: string;
  currency: string;
  currentValue: string;
  owner: string;
  provider: string;
  policyType: string;
  startDate?: Date;
  totalPaidToDate: string;
  paymentStatus: "paying" | "paid_up";
  nextDueDate?: Date;
  notes: string;
}

interface InsurancePolicyEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  holding?: AlternativeAssetHolding | null;
  onSubmit: (values: InsurancePolicyFormValues) => Promise<void>;
  isSubmitting?: boolean;
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

function toEditableNumber(value?: number | string): string {
  const parsed = asFiniteNumber(value);
  return parsed !== undefined ? String(parsed) : "";
}

function buildDefaultValues(
  holding: AlternativeAssetHolding | null | undefined,
  baseCurrency: string,
): InsurancePolicyFormValues {
  const attributes = parsePanoramaAssetAttributes(holding?.metadata);

  return {
    name: holding?.name ?? "",
    currency: holding?.currency ?? baseCurrency,
    currentValue: holding?.marketValue ?? "",
    owner: typeof attributes.owner === "string" ? attributes.owner : "",
    provider:
      typeof attributes.insurance_provider === "string" ? attributes.insurance_provider : "",
    policyType: typeof attributes.policy_type === "string" ? attributes.policy_type : "",
    startDate: toDate(attributes.start_date),
    totalPaidToDate: toEditableNumber(attributes.total_paid_to_date),
    paymentStatus: attributes.payment_status === "paid_up" ? "paid_up" : "paying",
    nextDueDate: toDate(attributes.next_due_date),
    notes: holding?.notes ?? "",
  };
}

export function InsurancePolicyEditorSheet({
  open,
  onOpenChange,
  mode,
  holding,
  onSubmit,
  isSubmitting = false,
}: InsurancePolicyEditorSheetProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "HKD";
  const defaults = useMemo(() => buildDefaultValues(holding, baseCurrency), [holding, baseCurrency]);
  const [values, setValues] = useState<InsurancePolicyFormValues>(defaults);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(defaults);
      setError(null);
    }
  }, [defaults, open]);

  const updateValue = <T extends keyof InsurancePolicyFormValues>(
    field: T,
    value: InsurancePolicyFormValues[T],
  ) => {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async () => {
    const trimmedName = values.name.trim();
    const trimmedCurrency = values.currency.trim().toUpperCase();
    const trimmedCurrentValue = values.currentValue.trim();

    if (!trimmedName) {
      setError("Policy name is required.");
      return;
    }

    if (!trimmedCurrency) {
      setError("Currency is required.");
      return;
    }

    if (!trimmedCurrentValue) {
      setError("Cash value is required.");
      return;
    }

    setError(null);
    await onSubmit({
      ...values,
      name: trimmedName,
      currency: trimmedCurrency,
      currentValue: trimmedCurrentValue,
      owner: values.owner.trim(),
      provider: values.provider.trim(),
      policyType: values.policyType.trim(),
      startDate: values.startDate,
      totalPaidToDate: values.totalPaidToDate.trim(),
      paymentStatus: values.paymentStatus,
      nextDueDate: values.paymentStatus === "paying" ? values.nextDueDate : undefined,
      notes: values.notes.trim(),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Add Insurance Policy" : "Edit Insurance Policy"}</SheetTitle>
          <SheetDescription>
            Track current cash value, total premiums paid, and simple payment reminders on top of
            Panorama&apos;s alternative asset model.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="insurance-name">Policy Name</Label>
              <Input
                id="insurance-name"
                value={values.name}
                onChange={(event) => updateValue("name", event.target.value)}
                placeholder="AIA Wealth Series"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="insurance-currency">Currency</Label>
              <CurrencyInput
                id="insurance-currency"
                aria-label="Currency"
                value={values.currency}
                onChange={(value) => updateValue("currency", value)}
                placeholder="Select currency"
                valueDisplay="code"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="insurance-current-value">Cash Value</Label>
              <Input
                id="insurance-current-value"
                value={values.currentValue}
                onChange={(event) => updateValue("currentValue", event.target.value)}
                placeholder="125000"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <DatePickerInput
                value={values.startDate}
                onChange={(date) => updateValue("startDate", date ?? undefined)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="insurance-owner">Owner</Label>
              <Input
                id="insurance-owner"
                value={values.owner}
                onChange={(event) => updateValue("owner", event.target.value)}
                placeholder="Primary holder"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="insurance-provider">Provider</Label>
              <Input
                id="insurance-provider"
                value={values.provider}
                onChange={(event) => updateValue("provider", event.target.value)}
                placeholder="AIA, Manulife, AXA..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="insurance-policy-type">Policy Type</Label>
              <Input
                id="insurance-policy-type"
                value={values.policyType}
                onChange={(event) => updateValue("policyType", event.target.value)}
                placeholder="Whole life, universal life..."
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Status</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={values.paymentStatus === "paying" ? "default" : "outline"}
                  onClick={() => updateValue("paymentStatus", "paying")}
                >
                  Paying
                </Button>
                <Button
                  type="button"
                  variant={values.paymentStatus === "paid_up" ? "default" : "outline"}
                  onClick={() => updateValue("paymentStatus", "paid_up")}
                >
                  Paid-up
                </Button>
              </div>
            </div>

            {values.paymentStatus === "paying" ? (
              <div className="space-y-2">
                <Label>Next Due Date</Label>
                <DatePickerInput
                  value={values.nextDueDate}
                  onChange={(date) => updateValue("nextDueDate", date ?? undefined)}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="insurance-total-paid">Total Premiums Paid</Label>
              <Input
                id="insurance-total-paid"
                value={values.totalPaidToDate}
                onChange={(event) => updateValue("totalPaidToDate", event.target.value)}
                placeholder="100000"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="insurance-notes">Notes</Label>
              <Textarea
                id="insurance-notes"
                value={values.notes}
                onChange={(event) => updateValue("notes", event.target.value)}
                placeholder="Optional policy notes"
                rows={4}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </div>

        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : mode === "create" ? "Create Policy" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
