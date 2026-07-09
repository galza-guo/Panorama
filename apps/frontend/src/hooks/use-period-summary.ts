import { useQuery } from "@tanstack/react-query";

import { getPeriodSummary } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { PeriodSummary, PeriodSummaryPeriod } from "@/lib/types";

interface UsePeriodSummaryOptions {
  startDate: string;
  endDate: string;
  period: PeriodSummaryPeriod;
  enabled?: boolean;
}

export function usePeriodSummary(options: UsePeriodSummaryOptions) {
  const { startDate, endDate, period, enabled = true } = options;

  return useQuery<PeriodSummary, Error>({
    queryKey: QueryKeys.periodSummary(startDate, endDate, period),
    queryFn: () => getPeriodSummary(startDate, endDate, period),
    enabled,
  });
}
