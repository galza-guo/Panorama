import { useEffect, useMemo } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
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
  normalizeMpfSubfunds,
  parsePanoramaAssetAttributes,
  type PanoramaAssetAttributes,
  type PanoramaMpfSubfund,
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

const mpfSubfundSchema = z.object({
  name: z.string().optional().default(""),
  units: z.string().optional().default(""),
});

const mpfAssetFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  currency: z.string().min(1, "Currency is required").default("HKD"),
  name: z.string().optional(),
  owner: z.string().optional(),
  trustee: z.string().optional(),
  scheme: z.string().optional(),
  valuationDate: z.date().optional(),
  subfunds: z.array(mpfSubfundSchema).default([]),
});

type MpfAssetFormValues = z.infer<typeof mpfAssetFormSchema>;

interface MpfAssetEditorSheetProps {
  mode: "create" | "edit";
  asset: Asset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function createEmptySubfund(): MpfAssetFormValues["subfunds"][number] {
  return {
    name: "",
    units: "",
  };
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

function buildDefaults(asset: Asset | null): MpfAssetFormValues {
  if (!asset) {
    return {
      symbol: "",
      currency: "HKD",
      name: "",
      owner: "",
      trustee: "",
      scheme: "",
      valuationDate: undefined,
      subfunds: [createEmptySubfund()],
    };
  }

  const attributes = parsePanoramaAssetAttributes(asset.attributes);
  const subfunds = normalizeMpfSubfunds(attributes.mpf_subfunds).map((subfund) => ({
    name: subfund.name,
    units: subfund.units?.toString() ?? "",
  }));

  return {
    symbol: asset.symbol,
    currency: asset.currency ?? "HKD",
    name: asset.name ?? "",
    owner: attributes.owner ?? "",
    trustee: attributes.trustee ?? "",
    scheme: typeof attributes.mpf_scheme === "string" ? attributes.mpf_scheme : "",
    valuationDate: toDate(
      typeof attributes.valuation_date === "string" ? attributes.valuation_date : undefined,
    ),
    subfunds: subfunds.length > 0 ? subfunds : [createEmptySubfund()],
  };
}

function getSubfundKey(subfund: Pick<PanoramaMpfSubfund, "name" | "code">): string {
  return `name:${subfund.name.trim().toLowerCase()}`;
}

function cleanSubfunds(values: MpfAssetFormValues["subfunds"]): PanoramaMpfSubfund[] {
  return values
    .map((subfund) => {
      const nameText = subfund.name?.trim() ?? "";
      if (!nameText) {
        return null;
      }
      const units = parseOptionalNumber(subfund.units);

      return {
        name: nameText,
        ...(units !== undefined ? { units } : {}),
      } satisfies PanoramaMpfSubfund;
    })
    .filter((entry): entry is PanoramaMpfSubfund => Boolean(entry));
}

export function MpfAssetEditorSheet({ mode, asset, open, onOpenChange }: MpfAssetEditorSheetProps) {
  const queryClient = useQueryClient();
  const defaultValues = useMemo(() => buildDefaults(asset), [asset]);
  const isCreateMode = mode === "create";

  const form = useForm<MpfAssetFormValues>({
    resolver: zodResolver(mpfAssetFormSchema) as Resolver<MpfAssetFormValues>,
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "subfunds",
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
        title: "MPF asset updated",
        description: "Valuation and subfund metadata were saved.",
        variant: "success",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to update MPF asset",
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
        title: "MPF asset created",
        description: "MPF asset and metadata were created.",
        variant: "success",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to create MPF asset",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (values: MpfAssetFormValues) => {
    const existingAttributes = isCreateMode ? {} : parsePanoramaAssetAttributes(asset?.attributes);
    const existingSubfunds = normalizeMpfSubfunds(existingAttributes.mpf_subfunds);
    const existingSubfundMap = new Map(
      existingSubfunds.map((subfund) => [getSubfundKey(subfund), subfund] as const),
    );
    const cleanedSubfunds = cleanSubfunds(values.subfunds);
    const mergedSubfunds = cleanedSubfunds.map((subfund) => {
      const existingSubfund = existingSubfundMap.get(getSubfundKey(subfund));
      return {
        ...subfund,
        ...(existingSubfund?.nav !== undefined ? { nav: existingSubfund.nav } : {}),
        ...(existingSubfund?.market_value !== undefined
          ? { market_value: existingSubfund.market_value }
          : {}),
        ...(existingSubfund?.allocation_pct !== undefined
          ? { allocation_pct: existingSubfund.allocation_pct }
          : {}),
      } satisfies PanoramaMpfSubfund;
    });

    const nextAttributes: PanoramaAssetAttributes = {
      ...existingAttributes,
    };

    const owner = values.owner?.trim();
    const trustee = values.trustee?.trim();
    const scheme = values.scheme?.trim();
    const valuationDate = toIsoDate(values.valuationDate);

    if (owner) {
      nextAttributes.owner = owner;
    } else {
      delete nextAttributes.owner;
    }

    if (trustee) {
      nextAttributes.trustee = trustee;
    } else {
      delete nextAttributes.trustee;
    }

    if (scheme) {
      nextAttributes.mpf_scheme = scheme;
    } else {
      delete nextAttributes.mpf_scheme;
    }

    if (valuationDate) {
      nextAttributes.valuation_date = valuationDate;
    } else {
      delete nextAttributes.valuation_date;
    }

    if (mergedSubfunds.length > 0) {
      nextAttributes.mpf_subfunds = mergedSubfunds;
    } else {
      delete nextAttributes.mpf_subfunds;
    }

    delete nextAttributes.fund_allocation;

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
        assetClass: "MPF",
        assetSubClass: "MPF Fund",
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
      assetClass: asset.assetClass ?? "MPF",
      assetSubClass: asset.assetSubClass ?? "MPF Fund",
      attributes: JSON.stringify(nextAttributes),
    });
  };

  const submitPending = updateMutation.isPending || createMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="space-y-6 overflow-y-auto sm:max-w-[760px]">
        <SheetHeader>
          <SheetTitle>{isCreateMode ? "Add MPF Asset" : "Edit MPF Asset"}</SheetTitle>
          <SheetDescription>
            {isCreateMode
              ? "Create an MPF asset and store valuation/subfund breakdown."
              : "Manage MPF valuation and subfund breakdown on this asset."}
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
                        placeholder="e.g. HSBC-MPF.FUND"
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
                      <Input {...field} placeholder="Display name" />
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
                      <Input {...field} placeholder="e.g. Myself" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="trustee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trustee</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. HSBC Trustee" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheme</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Employer MPF Scheme" />
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
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Subfunds</h3>
                  <p className="text-muted-foreground text-xs">
                    Maintain subfund names and units. NAV/value come from market data sources.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(createEmptySubfund())}
                >
                  <Icons.Plus className="mr-1 h-3 w-3" />
                  Add Subfund
                </Button>
              </div>

              <div className="space-y-2">
                {fields.map((row, index) => (
                  <div
                    key={row.id}
                    className="border-border rounded-md border p-3"
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name={`subfunds.${index}.name`}
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Subfund name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`subfunds.${index}.units`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Units</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={field.value ?? ""}
                                onChange={(event) => field.onChange(event.target.value)}
                                placeholder="0"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        disabled={fields.length <= 1}
                      >
                        <Icons.Trash className="mr-1 h-3 w-3" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                    {isCreateMode ? "Create MPF Asset" : "Save MPF Details"}
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
