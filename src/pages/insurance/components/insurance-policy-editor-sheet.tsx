import { useEffect, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { createAssetProfile, updateAssetProfile } from "@/commands/market-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import type { Asset, CreateAssetPayload, UpdateAssetProfile } from "@/lib/types";
import {
  parsePanoramaAssetAttributes,
  type PanoramaAssetAttributes,
} from "@/lib/panorama-asset-attributes";
import {
  DatePickerInput,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui";

const insurancePolicyFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  currency: z.string().min(1, "Currency is required").default("HKD"),
  name: z.string().optional(),
  owner: z.string().optional(),
  provider: z.string().optional(),
  valuationDate: z.date().optional(),
  totalPaidToDate: z.string().optional().default(""),
  withdrawableValue: z.string().optional().default(""),
});

type InsurancePolicyFormValues = z.infer<typeof insurancePolicyFormSchema>;

interface InsurancePolicyEditorSheetProps {
  mode: "create" | "edit";
  asset: Asset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date;
}

function toIsoDate(value?: Date): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.toISOString().slice(0, 10);
}

function parseOptionalNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function buildDefaults(asset: Asset | null): InsurancePolicyFormValues {
  if (!asset) {
    return {
      symbol: "",
      currency: "HKD",
      name: "",
      owner: "",
      provider: "",
      valuationDate: undefined,
      totalPaidToDate: "",
      withdrawableValue: "",
    };
  }

  const attributes = parsePanoramaAssetAttributes(asset.attributes);
  const providerFromAttributes =
    typeof attributes.insurance_provider === "string"
      ? attributes.insurance_provider
      : undefined;
  return {
    symbol: asset.symbol,
    currency: asset.currency ?? "HKD",
    name: asset.name ?? "",
    owner: attributes.owner ?? "",
    provider: providerFromAttributes ?? attributes.trustee ?? "",
    valuationDate: toDate(
      typeof attributes.valuation_date === "string" ? attributes.valuation_date : undefined,
    ),
    totalPaidToDate:
      typeof attributes.total_paid_to_date === "number"
        ? attributes.total_paid_to_date.toString()
        : "",
    withdrawableValue:
      typeof attributes.withdrawable_value === "number"
        ? attributes.withdrawable_value.toString()
        : "",
  };
}

export function InsurancePolicyEditorSheet({
  mode,
  asset,
  open,
  onOpenChange,
}: InsurancePolicyEditorSheetProps) {
  const queryClient = useQueryClient();
  const defaultValues = useMemo(() => buildDefaults(asset), [asset]);
  const isCreateMode = mode === "create";

  const form = useForm<InsurancePolicyFormValues>({
    resolver: zodResolver(insurancePolicyFormSchema) as Resolver<InsurancePolicyFormValues>,
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateAssetProfile) => updateAssetProfile(payload),
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, payload.symbol] });
      toast({
        title: "Policy updated",
        description: "Insurance valuation metadata was saved.",
        variant: "success",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to update policy",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAssetPayload) => createAssetProfile(payload),
    onSuccess: async (createdAsset) => {
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
      await queryClient.invalidateQueries({
        queryKey: [QueryKeys.ASSET_DATA, createdAsset.symbol],
      });
      toast({
        title: "Policy created",
        description: "Insurance policy metadata was saved.",
        variant: "success",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to create policy",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (values: InsurancePolicyFormValues) => {
    const existingAttributes = isCreateMode ? {} : parsePanoramaAssetAttributes(asset?.attributes);
    const nextAttributes: PanoramaAssetAttributes = {
      ...existingAttributes,
    };

    const owner = values.owner?.trim();
    const provider = values.provider?.trim();
    const valuationDate = toIsoDate(values.valuationDate);
    const totalPaidToDate = parseOptionalNumber(values.totalPaidToDate);
    const withdrawableValue = parseOptionalNumber(values.withdrawableValue);

    if (owner) {
      nextAttributes.owner = owner;
    } else {
      delete nextAttributes.owner;
    }

    if (provider) {
      nextAttributes.insurance_provider = provider;
    } else {
      delete nextAttributes.insurance_provider;
    }

    if (valuationDate) {
      nextAttributes.valuation_date = valuationDate;
    } else {
      delete nextAttributes.valuation_date;
    }

    if (totalPaidToDate !== undefined) {
      nextAttributes.total_paid_to_date = totalPaidToDate;
    } else {
      delete nextAttributes.total_paid_to_date;
    }

    if (withdrawableValue !== undefined) {
      nextAttributes.withdrawable_value = withdrawableValue;
    } else {
      delete nextAttributes.withdrawable_value;
    }

    const normalizedName = values.name?.trim();
    const normalizedSymbol = values.symbol.trim();
    const normalizedCurrency = values.currency.trim().toUpperCase();

    if (!normalizedSymbol) {
      form.setError("symbol", {
        type: "manual",
        message: "Symbol is required",
      });
      return;
    }

    if (!normalizedCurrency) {
      form.setError("currency", {
        type: "manual",
        message: "Currency is required",
      });
      return;
    }

    if (isCreateMode) {
      await createMutation.mutateAsync({
        symbol: normalizedSymbol,
        name: normalizedName && normalizedName.length > 0 ? normalizedName : normalizedSymbol,
        currency: normalizedCurrency,
        dataSource: "MANUAL",
        notes: "",
        assetClass: "Insurance",
        assetSubClass: "Policy",
        attributes: JSON.stringify(nextAttributes),
      });
      return;
    }

    if (!asset) {
      return;
    }

    await updateMutation.mutateAsync({
      symbol: asset.symbol,
      name: normalizedName && normalizedName.length > 0 ? normalizedName : (asset.name ?? asset.symbol),
      sectors: asset.sectors ?? "",
      countries: asset.countries ?? "",
      notes: asset.notes ?? "",
      assetClass: asset.assetClass ?? "Insurance",
      assetSubClass: asset.assetSubClass ?? "Policy",
      attributes: JSON.stringify(nextAttributes),
    });
  };

  const submitPending = updateMutation.isPending || createMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="space-y-6 overflow-y-auto sm:max-w-[720px]">
        <SheetHeader>
          <SheetTitle>{isCreateMode ? "Add Insurance Policy" : "Edit Insurance Policy"}</SheetTitle>
          <SheetDescription>
            {isCreateMode
              ? "Create an insurance policy asset with key cash-flow metadata."
              : "Store policy-specific invested and withdrawable values."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={!isCreateMode}
                        className={!isCreateMode ? "bg-muted/50" : undefined}
                        placeholder="e.g. POLICY-001.FUND"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                        maxLength={8}
                        disabled={!isCreateMode}
                        className={!isCreateMode ? "bg-muted/50" : undefined}
                        placeholder="HKD"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Policy display name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="owner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Policy owner" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Insurer / trustee" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="valuationDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valuation Date</FormLabel>
                    <FormControl>
                      <DatePickerInput value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="totalPaidToDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Paid To Date</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value)}
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="withdrawableValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Withdrawable Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value)}
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitPending}>
                {submitPending ? (
                  <>
                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  <>
                    <Icons.Check className="mr-2 h-4 w-4" />
                    {isCreateMode ? "Create Policy" : "Save Policy"}
                  </>
                )}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
