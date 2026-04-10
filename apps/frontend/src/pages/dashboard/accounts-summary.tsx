"use client";

import { useAccounts } from "@/hooks/use-accounts";
import { useAccountsPerformanceSummary } from "@/hooks/use-accounts-performance-summary";
import { useLatestValuations } from "@/hooks/use-latest-valuations";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account, AccountValuation, PerformanceMetrics } from "@/lib/types";
import { GainAmount, GainPercent, PrivacyAmount } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

interface AccountSummaryDisplayData {
  accountName: string;
  baseCurrency: string;
  totalValueBaseCurrency: number;
  totalGainLossAmountBaseCurrency: number | null;
  totalValueAccountCurrency?: number;
  totalGainLossAmountAccountCurrency?: number | null;
  accountCurrency?: string;
  totalGainLossPercent: number | null;
  accountId?: string;
  accountType?: string;
  accountGroup?: string | null;
  isGroup?: boolean;
  accountCount?: number;
  accounts?: AccountSummaryDisplayData[];
  displayInAccountCurrency?: boolean;
  gainLossLabel?: string;
  returnLabel?: string;
  compactPerformanceDisplay?: boolean;
}

interface AccountPerformanceDisplay {
  totalGainLossAmountAccountCurrency: number | null;
  totalGainLossAmountBaseCurrency: number | null;
  totalGainLossPercent: number | null;
}

interface PerformanceLabels {
  gainLossLabel: string;
  returnLabel: string;
}

function getPerformanceLabels(trackingMode?: Account["trackingMode"]): PerformanceLabels {
  switch (trackingMode) {
    case "HOLDINGS":
      return {
        gainLossLabel: "Unrealized P&L",
        returnLabel: "Unrealized Return",
      };
    case "TRANSACTIONS":
      return {
        gainLossLabel: "Total Gain/Loss",
        returnLabel: "Total Return",
      };
    default:
      return {
        gainLossLabel: "Gain/Loss",
        returnLabel: "Return",
      };
  }
}

function calculateHoldingsFallbackPerformance(
  valuation: AccountValuation | undefined,
): AccountPerformanceDisplay {
  if (!valuation) {
    return {
      totalGainLossAmountAccountCurrency: null,
      totalGainLossAmountBaseCurrency: null,
      totalGainLossPercent: null,
    };
  }

  const fxRate = Number(valuation.fxRateToBase ?? 1) || 1;
  const gainLossAmount = Number(valuation.investmentMarketValue) - Number(valuation.costBasis);
  const denominator = Number(valuation.costBasis);

  return {
    totalGainLossAmountAccountCurrency: gainLossAmount,
    totalGainLossAmountBaseCurrency: gainLossAmount * fxRate,
    totalGainLossPercent:
      denominator !== 0 ? gainLossAmount / denominator : gainLossAmount === 0 ? 0 : null,
  };
}

function calculateAccountPerformance(
  account: Account,
  valuation: AccountValuation | undefined,
  performanceSummary: PerformanceMetrics | undefined,
): AccountPerformanceDisplay {
  if (!valuation) {
    return {
      totalGainLossAmountAccountCurrency: null,
      totalGainLossAmountBaseCurrency: null,
      totalGainLossPercent: null,
    };
  }

  if (account.trackingMode === "HOLDINGS") {
    return calculateHoldingsFallbackPerformance(valuation);
  }

  if (performanceSummary) {
    const fxRate = Number(valuation.fxRateToBase ?? 1) || 1;
    const gainLossAmount = Number(performanceSummary.periodGain);
    const totalReturnPercent =
      performanceSummary.cumulativeMwr ?? performanceSummary.periodReturn;

    return {
      totalGainLossAmountAccountCurrency: gainLossAmount,
      totalGainLossAmountBaseCurrency: gainLossAmount * fxRate,
      totalGainLossPercent: Number(totalReturnPercent),
    };
  }

  if (account.trackingMode === "TRANSACTIONS") {
    return {
      totalGainLossAmountAccountCurrency: null,
      totalGainLossAmountBaseCurrency: null,
      totalGainLossPercent: null,
    };
  }
  return calculateHoldingsFallbackPerformance(valuation);
}

const AccountSummarySkeleton = () => (
  <div className="flex w-full items-center justify-between gap-3">
    <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-1.5">
      <Skeleton className="h-5 w-40 rounded md:h-6" />
      <Skeleton className="h-4 w-32 rounded md:h-4" />
    </div>
    <div className="flex shrink-0 items-center gap-2 md:gap-3">
      <div className="flex min-h-12 flex-col items-end justify-center gap-1 md:gap-1.5">
        <Skeleton className="h-5 w-24 rounded md:h-6" />
        <Skeleton className="h-4 w-32 rounded md:h-4" />
      </div>
      <div className="flex items-center justify-center">
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
    </div>
  </div>
);

const AccountSummaryComponent = React.memo(
  ({
    item,
    isExpanded = false,
    onToggle,
    isLoadingValuation = false,
    displayInAccountCurrency = false,
    isNested = false,
  }: {
    item: AccountSummaryDisplayData;
    isExpanded?: boolean;
    onToggle?: () => void;
    isLoadingValuation?: boolean;
    displayInAccountCurrency?: boolean;
    isNested?: boolean;
  }) => {
    const isGroup = item.isGroup ?? false;
    const useAccountCurrency =
      displayInAccountCurrency || (item.displayInAccountCurrency && Boolean(item.accountCurrency));

    if (!isGroup && isLoadingValuation) {
      const skeletonContent = <AccountSummarySkeleton />;

      if (isNested) {
        return (
          <div className="flex w-full items-center justify-between gap-3">{skeletonContent}</div>
        );
      }

      return (
        <div className="border-border bg-card shadow-xs flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 md:px-5 md:py-4">
          {skeletonContent}
        </div>
      );
    }

    const name = item.accountName;
    const accountId = item.accountId;

    const subText = isGroup
      ? `${item.accountCount} ${item.accountCount === 1 ? "account" : "accounts"}`
      : useAccountCurrency
        ? (item.accountCurrency ?? item.baseCurrency)
        : item.baseCurrency;

    const totalValue = useAccountCurrency
      ? (item.totalValueAccountCurrency ?? 0)
      : item.totalValueBaseCurrency;
    const currency = useAccountCurrency
      ? (item.accountCurrency ?? item.baseCurrency)
      : item.baseCurrency;

    const gainAmountToDisplay = useAccountCurrency
      ? item.totalGainLossAmountAccountCurrency
      : item.totalGainLossAmountBaseCurrency;
    const gainDisplayCurrency = currency;
    const gainPercentToDisplay = item.totalGainLossPercent;
    const gainLossLabel = item.gainLossLabel ?? "Gain/Loss";
    const returnLabel = item.returnLabel ?? "Return";
    const compactPerformanceDisplay = item.compactPerformanceDisplay ?? false;

    const content = (
      <>
        <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-1.5">
          <h3 className="truncate text-sm font-semibold leading-tight md:text-base md:font-semibold">
            {name}
          </h3>
          <p className="text-muted-foreground truncate text-xs md:text-sm">{subText}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <div className="flex min-h-[3rem] flex-col items-end justify-center gap-1 md:gap-1.5">
            <p className="text-sm font-semibold leading-tight md:text-base md:font-semibold">
              <PrivacyAmount value={totalValue} currency={currency} />
            </p>
            {(gainAmountToDisplay !== null || gainPercentToDisplay !== null) &&
              !(gainAmountToDisplay === 0 && gainPercentToDisplay === 0) && (
                compactPerformanceDisplay ? (
                  <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2">
                    {gainAmountToDisplay !== null && (
                      <GainAmount
                        className="text-xs font-medium md:text-sm md:font-medium"
                        value={gainAmountToDisplay ?? 0}
                        currency={gainDisplayCurrency}
                        displayCurrency={false}
                      />
                    )}
                    {gainPercentToDisplay !== null && (
                      <GainPercent
                        className="text-[11px] font-medium md:text-xs"
                        value={gainPercentToDisplay}
                        variant="badge"
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 md:gap-x-2">
                    {gainAmountToDisplay !== null && (
                      <>
                        <span className="text-muted-foreground text-[11px] font-medium md:text-xs">
                          {gainLossLabel}
                        </span>
                        <GainAmount
                          className="text-xs font-medium md:text-sm md:font-medium"
                          value={gainAmountToDisplay ?? 0}
                          currency={gainDisplayCurrency}
                          displayCurrency={false}
                          showSign={false}
                        />
                      </>
                    )}
                    {gainAmountToDisplay !== null && gainPercentToDisplay !== null && (
                      <Separator orientation="vertical" className="h-3 md:h-4" />
                    )}
                    {gainPercentToDisplay !== null && (
                      <>
                        <span className="text-muted-foreground text-[11px] font-medium md:text-xs">
                          {returnLabel}
                        </span>
                        <GainPercent
                          className="text-xs font-medium md:text-sm md:font-medium"
                          value={gainPercentToDisplay}
                        />
                      </>
                    )}
                  </div>
                )
              )}
          </div>
          {isGroup ? (
            <div className="flex items-center justify-center">
              <Icons.ChevronDown
                className={`text-muted-foreground h-5 w-5 shrink-0 transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </div>
          ) : (
            !isLoadingValuation &&
            accountId && (
              <div className="flex items-center justify-center">
                <Icons.ChevronRight className="text-muted-foreground h-5 w-5 shrink-0" />
              </div>
            )
          )}
        </div>
      </>
    );

    if (isGroup) {
      return (
        <div
          onClick={onToggle}
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg p-3 transition-colors duration-150 md:p-4"
        >
          {content}
        </div>
      );
    }

    if (!isLoadingValuation && accountId) {
      if (isNested) {
        return (
          <Link
            to={`/accounts/${accountId}`}
            className="flex w-full cursor-pointer items-center justify-between gap-3"
          >
            {content}
          </Link>
        );
      }
      return (
        <Link
          to={`/accounts/${accountId}`}
          className="border-border bg-card shadow-xs flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-all duration-150 hover:shadow-md md:px-5 md:py-4"
        >
          {content}
        </Link>
      );
    }

    return (
      <div className="border-border bg-card shadow-xs flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 md:px-5 md:py-4">
        {content}
      </div>
    );
  },
);
AccountSummaryComponent.displayName = "AccountSummaryComponent";

export const AccountsSummary = React.memo(() => {
  const { accountsGrouped, setAccountsGrouped, settings } = useSettingsContext();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const {
    accounts: allAccounts,
    isLoading: isLoadingAccounts,
    isError: isErrorAccounts,
    error: errorAccounts,
  } = useAccounts();

  const accounts = allAccounts ?? [];

  const accountIds = useMemo(() => accounts?.map((acc) => acc.id) ?? [], [accounts]);

  const { latestValuations, isLoading: isLoadingValuations } = useLatestValuations(accountIds);
  const { data: performanceSummaries } = useAccountsPerformanceSummary(accounts);

  const combinedAccountViews = useMemo((): AccountSummaryDisplayData[] => {
    if (!accounts || accounts.length === 0) return [];

    const valuationMap = new Map<string, AccountValuation>();
    if (latestValuations) {
      latestValuations.forEach((val: AccountValuation) => valuationMap.set(val.accountId, val));
    }

    const performanceSummaryMap = new Map<string, PerformanceMetrics>();
    if (performanceSummaries) {
      performanceSummaries.forEach((summary) => performanceSummaryMap.set(summary.id, summary));
    }

    return accounts.map((acc): AccountSummaryDisplayData => {
      const valuation = valuationMap.get(acc.id);
      const performanceSummary = performanceSummaryMap.get(acc.id);
      const baseCurrency = settings?.baseCurrency ?? "USD";
      const labels = getPerformanceLabels(acc.trackingMode);

      if (!valuation) {
        return {
          accountName: acc.name,
          totalValueBaseCurrency: 0,
          baseCurrency,
          accountCurrency: acc.currency,
          totalGainLossAmountBaseCurrency: null,
          totalGainLossPercent: null,
          accountId: acc.id,
          accountType: acc.accountType,
          accountGroup: acc.group ?? null,
          isGroup: false,
          gainLossLabel: labels.gainLossLabel,
          returnLabel: labels.returnLabel,
          compactPerformanceDisplay: acc.trackingMode === "TRANSACTIONS",
        };
      }

      const totalValueAccountCurrency = valuation.totalValue;
      const fxRate = valuation.fxRateToBase ?? 1;
      const totalValueBaseCurrency = totalValueAccountCurrency * fxRate;
      const performance = calculateAccountPerformance(acc, valuation, performanceSummary);

      return {
        accountName: acc.name,
        totalValueBaseCurrency,
        baseCurrency,
        totalGainLossAmountBaseCurrency: performance.totalGainLossAmountBaseCurrency,
        totalValueAccountCurrency,
        accountCurrency: valuation.accountCurrency,
        totalGainLossAmountAccountCurrency: performance.totalGainLossAmountAccountCurrency,
        totalGainLossPercent: performance.totalGainLossPercent,
        accountId: acc.id,
        accountType: acc.accountType,
        accountGroup: acc.group ?? null,
        isGroup: false,
        gainLossLabel: labels.gainLossLabel,
        returnLabel: labels.returnLabel,
        compactPerformanceDisplay: acc.trackingMode === "TRANSACTIONS",
      };
    });
  }, [accounts, latestValuations, performanceSummaries, settings?.baseCurrency]);

  const toggleGroup = useCallback((groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  }, []);

  const renderedContent = useMemo(() => {
    if (isLoadingAccounts) {
      return Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="border-border bg-card shadow-xs rounded-lg border px-4 py-3 md:px-5 md:py-4"
        >
          <AccountSummarySkeleton />
        </div>
      ));
    }

    if (isErrorAccounts) {
      return (
        <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="bg-destructive/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
              <Icons.AlertTriangle className="text-destructive h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-destructive text-sm font-medium">Failed to load accounts</p>
              <p className="text-muted-foreground mt-1 break-words text-xs">
                {errorAccounts?.message || "An unexpected error occurred"}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                Try restarting the app. If this persists, your database may need to be reset.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (!combinedAccountViews || combinedAccountViews.length === 0) {
      return (
        <div className="border-border/50 bg-success/10 rounded-lg border p-6 text-center md:p-8">
          <p className="text-sm">No accounts found.</p>
          <Link
            to="/settings/accounts"
            className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
          >
            Add your first account
            <Icons.ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      );
    }

    const isLoadingPerformance = isLoadingValuations;

    if (accountsGrouped) {
      const groups: Record<string, AccountSummaryDisplayData[]> = {};
      const standaloneAccounts: AccountSummaryDisplayData[] = [];

      combinedAccountViews.forEach((account) => {
        const groupName = account.accountGroup ?? "Uncategorized";
        if (groupName === "Uncategorized") {
          standaloneAccounts.push(account);
        } else {
          if (!groups[groupName]) {
            groups[groupName] = [];
          }
          groups[groupName].push(account);
        }
      });

      const actualGroups: AccountSummaryDisplayData[] = [];

      Object.entries(groups).forEach(([groupName, groupAccounts]) => {
        if (groupAccounts.length === 1) {
          standaloneAccounts.push(groupAccounts[0]);
        } else {
          const baseCurrency = groupAccounts[0]?.baseCurrency ?? settings?.baseCurrency ?? "USD";
          const groupCurrencies = new Set(
            groupAccounts
              .map((acc) => acc.accountCurrency ?? acc.baseCurrency)
              .filter((currency): currency is string => Boolean(currency)),
          );
          const groupDisplaysAccountCurrency = groupCurrencies.size === 1;
          const groupDisplayCurrency = groupDisplaysAccountCurrency
            ? (groupAccounts[0]?.accountCurrency ?? groupAccounts[0]?.baseCurrency ?? baseCurrency)
            : baseCurrency;
          const gainLossLabels = new Set(
            groupAccounts
              .map((account) => account.gainLossLabel)
              .filter((label): label is string => Boolean(label)),
          );
          const returnLabels = new Set(
            groupAccounts
              .map((account) => account.returnLabel)
              .filter((label): label is string => Boolean(label)),
          );

          const totalValueBaseCurrency = groupAccounts.reduce(
            (sum, acc) => sum + Number(acc.totalValueBaseCurrency),
            0,
          );

          const totalGainLossAmountBase = groupAccounts.reduce(
            (sum, acc) => sum + Number(acc.totalGainLossAmountBaseCurrency ?? 0),
            0,
          );

          const weightedGroupReturn = groupAccounts.reduce(
            (accumulator, account) => {
              const weight = Number(account.totalValueBaseCurrency);

              if (weight <= 0 || account.totalGainLossPercent === null) {
                return accumulator;
              }

              return {
                weightedValue: accumulator.weightedValue + account.totalGainLossPercent * weight,
                totalWeight: accumulator.totalWeight + weight,
              };
            },
            { weightedValue: 0, totalWeight: 0 },
          );

          const groupTotalReturnPercent =
            weightedGroupReturn.totalWeight > 0
              ? weightedGroupReturn.weightedValue / weightedGroupReturn.totalWeight
              : null;

          const totalValueAccountCurrency = groupDisplaysAccountCurrency
            ? groupAccounts.reduce(
                (sum, acc) =>
                  sum + Number(acc.totalValueAccountCurrency ?? acc.totalValueBaseCurrency),
                0,
              )
            : undefined;

          const totalGainLossAmountAccountCurrency = groupDisplaysAccountCurrency
            ? groupAccounts.reduce(
                (sum, acc) => sum + Number(acc.totalGainLossAmountAccountCurrency ?? 0),
                0,
              )
            : undefined;

          actualGroups.push({
            accountName: groupName,
            totalValueBaseCurrency,
            baseCurrency,
            totalGainLossAmountBaseCurrency: totalGainLossAmountBase,
            totalGainLossPercent: groupTotalReturnPercent,
            accountCurrency: groupDisplayCurrency,
            totalValueAccountCurrency,
            totalGainLossAmountAccountCurrency: totalGainLossAmountAccountCurrency ?? null,
            isGroup: true,
            accountCount: groupAccounts.length,
            accounts: groupAccounts,
            displayInAccountCurrency: groupDisplaysAccountCurrency,
            gainLossLabel: gainLossLabels.size === 1 ? [...gainLossLabels][0] : "Mixed P&L",
            returnLabel: returnLabels.size === 1 ? [...returnLabels][0] : "Mixed Return",
          });
        }
      });

      actualGroups.sort(
        (a, b) => Number(b.totalValueBaseCurrency) - Number(a.totalValueBaseCurrency),
      );
      standaloneAccounts.sort(
        (a, b) => Number(b.totalValueBaseCurrency) - Number(a.totalValueBaseCurrency),
      );

      return (
        <>
          {actualGroups.map((group) => {
            const isExpanded = expandedGroups[group.accountName];
            const sortedAccounts = [...(group.accounts ?? [])].sort(
              (a, b) => Number(b.totalValueBaseCurrency) - Number(a.totalValueBaseCurrency),
            );

            return (
              <div
                key={group.accountName}
                className="border-border bg-card shadow-xs overflow-hidden rounded-lg border transition-shadow duration-150 hover:shadow-md"
              >
                <div className="cursor-pointer">
                  <AccountSummaryComponent
                    item={group}
                    isExpanded={isExpanded}
                    onToggle={() => toggleGroup(group.accountName)}
                  />
                </div>
                {isExpanded && (
                  <div className="border-border/50 border-t">
                    <div className="divide-border/50 divide-y">
                      {sortedAccounts.map((account) => (
                        <div key={account.accountId} className="px-4 py-3 md:px-5 md:py-4">
                          <AccountSummaryComponent
                            item={account}
                            isLoadingValuation={isLoadingPerformance}
                            displayInAccountCurrency
                            isNested
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {standaloneAccounts.map((account) => (
            <AccountSummaryComponent
              key={account.accountId}
              item={account}
              isLoadingValuation={isLoadingPerformance}
              displayInAccountCurrency
            />
          ))}
        </>
      );
    } else {
      const sortedAccounts = [...combinedAccountViews].sort(
        (a, b) => Number(b.totalValueBaseCurrency) - Number(a.totalValueBaseCurrency),
      );

      return sortedAccounts.map((account) => (
        <AccountSummaryComponent
          key={account.accountId}
          item={account}
          isLoadingValuation={isLoadingPerformance}
          displayInAccountCurrency
        />
      ));
    }
  }, [
    combinedAccountViews,
    accountsGrouped,
    expandedGroups,
    toggleGroup,
    isLoadingAccounts,
    isLoadingValuations,
    isErrorAccounts,
    errorAccounts,
    settings?.baseCurrency,
  ]);

  return (
    <div className="mb-4 w-full space-y-0">
      <div className="flex flex-row items-center justify-between gap-2 pb-2">
        <h2 className="text-md font-semibold tracking-tight">Accounts</h2>
        <Button
          variant="outline"
          className="hover:bg-success/10 rounded-lg bg-transparent transition-colors duration-150"
          size="sm"
          onClick={() => setAccountsGrouped(!accountsGrouped)}
          aria-label={accountsGrouped ? "List view" : "Group view"}
          title={accountsGrouped ? "Switch to list view" : "Switch to group view"}
          disabled={isLoadingAccounts || combinedAccountViews.length === 0}
        >
          {accountsGrouped ? (
            <Icons.ListCollapse className="h-4 w-4" />
          ) : (
            <Icons.Group className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="space-y-2 md:space-y-3">{renderedContent}</div>
    </div>
  );
});
AccountsSummary.displayName = "AccountsSummary";
