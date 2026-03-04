import { useEffect, useMemo, useState } from "react";

import { DatePickerInput } from "@wealthfolio/ui";
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
import { Icons } from "@wealthfolio/ui/components/ui/icons";

import { useSettingsContext } from "@/lib/settings-provider";
import type { AlternativeAssetHolding } from "@/lib/types";
import { normalizeMpfSubfunds, parsePanoramaAssetAttributes } from "@/lib/panorama-asset-attributes";

export interface MpfSubfundFormValue {
  name: string;
  units: string;
}

export interface MpfAssetFormValues {
  name: string;
  currency: string;
  currentValue: string;
  valuationDate: Date;
  owner: string;
  trustee: string;
  scheme: string;
  notes: string;
  subfunds: MpfSubfundFormValue[];
}

interface MpfAssetEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  holding?: AlternativeAssetHolding | null;
  onSubmit: (values: MpfAssetFormValues) => Promise<void>;
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

function emptySubfund(): MpfSubfundFormValue {
  return {
    name: "",
    units: "",
  };
}

function buildDefaultValues(
  holding: AlternativeAssetHolding | null | undefined,
  baseCurrency: string,
): MpfAssetFormValues {
  const attributes = parsePanoramaAssetAttributes(holding?.metadata);
  const subfunds = normalizeMpfSubfunds(attributes.mpf_subfunds).map((subfund) => ({
    name: subfund.name,
    units: subfund.units !== undefined ? String(subfund.units) : "",
  }));

  return {
    name: holding?.name ?? "",
    currency: holding?.currency ?? baseCurrency,
    currentValue: holding?.marketValue ?? "",
    valuationDate: toDate(holding?.valuationDate) ?? new Date(),
    owner: typeof attributes.owner === "string" ? attributes.owner : "",
    trustee: typeof attributes.trustee === "string" ? attributes.trustee : "",
    scheme: typeof attributes.mpf_scheme === "string" ? attributes.mpf_scheme : "",
    notes: holding?.notes ?? "",
    subfunds: subfunds.length > 0 ? subfunds : [emptySubfund()],
  };
}

export function MpfAssetEditorSheet({
  open,
  onOpenChange,
  mode,
  holding,
  onSubmit,
  isSubmitting = false,
}: MpfAssetEditorSheetProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "HKD";
  const defaults = useMemo(() => buildDefaultValues(holding, baseCurrency), [holding, baseCurrency]);
  const [values, setValues] = useState<MpfAssetFormValues>(defaults);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(defaults);
      setError(null);
    }
  }, [defaults, open]);

  const updateValue = <T extends keyof MpfAssetFormValues>(field: T, value: MpfAssetFormValues[T]) => {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateSubfund = (index: number, field: keyof MpfSubfundFormValue, value: string) => {
    setValues((current) => ({
      ...current,
      subfunds: current.subfunds.map((subfund, currentIndex) =>
        currentIndex === index ? { ...subfund, [field]: value } : subfund,
      ),
    }));
  };

  const addSubfund = () => {
    setValues((current) => ({
      ...current,
      subfunds: [...current.subfunds, emptySubfund()],
    }));
  };

  const removeSubfund = (index: number) => {
    setValues((current) => {
      const nextSubfunds = current.subfunds.filter((_, currentIndex) => currentIndex !== index);

      return {
        ...current,
        subfunds: nextSubfunds.length > 0 ? nextSubfunds : [emptySubfund()],
      };
    });
  };

  const handleSubmit = async () => {
    const trimmedName = values.name.trim();
    const trimmedCurrency = values.currency.trim().toUpperCase();
    const trimmedCurrentValue = values.currentValue.trim();

    if (!trimmedName) {
      setError("MPF asset name is required.");
      return;
    }

    if (!trimmedCurrency) {
      setError("Currency is required.");
      return;
    }

    if (!trimmedCurrentValue) {
      setError("Current value is required.");
      return;
    }

    setError(null);
    await onSubmit({
      ...values,
      name: trimmedName,
      currency: trimmedCurrency,
      currentValue: trimmedCurrentValue,
      owner: values.owner.trim(),
      trustee: values.trustee.trim(),
      scheme: values.scheme.trim(),
      notes: values.notes.trim(),
      subfunds: values.subfunds.map((subfund) => ({
        name: subfund.name.trim(),
        units: subfund.units.trim(),
      })),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Add MPF Asset" : "Edit MPF Asset"}</SheetTitle>
          <SheetDescription>
            Track trustee, scheme, total value, and subfund units on top of Panorama&apos;s
            alternative asset model.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="mpf-name">MPF Asset Name</Label>
              <Input
                id="mpf-name"
                value={values.name}
                onChange={(event) => updateValue("name", event.target.value)}
                placeholder="Employer MPF"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpf-currency">Currency</Label>
              <Input
                id="mpf-currency"
                value={values.currency}
                onChange={(event) => updateValue("currency", event.target.value)}
                placeholder="HKD"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpf-current-value">Current Value</Label>
              <Input
                id="mpf-current-value"
                value={values.currentValue}
                onChange={(event) => updateValue("currentValue", event.target.value)}
                placeholder="250000"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-2">
              <Label>Valuation Date</Label>
              <DatePickerInput
                value={values.valuationDate}
                onChange={(date) => updateValue("valuationDate", date ?? new Date())}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpf-owner">Owner</Label>
              <Input
                id="mpf-owner"
                value={values.owner}
                onChange={(event) => updateValue("owner", event.target.value)}
                placeholder="Primary holder"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpf-trustee">Trustee</Label>
              <Input
                id="mpf-trustee"
                value={values.trustee}
                onChange={(event) => updateValue("trustee", event.target.value)}
                placeholder="HSBC Trustee"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpf-scheme">Scheme</Label>
              <Input
                id="mpf-scheme"
                value={values.scheme}
                onChange={(event) => updateValue("scheme", event.target.value)}
                placeholder="Employer Scheme"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="mpf-notes">Notes</Label>
              <Textarea
                id="mpf-notes"
                value={values.notes}
                onChange={(event) => updateValue("notes", event.target.value)}
                placeholder="Optional MPF notes"
                rows={4}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Subfunds</h3>
                <p className="text-muted-foreground text-xs">
                  Maintain subfund names and units. Existing NAV and market values are preserved when available.
                </p>
              </div>

              <Button type="button" size="sm" variant="outline" onClick={addSubfund}>
                <Icons.Plus className="mr-2 h-3 w-3" />
                Add Subfund
              </Button>
            </div>

            <div className="space-y-3">
              {values.subfunds.map((subfund, index) => (
                <div key={`subfund-${index}`} className="border-border rounded-md border p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                    <div className="space-y-2">
                      <Label htmlFor={`mpf-subfund-name-${index}`}>Subfund Name</Label>
                      <Input
                        id={`mpf-subfund-name-${index}`}
                        value={subfund.name}
                        onChange={(event) => updateSubfund(index, "name", event.target.value)}
                        placeholder="Core Accumulation Fund"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`mpf-subfund-units-${index}`}>Units</Label>
                      <Input
                        id={`mpf-subfund-units-${index}`}
                        value={subfund.units}
                        onChange={(event) => updateSubfund(index, "units", event.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeSubfund(index)}
                        disabled={values.subfunds.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </div>

        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : mode === "create" ? "Create MPF Asset" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
