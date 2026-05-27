import type { TargetAllocationPlanData, TargetAllocationView } from "@/lib/types";
import { invoke } from "./platform";

export const getTargetAllocation = async (): Promise<TargetAllocationView> => {
  return invoke<TargetAllocationView>("get_target_allocation");
};

export const saveTargetAllocation = async (
  plan: TargetAllocationPlanData,
): Promise<TargetAllocationView> => {
  return invoke<TargetAllocationView>("save_target_allocation", { plan });
};

export const setTargetAllocationAccountDefault = async (
  accountId: string,
  folderNodeId: string | null,
): Promise<TargetAllocationView> => {
  return invoke<TargetAllocationView>("set_target_allocation_account_default", {
    accountId,
    folderNodeId,
  });
};
