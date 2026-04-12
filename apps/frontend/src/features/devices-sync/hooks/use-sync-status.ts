import { useWealthfolioConnect } from "@/features/wealthfolio-connect";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { syncService } from "../services/sync-service";
import { SyncError, SyncStates } from "../types";

export function useSyncStatus() {
  const { isConnected, isEnabled, userInfo } = useWealthfolioConnect();

  const hasSubscription =
    userInfo?.team?.subscription_status === "active" ||
    userInfo?.team?.subscription_status === "trialing";

  const enabled = !!isEnabled && !!isConnected && !!hasSubscription;

  const statusQuery = useQuery({
    queryKey: ["sync", "status", enabled ? "enabled" : "disabled"],
    queryFn: async () => {
      try {
        return await syncService.detectState();
      } catch (error) {
        if (SyncError.isNoAccessToken(error)) return null;
        throw error;
      }
    },
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const engineQuery = useQuery({
    queryKey: ["sync", "engine", enabled ? "enabled" : "disabled"],
    queryFn: () => syncService.getEngineStatus(),
    enabled: statusQuery.data?.state === SyncStates.READY,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const refetch = useCallback(() => {
    statusQuery.refetch();
    engineQuery.refetch();
  }, [engineQuery, statusQuery]);

  return {
    syncState: statusQuery.data?.state ?? SyncStates.FRESH,
    device: statusQuery.data?.device ?? null,
    identity: statusQuery.data?.identity ?? null,
    trustedDevices: statusQuery.data?.trustedDevices ?? [],
    serverKeyVersion: statusQuery.data?.serverKeyVersion ?? null,
    engineStatus: engineQuery.data ?? null,
    engineIsFetching: engineQuery.isFetching,
    isLoading: statusQuery.isLoading,
    error: statusQuery.error ? SyncError.from(statusQuery.error) : null,
    refetch,
  };
}
