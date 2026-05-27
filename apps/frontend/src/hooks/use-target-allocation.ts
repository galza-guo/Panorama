import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getTargetAllocation,
  saveTargetAllocation,
  setTargetAllocationAccountDefault,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { TargetAllocationPlanData } from "@/lib/types";

export function useTargetAllocation() {
  return useQuery({
    queryKey: [QueryKeys.TARGET_ALLOCATION],
    queryFn: getTargetAllocation,
  });
}

export function useSaveTargetAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: TargetAllocationPlanData) => saveTargetAllocation(plan),
    onSuccess: (view) => {
      queryClient.setQueryData([QueryKeys.TARGET_ALLOCATION], view);
      queryClient.invalidateQueries({ queryKey: [QueryKeys.TARGET_ALLOCATION] });
    },
  });
}

export function useSetTargetAllocationAccountDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, folderNodeId }: { accountId: string; folderNodeId: string | null }) =>
      setTargetAllocationAccountDefault(accountId, folderNodeId),
    onSuccess: (view) => {
      queryClient.setQueryData([QueryKeys.TARGET_ALLOCATION], view);
      queryClient.invalidateQueries({ queryKey: [QueryKeys.TARGET_ALLOCATION] });
    },
  });
}
