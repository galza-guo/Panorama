import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HealthConfig, HealthIssue, HealthStatus } from "@/lib/types";
import {
  dismissHealthIssue,
  executeHealthFix,
  getHealthConfig,
  getHealthStatus,
  restoreHealthIssue,
  runHealthChecks,
  updateHealthConfig,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { useAuth } from "@/context/auth-context";
import { toast } from "@panorama/ui/components/ui/use-toast";
import { getHealthFixOutcome } from "./health-fix-outcome";

/**
 * Hook for fetching health status.
 */
export function useHealthStatus(options?: { enabled?: boolean }) {
  const { isAuthenticated, statusLoading } = useAuth();

  return useQuery<HealthStatus, Error>({
    queryKey: [QueryKeys.HEALTH_STATUS],
    queryFn: getHealthStatus,
    enabled: options?.enabled !== false && !statusLoading && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for running health checks.
 */
export function useRunHealthChecks(options?: { navigate?: (path: string) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runHealthChecks,
    onSuccess: (data: HealthStatus) => {
      queryClient.setQueryData([QueryKeys.HEALTH_STATUS], data);
      const issueCount = data.issues?.length ?? 0;
      if (issueCount === 0) {
        toast.success("All checks passed", { description: "No issues found." });
      } else {
        const showIssueToast =
          data.overallSeverity === "INFO"
            ? toast.info
            : data.overallSeverity === "WARNING"
              ? toast.warning
              : toast.error;

        showIssueToast(`${issueCount} issue${issueCount > 1 ? "s" : ""} found`, {
          description: "Review the details in the Health Center.",
          action: options?.navigate
            ? { label: "View", onClick: () => options.navigate!("/health") }
            : undefined,
        });
      }
    },
    onError: (error: Error) => {
      toast.error("Health check failed", { description: error.message });
    },
  });
}

/**
 * Hook for dismissing a health issue.
 */
export function useDismissHealthIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, dataHash }: { issueId: string; dataHash: string }) =>
      dismissHealthIssue(issueId, dataHash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_STATUS] });
      toast.success("Issue dismissed");
    },
    onError: (error: Error) => {
      toast.error("Failed to dismiss issue", { description: error.message });
    },
  });
}

/**
 * Hook for restoring a dismissed health issue.
 */
export function useRestoreHealthIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreHealthIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_STATUS] });
      toast.success("Issue restored");
    },
    onError: (error: Error) => {
      toast.error("Failed to restore issue", { description: error.message });
    },
  });
}

/**
 * Hook for executing a fix action.
 */
export function useExecuteHealthFix() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (issue: HealthIssue) => {
      if (!issue.fixAction) {
        throw new Error("This issue does not have an automatic fix.");
      }

      await executeHealthFix(issue.fixAction);
      const status = await runHealthChecks();
      return { issue, status };
    },
    onSuccess: ({ issue, status }) => {
      // Update health status with fresh data from health checks
      queryClient.setQueryData([QueryKeys.HEALTH_STATUS], status);
      // Invalidate holdings so related pages refresh
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_ALLOCATIONS] });

      const outcome = getHealthFixOutcome(issue, status);
      if (outcome.kind === "fixed") {
        toast.success(outcome.title);
      } else {
        toast.warning(outcome.title, { description: outcome.description });
      }
    },
    onError: (error: Error) => {
      toast.error("Fix failed", { description: error.message });
    },
  });
}

/**
 * Hook for fetching health configuration.
 */
export function useHealthConfig() {
  const { isAuthenticated, statusLoading } = useAuth();

  return useQuery<HealthConfig, Error>({
    queryKey: [QueryKeys.HEALTH_CONFIG],
    queryFn: getHealthConfig,
    enabled: !statusLoading && isAuthenticated,
  });
}

/**
 * Hook for updating health configuration.
 */
export function useUpdateHealthConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateHealthConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_CONFIG] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HEALTH_STATUS] });
      toast.success("Configuration updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update configuration", { description: error.message });
    },
  });
}
