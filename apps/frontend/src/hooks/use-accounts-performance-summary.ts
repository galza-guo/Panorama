import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { calculatePerformanceSummary } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, PerformanceMetrics } from "@/lib/types";

export const useAccountsPerformanceSummary = (accounts: Account[] | undefined) => {
  const summaryAccounts = useMemo(
    () => accounts?.filter((account) => account.trackingMode === "TRANSACTIONS") ?? [],
    [accounts],
  );

  const queries = useQueries({
    queries: summaryAccounts.map((account) => ({
      queryKey: [QueryKeys.PERFORMANCE_SUMMARY, account.id, account.trackingMode, "dashboard"],
      queryFn: () =>
        calculatePerformanceSummary({
          itemType: "account",
          itemId: account.id,
          trackingMode:
            account.trackingMode === "NOT_SET" ? undefined : account.trackingMode,
        }),
      enabled: !!account.id,
      retry: false,
      staleTime: 30 * 1000,
    })),
  });

  const data = useMemo(
    () =>
      queries
        .map((query) => query.data)
        .filter((summary): summary is PerformanceMetrics => Boolean(summary)),
    [queries],
  );

  return {
    data,
    isLoading: queries.some((query) => query.isLoading),
    isFetching: queries.some((query) => query.isFetching),
    isError: queries.some((query) => query.isError),
    error: queries.find((query) => query.error)?.error ?? null,
  };
};
