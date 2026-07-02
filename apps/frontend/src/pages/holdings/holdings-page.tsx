import { Button } from "@panorama/ui/components/ui/button";
import { Icons } from "@panorama/ui/components/ui/icons";
import { EmptyPlaceholder } from "@panorama/ui";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { SwipablePage, SwipablePageView } from "@/components/page";
import { AccountSelector } from "@/components/account-selector";
import { ActionPalette, type ActionPaletteGroup } from "@/components/action-palette";
import { useAccounts } from "@/hooks/use-accounts";
import { useHoldings } from "@/hooks/use-holdings";
import {
  useAlternativeHoldings,
  useDeleteAlternativeAsset,
  useLinkLiability,
  useUnlinkLiability,
} from "@/hooks/use-alternative-assets";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  asFiniteNumber,
  buildInsuranceMetadataPatch,
  buildMpfMetadataPatch,
  buildTimeDepositMetadataPatch,
  isInsuranceAsset,
  isMpfAsset,
  isTimeDepositAsset,
  normalizeMpfSubfunds,
  parsePanoramaAssetAttributes,
  type PanoramaMpfSubfund,
} from "@/lib/panorama-asset-attributes";
import { getEffectiveTimeDepositCurrentValue } from "@/lib/time-deposit-calculations";
import {
  PORTFOLIO_ACCOUNT_ID,
  HOLDING_CATEGORY_FILTERS,
  apiKindToAlternativeAssetKind,
} from "@/lib/constants";
import {
  Account,
  HoldingType,
  AlternativeAssetHolding,
  AlternativeAssetKind,
  JsonObject,
} from "@/lib/types";
import { canAddHoldings } from "@/lib/activity-restrictions";
import { getDisplaySymbol } from "@/lib/symbol-display";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { HoldingsMobileFilterSheet } from "./components/holdings-mobile-filter-sheet";
import { HoldingsTable } from "./components/holdings-table";
import { HoldingsTableMobile } from "./components/holdings-table-mobile";
import { AlternativeHoldingsTable } from "./components/alternative-holdings-table";
import { AlternativeHoldingsListMobile } from "./components/alternative-holdings-list-mobile";
import { HoldingsEditMode } from "./components/holdings-edit-mode";
import {
  AlternativeAssetQuickAddModal,
  AssetDetailsSheet,
  UpdateValuationModal,
  type AssetDetailsSheetAsset,
  type LinkableAsset,
  type LinkedLiability,
} from "@/pages/asset/alternative-assets";
import {
  reEnrichAssetProfiles,
  updateAlternativeAssetMetadata,
  updateAlternativeAssetValuation,
} from "@/adapters";
import { ClassificationSheet } from "@/components/classification/classification-sheet";
import { useUpdatePortfolioMutation } from "@/hooks/use-calculate-portfolio";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { useSettingsContext } from "@/lib/settings-provider";
import { toast } from "@panorama/ui/components/ui/use-toast";
import {
  MpfAssetEditorSheet,
  type MpfAssetFormValues,
} from "@/pages/mpf/components/mpf-asset-editor-sheet";
import {
  TimeDepositEditorSheet,
  type TimeDepositFormValues,
} from "@/pages/time-deposits/components/time-deposit-editor-sheet";
import {
  InsurancePolicyEditorSheet,
  type InsurancePolicyFormValues,
} from "@/pages/insurance/components/insurance-policy-editor-sheet";

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

function buildTimeDepositStatus(
  values: Pick<TimeDepositFormValues, "valuationDate" | "maturityDate">,
) {
  return values.valuationDate >= values.maturityDate ? "matured" : "active";
}

function buildTimeDepositPatch(values: TimeDepositFormValues) {
  return {
    ...buildTimeDepositMetadataPatch({
      owner: values.owner,
      provider: values.provider,
      linked_account_id: values.linkedAccountId,
      principal: parsePositiveNumber(values.principal),
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

function getTimeDepositCurrentValue(values: TimeDepositFormValues): number | undefined {
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

function formatValueForMutation(value: number | undefined): string | undefined {
  return value !== undefined && Number.isFinite(value)
    ? String(Number(value.toFixed(2)))
    : undefined;
}

function getStoredTimeDepositValuation(holding: AlternativeAssetHolding): {
  date: string;
  value?: number;
} {
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

function getStoredInsuranceValuationDate(holding: AlternativeAssetHolding): string {
  const attributes = parsePanoramaAssetAttributes(holding.metadata);
  return typeof attributes.valuation_date === "string" && attributes.valuation_date.trim()
    ? attributes.valuation_date.trim()
    : holding.valuationDate.slice(0, 10);
}

function mergeMpfSubfunds(
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

export const HoldingsPage = () => {
  const isMobileViewport = useIsMobileViewport();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "investments";
  const queryClient = useQueryClient();
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const [selectedAccount, setSelectedAccount] = useState<Account | null>({
    id: PORTFOLIO_ACCOUNT_ID,
    name: "All Portfolio",
    accountType: "PORTFOLIO" as unknown as Account["accountType"],
    balance: 0,
    currency: baseCurrency,
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account);

  const { holdings, isLoading } = useHoldings(selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID);
  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const { data: alternativeHoldings, isLoading: isAlternativeHoldingsLoading } =
    useAlternativeHoldings();

  // Mobile filter state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isAlternativeAssetModalOpen, setIsAlternativeAssetModalOpen] = useState(false);
  const [sortBy, setSortBy] = usePersistentState<"symbol" | "marketValue">(
    "holdings-sort-by",
    "marketValue",
  );
  const [showTotalReturn, setShowTotalReturn] = usePersistentState<boolean>(
    "holdings-show-total-return",
    true,
  );

  // Alternative asset action state
  const [editAsset, setEditAsset] = useState<AssetDetailsSheetAsset | null>(null);
  const [editMpfAsset, setEditMpfAsset] = useState<AlternativeAssetHolding | null>(null);
  const [editTimeDepositAsset, setEditTimeDepositAsset] = useState<AlternativeAssetHolding | null>(
    null,
  );
  const [editInsuranceAsset, setEditInsuranceAsset] = useState<AlternativeAssetHolding | null>(
    null,
  );
  const [updateValueAsset, setUpdateValueAsset] = useState<AlternativeAssetHolding | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Delete mutation
  const { mutate: deleteAsset, isPending: isDeleting } = useDeleteAlternativeAsset();

  // Linking mutations
  const linkLiabilityMutation = useLinkLiability();
  const unlinkLiabilityMutation = useUnlinkLiability();

  // State for chained liability creation (when creating property with mortgage checkbox)
  const [pendingLiabilityLink, setPendingLiabilityLink] = useState<string | null>(null);
  const [pendingLiabilityType, setPendingLiabilityType] = useState<string | undefined>(undefined);
  const [pendingOriginationDate, setPendingOriginationDate] = useState<Date | undefined>(undefined);
  const [pendingMortgageName, setPendingMortgageName] = useState<string | undefined>(undefined);

  // Classification sheet state
  const [classifyAsset, setClassifyAsset] = useState<{
    id: string;
    symbol: string;
    name?: string;
  } | null>(null);

  // Edit mode state for HOLDINGS-mode accounts
  const [isEditMode, setIsEditMode] = useState(false);

  // Action palette state
  const [isActionPaletteOpen, setIsActionPaletteOpen] = useState(false);
  const [modalDefaultKind, setModalDefaultKind] = useState<AlternativeAssetKind | undefined>(
    undefined,
  );
  const updatePortfolioMutation = useUpdatePortfolioMutation();

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
    // Exit edit mode when switching accounts
    setIsEditMode(false);
  };

  // Check if the selected account supports manual holdings editing
  const canEditHoldings = useMemo(() => {
    if (!selectedAccount || selectedAccount.id === PORTFOLIO_ACCOUNT_ID) {
      return false;
    }
    return canAddHoldings(selectedAccount);
  }, [selectedAccount]);

  // Handler to convert AlternativeAssetHolding to AssetDetailsSheetAsset for editing
  const handleEditAsset = useCallback((holding: AlternativeAssetHolding) => {
    setEditAsset(null);
    setEditMpfAsset(null);
    setEditTimeDepositAsset(null);
    setEditInsuranceAsset(null);

    if (isMpfAsset(holding)) {
      setEditMpfAsset(holding);
      return;
    }

    if (isTimeDepositAsset(holding)) {
      setEditTimeDepositAsset(holding);
      return;
    }

    if (isInsuranceAsset(holding)) {
      setEditInsuranceAsset(holding);
      return;
    }

    const assetForSheet: AssetDetailsSheetAsset = {
      id: holding.id,
      name: holding.name,
      kind: apiKindToAlternativeAssetKind(holding.kind),
      currency: holding.currency,
      metadata: holding.metadata,
      notes: holding.notes,
    };
    setEditAsset(assetForSheet);
  }, []);

  const invalidateAlternativeAssetQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.NET_WORTH] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.NET_WORTH_HISTORY] });
  }, [queryClient]);

  // Handler to save asset details
  const handleSaveAssetDetails = useCallback(
    async (assetId: string, metadata: JsonObject, name?: string, notes?: string | null) => {
      setIsSavingDetails(true);
      try {
        await updateAlternativeAssetMetadata(assetId, metadata, name, notes);
        invalidateAlternativeAssetQueries();
      } finally {
        setIsSavingDetails(false);
      }
    },
    [invalidateAlternativeAssetQueries],
  );

  const handleMpfSave = useCallback(
    async (values: MpfAssetFormValues) => {
      if (!editMpfAsset) return;

      setIsSavingDetails(true);
      try {
        const valuationDate = toIsoDate(values.valuationDate);
        const existingAttributes = parsePanoramaAssetAttributes(editMpfAsset.metadata);
        const mergedSubfunds = mergeMpfSubfunds(existingAttributes.mpf_subfunds, values.subfunds);

        await updateAlternativeAssetMetadata(
          editMpfAsset.id,
          buildMpfMetadataPatch({
            owner: values.owner,
            trustee: values.trustee,
            mpf_scheme: values.scheme,
            valuation_date: valuationDate,
            mpf_subfunds: mergedSubfunds,
          }),
          values.name,
          values.notes || null,
          values.currency,
        );

        const existingQuoteDate = editMpfAsset.valuationDate.slice(0, 10);
        const valuationChanged =
          editMpfAsset.marketValue !== values.currentValue || existingQuoteDate !== valuationDate;

        if (valuationChanged) {
          await updateAlternativeAssetValuation(editMpfAsset.id, {
            value: values.currentValue,
            date: valuationDate,
          });
        }

        invalidateAlternativeAssetQueries();
        setEditMpfAsset(null);
      } finally {
        setIsSavingDetails(false);
      }
    },
    [editMpfAsset, invalidateAlternativeAssetQueries],
  );

  const handleTimeDepositSave = useCallback(
    async (values: TimeDepositFormValues) => {
      if (!editTimeDepositAsset) return;

      const currentValue = formatValueForMutation(getTimeDepositCurrentValue(values));
      if (!currentValue) {
        return;
      }

      setIsSavingDetails(true);
      try {
        const valuationDate = toIsoDate(values.valuationDate);

        await updateAlternativeAssetMetadata(
          editTimeDepositAsset.id,
          buildTimeDepositPatch(values),
          values.name,
          values.notes || null,
          values.currency,
        );

        const existingValuation = getStoredTimeDepositValuation(editTimeDepositAsset);
        if (
          existingValuation.date !== valuationDate ||
          formatValueForMutation(existingValuation.value) !== currentValue
        ) {
          await updateAlternativeAssetValuation(editTimeDepositAsset.id, {
            value: currentValue,
            date: valuationDate,
          });
        }

        invalidateAlternativeAssetQueries();
        setEditTimeDepositAsset(null);
      } finally {
        setIsSavingDetails(false);
      }
    },
    [editTimeDepositAsset, invalidateAlternativeAssetQueries],
  );

  const handleInsuranceSave = useCallback(
    async (values: InsurancePolicyFormValues) => {
      if (!editInsuranceAsset) return;

      setIsSavingDetails(true);
      try {
        const valuationDate = toIsoDate(new Date());
        const nextCashValue = asFiniteNumber(values.currentValue);
        const currentCashValue = asFiniteNumber(editInsuranceAsset.marketValue);
        const valuationChanged = currentCashValue !== nextCashValue;

        await updateAlternativeAssetMetadata(
          editInsuranceAsset.id,
          buildInsuranceMetadataPatch({
            owner: values.owner,
            policy_type: values.policyType,
            insurance_provider: values.provider,
            start_date: values.startDate ? toIsoDate(values.startDate) : undefined,
            valuation_date: valuationChanged
              ? valuationDate
              : getStoredInsuranceValuationDate(editInsuranceAsset),
            total_paid_to_date: parseOptionalNumber(values.totalPaidToDate),
            payment_status: values.paymentStatus,
            next_due_date:
              values.paymentStatus === "paying" && values.nextDueDate
                ? toIsoDate(values.nextDueDate)
                : undefined,
          }),
          values.name,
          values.notes || null,
          values.currency,
        );

        if (valuationChanged) {
          await updateAlternativeAssetValuation(editInsuranceAsset.id, {
            value: values.currentValue,
            date: valuationDate,
          });
        }

        invalidateAlternativeAssetQueries();
        setEditInsuranceAsset(null);
      } finally {
        setIsSavingDetails(false);
      }
    },
    [editInsuranceAsset, invalidateAlternativeAssetQueries],
  );

  // Handler to delete an asset
  const handleDeleteAsset = useCallback(
    (holding: AlternativeAssetHolding) => {
      deleteAsset(holding.id);
    },
    [deleteAsset],
  );

  // Handler to view value history for an asset
  const handleViewHistory = useCallback(
    (holding: AlternativeAssetHolding) => {
      navigate(`/holdings/${encodeURIComponent(holding.id)}?tab=history`);
    },
    [navigate],
  );

  // Handler to navigate to asset detail page
  const handleRowClick = useCallback(
    (holding: AlternativeAssetHolding) => {
      navigate(`/holdings/${encodeURIComponent(holding.id)}`);
    },
    [navigate],
  );

  // Get the investments filter config
  const investmentsFilter = useMemo(() => {
    return HOLDING_CATEGORY_FILTERS.find((f) => f.id === "investments");
  }, []);

  // Filter alternative holdings for assets (non-liability)
  const assetsHoldings = useMemo(() => {
    if (!alternativeHoldings) return [];
    return alternativeHoldings.filter((h) => h.kind !== "liability");
  }, [alternativeHoldings]);

  // Filter alternative holdings for liabilities
  const liabilitiesHoldings = useMemo(() => {
    if (!alternativeHoldings) return [];
    return alternativeHoldings.filter((h) => h.kind === "liability");
  }, [alternativeHoldings]);

  // Linkable assets for liability creation/editing (properties and vehicles)
  const linkableAssets: LinkableAsset[] = useMemo(() => {
    return assetsHoldings
      .filter((h) => h.kind === "property" || h.kind === "vehicle")
      .map((h) => ({ id: h.id, name: h.name }));
  }, [assetsHoldings]);

  // Get linked liabilities for a property (mortgages that have linked_asset_id matching the property)
  const getLinkedLiabilities = useCallback(
    (propertyId: string): LinkedLiability[] => {
      return liabilitiesHoldings
        .filter((h) => {
          const metadata = h.metadata as Record<string, unknown> | null | undefined;
          const linkedAssetId = metadata?.linked_asset_id;
          return linkedAssetId === propertyId;
        })
        .map((h) => ({
          id: h.id,
          name: h.name,
          balance: h.marketValue,
        }));
    },
    [liabilitiesHoldings],
  );

  // Get available (unlinked) mortgages for linking to a property
  const getAvailableMortgages = useCallback(
    (excludePropertyId?: string): LinkedLiability[] => {
      return liabilitiesHoldings
        .filter((h) => {
          const metadata = h.metadata as Record<string, unknown> | null | undefined;
          const liabilityType = metadata?.liability_type;
          const linkedAssetId = metadata?.linked_asset_id;
          // Only mortgages that are not linked to any asset (or linked to this property for re-linking)
          return (
            liabilityType === "mortgage" && (!linkedAssetId || linkedAssetId === excludePropertyId)
          );
        })
        .map((h) => ({
          id: h.id,
          name: h.name,
          balance: h.marketValue,
        }));
    },
    [liabilitiesHoldings],
  );

  // Get the name of the asset linked to a liability
  const getLinkedAssetName = useCallback(
    (liabilityMetadata?: Record<string, unknown>): string | undefined => {
      const linkedAssetId = liabilityMetadata?.linked_asset_id as string | undefined;
      if (!linkedAssetId) return undefined;
      const linkedAsset = assetsHoldings.find((h) => h.id === linkedAssetId);
      return linkedAsset?.name;
    },
    [assetsHoldings],
  );

  // Handler for chained liability creation (called when property is created with mortgage checkbox)
  const handleOpenLiabilityQuickAdd = useCallback(
    (propertyId: string, purchaseDate?: Date, propertyName?: string) => {
      setPendingLiabilityLink(propertyId);
      setPendingLiabilityType("mortgage");
      setPendingOriginationDate(purchaseDate);
      setPendingMortgageName(propertyName ? `${propertyName} Mortgage` : undefined);
      setModalDefaultKind(AlternativeAssetKind.LIABILITY);
      setIsAlternativeAssetModalOpen(true);
    },
    [],
  );

  // Handler for linking a mortgage to a property
  const handleLinkMortgage = useCallback(
    async (mortgageId: string) => {
      if (!editAsset) return;
      await linkLiabilityMutation.mutateAsync({
        liabilityId: mortgageId,
        targetAssetId: editAsset.id,
      });
    },
    [editAsset, linkLiabilityMutation],
  );

  // Handler for unlinking a mortgage from a property
  const handleUnlinkMortgage = useCallback(
    async (mortgageId: string) => {
      await unlinkLiabilityMutation.mutateAsync(mortgageId);
    },
    [unlinkLiabilityMutation],
  );

  // Process investment holdings
  const { nonCashHoldings, investmentHoldings, filteredHoldings } = useMemo(() => {
    const nonCash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() !== HoldingType.CASH) ?? [];

    let investments = nonCash;
    if (investmentsFilter?.assetKinds) {
      const allowedKinds = investmentsFilter.assetKinds as readonly string[];
      investments = nonCash.filter((holding) => {
        return holding.assetKind && allowedKinds.includes(holding.assetKind);
      });
    }

    let filtered = investments;
    if (selectedTypes.length > 0) {
      filtered = investments.filter((holding) => {
        const assetType = holding.instrument?.classifications?.assetType?.name;
        return assetType && selectedTypes.includes(assetType);
      });
    }

    return {
      nonCashHoldings: nonCash,
      investmentHoldings: investments,
      filteredHoldings: filtered,
    };
  }, [holdings, selectedTypes, investmentsFilter]);

  const investmentAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          investmentHoldings
            .map((holding) => holding.instrument?.id ?? holding.id)
            .filter((assetId): assetId is string => Boolean(assetId)),
        ),
      ),
    [investmentHoldings],
  );

  // Combined loading state
  const isDataLoading = isLoading || isAccountsLoading || isAlternativeHoldingsLoading;

  // Empty state checks
  const hasNoInvestments =
    !isDataLoading && (!investmentHoldings || investmentHoldings.length === 0);
  const hasNoAssets = !isDataLoading && assetsHoldings.length === 0;
  const hasNoLiabilities = !isDataLoading && liabilitiesHoldings.length === 0;

  const reEnrichProfilesMutation = useMutation({
    mutationFn: async () => reEnrichAssetProfiles(investmentAssetIds),
    onSuccess: (stats) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });

      const parts = [`${stats.enriched} updated`];
      if (stats.skipped > 0) {
        parts.push(`${stats.skipped} skipped`);
      }
      if (stats.failed > 0) {
        parts.push(`${stats.failed} failed`);
      }

      toast({
        title: "Profile enrichment finished.",
        description: parts.join(", "),
        variant: stats.failed > 0 ? "destructive" : "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Profile enrichment failed.",
        description: error instanceof Error ? error.message : "Unable to re-enrich asset profiles.",
        variant: "destructive",
      });
    },
  });

  // Investments content
  const investmentsContent = (
    <>
      {/* Edit Mode for HOLDINGS-mode accounts */}
      {isEditMode && selectedAccount && canEditHoldings ? (
        <HoldingsEditMode
          holdings={holdings ?? []}
          account={selectedAccount}
          isLoading={isDataLoading}
          onClose={() => setIsEditMode(false)}
        />
      ) : hasNoInvestments ? (
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.TrendingUp className="text-muted-foreground h-10 w-10" />}
            title="No holdings yet"
            description={
              canEditHoldings
                ? "Get started by updating your holdings or importing from a CSV file."
                : "Get started by adding your first transaction or quickly import your existing holdings from a CSV file."
            }
          >
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              {canEditHoldings ? (
                <>
                  <Button size="default" onClick={() => setIsEditMode(true)}>
                    <Icons.Pencil className="mr-2 h-4 w-4" />
                    Update Holdings
                  </Button>
                  <Button size="default" variant="outline" onClick={() => navigate("/import")}>
                    <Icons.Import className="mr-2 h-4 w-4" />
                    Import from CSV
                  </Button>
                </>
              ) : (
                <>
                  <Button size="default" onClick={() => navigate("/activities/manage")}>
                    <Icons.Plus className="mr-2 h-4 w-4" />
                    Add Transaction
                  </Button>
                  <Button size="default" variant="outline" onClick={() => navigate("/import")}>
                    <Icons.Import className="mr-2 h-4 w-4" />
                    Import from CSV
                  </Button>
                </>
              )}
            </div>
          </EmptyPlaceholder>
        </div>
      ) : (
        <>
          {/* Desktop View */}
          <div className="hidden md:block">
            <HoldingsTable
              holdings={filteredHoldings ?? []}
              isLoading={isDataLoading}
              showTotalReturn={showTotalReturn}
              setShowTotalReturn={setShowTotalReturn}
              onClassify={(holding) =>
                setClassifyAsset({
                  id: holding.instrument?.id ?? holding.id,
                  symbol: getDisplaySymbol({
                    symbol: holding.instrument?.symbol ?? holding.id,
                    preferredProvider: holding.instrument?.preferredProvider,
                  }),
                  name: holding.instrument?.name ?? undefined,
                })
              }
            />
          </div>

          {/* Mobile View */}
          <div className="block md:hidden">
            <HoldingsTableMobile
              holdings={nonCashHoldings ?? []}
              isLoading={isDataLoading}
              selectedTypes={selectedTypes}
              setSelectedTypes={setSelectedTypes}
              selectedAccount={selectedAccount}
              accounts={accounts ?? []}
              onAccountChange={handleAccountSelect}
              showSearch={true}
              showFilterButton={false}
              sortBy={sortBy}
              showTotalReturn={showTotalReturn}
            />
          </div>
        </>
      )}
    </>
  );

  // Personal Assets content
  const assetsContent = (
    <>
      {hasNoAssets ? (
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.Wallet className="text-muted-foreground h-10 w-10" />}
            title="No assets yet"
            description="Add your first property, vehicle, collectible, or other asset."
          >
            <Button size="default" onClick={() => setIsAlternativeAssetModalOpen(true)}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add Asset
            </Button>
          </EmptyPlaceholder>
        </div>
      ) : (
        <>
          {/* Desktop View */}
          <div className="hidden md:block">
            <AlternativeHoldingsTable
              holdings={assetsHoldings}
              isLoading={isDataLoading}
              emptyTitle="No assets"
              emptyDescription="Add your first asset using the button above."
              onEdit={handleEditAsset}
              onUpdateValue={setUpdateValueAsset}
              onViewHistory={handleViewHistory}
              onDelete={handleDeleteAsset}
              onRowClick={handleRowClick}
              isDeleting={isDeleting}
            />
          </div>
          {/* Mobile View */}
          <div className="block md:hidden">
            <AlternativeHoldingsListMobile
              holdings={assetsHoldings}
              isLoading={isDataLoading}
              onRowClick={handleRowClick}
            />
          </div>
        </>
      )}
    </>
  );

  // Liabilities content
  const liabilitiesContent = (
    <>
      {hasNoLiabilities ? (
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.CreditCard className="text-muted-foreground h-10 w-10" />}
            title="No liabilities yet"
            description="Track your mortgages, loans, and other debts."
          >
            <Button size="default" onClick={() => setIsAlternativeAssetModalOpen(true)}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add Liability
            </Button>
          </EmptyPlaceholder>
        </div>
      ) : (
        <>
          {/* Desktop View */}
          <div className="hidden md:block">
            <AlternativeHoldingsTable
              holdings={liabilitiesHoldings}
              isLoading={isDataLoading}
              emptyTitle="No liabilities"
              emptyDescription="Add your first liability using the button above."
              onEdit={handleEditAsset}
              onUpdateValue={setUpdateValueAsset}
              onViewHistory={handleViewHistory}
              onDelete={handleDeleteAsset}
              onRowClick={handleRowClick}
              isDeleting={isDeleting}
            />
          </div>
          {/* Mobile View */}
          <div className="block md:hidden">
            <AlternativeHoldingsListMobile
              holdings={liabilitiesHoldings}
              isLoading={isDataLoading}
              onRowClick={handleRowClick}
            />
          </div>
        </>
      )}
    </>
  );

  // Action palette groups
  const actionPaletteGroups: ActionPaletteGroup[] = useMemo(
    () => [
      {
        items: [
          {
            icon: Icons.Wallet,
            label: "Add Asset",
            onClick: () => {
              setModalDefaultKind(undefined);
              setIsAlternativeAssetModalOpen(true);
            },
          },
          {
            icon: Icons.CreditCard,
            label: "Add Liability",
            onClick: () => {
              setModalDefaultKind(AlternativeAssetKind.LIABILITY);
              setIsAlternativeAssetModalOpen(true);
            },
          },
          {
            icon: Icons.Plus,
            label: "Add Activity",
            onClick: () => navigate("/activities/manage"),
          },
          ...(currentTab === "investments" && investmentAssetIds.length > 0
            ? [
                {
                  icon: Icons.Sparkles,
                  label: reEnrichProfilesMutation.isPending
                    ? "Re-enriching Profiles..."
                    : "Re-enrich Profiles",
                  onClick: () => {
                    if (!reEnrichProfilesMutation.isPending) {
                      reEnrichProfilesMutation.mutate();
                    }
                  },
                },
              ]
            : []),
          {
            icon: Icons.Refresh,
            label: "Update Prices",
            onClick: () => updatePortfolioMutation.mutate(),
          },
        ],
      },
    ],
    [
      currentTab,
      investmentAssetIds.length,
      navigate,
      reEnrichProfilesMutation,
      updatePortfolioMutation,
    ],
  );

  // Shared actions for header
  const sharedActions = useMemo(
    () => (
      <>
        {isMobileViewport && currentTab === "investments" ? (
          <Button
            size="icon-sm"
            variant="outline"
            className="h-9 w-9 rounded-full"
            onClick={() => setIsFilterSheetOpen(true)}
            aria-label="Open holdings filters"
          >
            <Icons.ListFilter className="h-4 w-4" />
          </Button>
        ) : (
          <AccountSelector
            selectedAccount={selectedAccount}
            setSelectedAccount={handleAccountSelect}
            variant="dropdown"
            includePortfolio={true}
            iconOnly={true}
            icon={Icons.ListFilter}
          />
        )}
        {/* Show Update button for HOLDINGS-mode manual accounts (only on investments tab) */}
        {canEditHoldings && !isEditMode && currentTab === "investments" && (
          <Button size="sm" variant="outline" onClick={() => setIsEditMode(true)}>
            <Icons.Pencil className="mr-2 h-4 w-4" />
            Update
          </Button>
        )}
        <ActionPalette
          open={isActionPaletteOpen}
          onOpenChange={setIsActionPaletteOpen}
          groups={actionPaletteGroups}
        />
      </>
    ),
    [
      isMobileViewport,
      setIsFilterSheetOpen,
      selectedAccount,
      handleAccountSelect,
      canEditHoldings,
      isEditMode,
      currentTab,
      isActionPaletteOpen,
      actionPaletteGroups,
    ],
  );

  // Define the swipeable views
  const views: SwipablePageView[] = useMemo(
    () => [
      {
        value: "investments",
        label: "Investments",
        icon: Icons.TrendingUp,
        content: investmentsContent,
        actions: sharedActions,
      },
      {
        value: "assets",
        label: "Assets",
        icon: Icons.Wallet,
        content: assetsContent,
        actions: sharedActions,
      },
      {
        value: "liabilities",
        label: "Liabilities",
        icon: Icons.CreditCard,
        content: liabilitiesContent,
        actions: sharedActions,
      },
    ],
    [investmentsContent, assetsContent, liabilitiesContent, sharedActions],
  );

  // Determine defaultKind for modal - explicit state takes precedence, then fall back to current tab
  const getDefaultKindForModal = (): AlternativeAssetKind | undefined => {
    if (modalDefaultKind !== undefined) return modalDefaultKind;
    if (currentTab === "liabilities") return AlternativeAssetKind.LIABILITY;
    return undefined;
  };

  return (
    <>
      <SwipablePage views={views} defaultView="investments" />

      {/* Mobile Filter Sheet */}
      <HoldingsMobileFilterSheet
        open={isFilterSheetOpen}
        onOpenChange={setIsFilterSheetOpen}
        selectedAccount={selectedAccount}
        accounts={accounts ?? []}
        onAccountChange={handleAccountSelect}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
        sortBy={sortBy}
        setSortBy={setSortBy}
        showTotalReturn={showTotalReturn}
        setShowTotalReturn={setShowTotalReturn}
      />

      {/* Alternative Asset Quick Add Modal */}
      <AlternativeAssetQuickAddModal
        open={isAlternativeAssetModalOpen}
        onOpenChange={(open) => {
          setIsAlternativeAssetModalOpen(open);
          if (!open) {
            setModalDefaultKind(undefined);
            setPendingLiabilityLink(null);
            setPendingLiabilityType(undefined);
            setPendingOriginationDate(undefined);
            setPendingMortgageName(undefined);
          }
        }}
        defaultKind={getDefaultKindForModal()}
        linkableAssets={linkableAssets}
        linkedAssetId={pendingLiabilityLink ?? undefined}
        defaultLiabilityType={pendingLiabilityType}
        defaultOriginationDate={pendingOriginationDate}
        defaultName={pendingMortgageName}
        onOpenLiabilityQuickAdd={handleOpenLiabilityQuickAdd}
      />

      {/* Asset Details Sheet (Edit) */}
      <MpfAssetEditorSheet
        open={editMpfAsset !== null}
        onOpenChange={(open) => !open && setEditMpfAsset(null)}
        mode="edit"
        holding={editMpfAsset}
        onSubmit={handleMpfSave}
        isSubmitting={isSavingDetails}
      />

      <TimeDepositEditorSheet
        open={editTimeDepositAsset !== null}
        onOpenChange={(open) => !open && setEditTimeDepositAsset(null)}
        mode="edit"
        holding={editTimeDepositAsset}
        accounts={accounts}
        onSubmit={handleTimeDepositSave}
        isSubmitting={isSavingDetails}
      />

      <InsurancePolicyEditorSheet
        open={editInsuranceAsset !== null}
        onOpenChange={(open) => !open && setEditInsuranceAsset(null)}
        mode="edit"
        holding={editInsuranceAsset}
        onSubmit={handleInsuranceSave}
        isSubmitting={isSavingDetails}
      />

      <AssetDetailsSheet
        open={editAsset !== null}
        onOpenChange={(open) => !open && setEditAsset(null)}
        asset={editAsset}
        onSave={handleSaveAssetDetails}
        isSaving={isSavingDetails}
        linkableAssets={linkableAssets}
        linkedAssetName={getLinkedAssetName(editAsset?.metadata)}
        linkedLiabilities={editAsset ? getLinkedLiabilities(editAsset.id) : []}
        availableMortgages={editAsset ? getAvailableMortgages(editAsset.id) : []}
        onLinkMortgage={handleLinkMortgage}
        onUnlinkMortgage={handleUnlinkMortgage}
      />

      {/* Update Valuation Modal */}
      <UpdateValuationModal
        open={updateValueAsset !== null}
        onOpenChange={(open) => !open && setUpdateValueAsset(null)}
        assetId={updateValueAsset?.id ?? ""}
        assetName={updateValueAsset?.name ?? ""}
        currentValue={updateValueAsset?.marketValue ?? "0"}
        lastUpdatedDate={updateValueAsset?.valuationDate?.split("T")[0] ?? ""}
        currency={updateValueAsset?.currency ?? baseCurrency}
      />

      {/* Classification Sheet */}
      <ClassificationSheet
        open={!!classifyAsset}
        onOpenChange={(open) => !open && setClassifyAsset(null)}
        assetId={classifyAsset?.id ?? ""}
        assetSymbol={classifyAsset?.symbol}
        assetName={classifyAsset?.name}
      />
    </>
  );
};

export default HoldingsPage;
