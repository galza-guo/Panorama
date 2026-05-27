import {
  createWebullHkConnection,
  deleteWebullHkConnection,
  linkWebullHkAccount,
  listWebullHkAccountLinks,
  listWebullHkConnections,
  listWebullHkRemoteAccounts,
  syncWebullHkAccountSnapshot,
  type CreateWebullHkConnectionRequest,
  type LinkWebullHkAccountRequest,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

export const webullHkQueryKeys = {
  connections: ["webull-hk", "connections"] as const,
  remoteAccounts: (connectionId: string) => ["webull-hk", "remote-accounts", connectionId] as const,
  accountLinks: (connectionId: string) => ["webull-hk", "account-links", connectionId] as const,
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export function useWebullHkConnections(enabled: boolean) {
  return useQuery({
    queryKey: webullHkQueryKeys.connections,
    queryFn: listWebullHkConnections,
    enabled,
  });
}

export function useWebullHkRemoteAccounts(connectionId: string | null, enabled: boolean) {
  const connectionKey = connectionId ?? "";

  return useQuery({
    queryKey: webullHkQueryKeys.remoteAccounts(connectionKey),
    queryFn: () => listWebullHkRemoteAccounts(connectionKey),
    enabled: enabled && Boolean(connectionId),
  });
}

export function useWebullHkAccountLinks(connectionId: string | null, enabled: boolean) {
  const connectionKey = connectionId ?? "";

  return useQuery({
    queryKey: webullHkQueryKeys.accountLinks(connectionKey),
    queryFn: () => listWebullHkAccountLinks(connectionKey),
    enabled: enabled && Boolean(connectionId),
  });
}

export function useCreateWebullHkConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateWebullHkConnectionRequest) => createWebullHkConnection(request),
    onSuccess: () => {
      toast.success("Webull HK connection saved");
      void queryClient.invalidateQueries({ queryKey: webullHkQueryKeys.connections });
    },
    onError: (error) => {
      toast.error(`Connection failed: ${getErrorMessage(error)}`);
    },
  });
}

export function useDeleteWebullHkConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWebullHkConnection,
    onSuccess: () => {
      toast.success("Webull HK connection removed");
      void queryClient.invalidateQueries({ queryKey: webullHkQueryKeys.connections });
    },
    onError: (error) => {
      toast.error(`Delete failed: ${getErrorMessage(error)}`);
    },
  });
}

export function useLinkWebullHkAccount(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: LinkWebullHkAccountRequest) => linkWebullHkAccount(request),
    onSuccess: () => {
      toast.success("Webull HK account linked");
      if (connectionId) {
        void queryClient.invalidateQueries({
          queryKey: webullHkQueryKeys.accountLinks(connectionId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (error) => {
      toast.error(`Link failed: ${getErrorMessage(error)}`);
    },
  });
}

export function useSyncWebullHkAccountSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncWebullHkAccountSnapshot,
    onSuccess: (result) => {
      toast.success(
        `Synced ${result.positions} positions and ${result.cashBalances} cash balances`,
      );
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.latestValuations] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_SUMMARY] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.SNAPSHOTS] });
    },
    onError: (error) => {
      toast.error(`Sync failed: ${getErrorMessage(error)}`);
    },
  });
}
