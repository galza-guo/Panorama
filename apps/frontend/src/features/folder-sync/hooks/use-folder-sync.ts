import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  disableFolderSync,
  getFolderSyncState,
  initializeFolderSync,
  joinFolderSync,
  openFolderDialog,
  retryFolderSyncNow,
} from "@/adapters";
import { useAuth } from "@/context/auth-context";
import { QueryKeys } from "@/lib/query-keys";
import type { FolderSyncCommandResult, FolderSyncState } from "@/lib/types";

export function useFolderSync() {
  const queryClient = useQueryClient();
  const { isAuthenticated, statusLoading } = useAuth();

  const query = useQuery<FolderSyncState, Error>({
    queryKey: [QueryKeys.FOLDER_SYNC],
    queryFn: getFolderSyncState,
    enabled: !statusLoading && isAuthenticated,
  });

  const refresh = async (): Promise<FolderSyncState | undefined> => {
    const result = await query.refetch();
    return result.data;
  };

  const withRefresh = async (
    action: () => Promise<FolderSyncCommandResult>,
  ): Promise<FolderSyncCommandResult> => {
    const result = await action();
    await queryClient.invalidateQueries({ queryKey: [QueryKeys.FOLDER_SYNC] });
    await refresh();
    return result;
  };

  const selectSharedFolder = async (): Promise<string | null> => {
    return openFolderDialog();
  };

  const initialize = async (sharedFolderPath?: string): Promise<FolderSyncCommandResult | null> => {
    const folderPath = sharedFolderPath ?? (await selectSharedFolder());
    if (!folderPath) {
      return null;
    }
    return withRefresh(() => initializeFolderSync(folderPath));
  };

  const join = async (sharedFolderPath?: string): Promise<FolderSyncCommandResult | null> => {
    const folderPath = sharedFolderPath ?? (await selectSharedFolder());
    if (!folderPath) {
      return null;
    }
    return withRefresh(() => joinFolderSync(folderPath));
  };

  const retryNow = async (): Promise<FolderSyncCommandResult> => {
    return withRefresh(retryFolderSyncNow);
  };

  const disable = async (): Promise<FolderSyncCommandResult> => {
    return withRefresh(disableFolderSync);
  };

  return {
    data: query.data,
    error: query.error,
    isError: query.isError,
    isFetching: query.isFetching,
    state: query.data ?? null,
    config: query.data?.config ?? null,
    status: query.data?.status ?? null,
    history: query.data?.history ?? [],
    lastError: query.data?.status.lastError ?? null,
    isLoading: query.isLoading,
    refresh,
    refetch: query.refetch,
    selectSharedFolder,
    initialize,
    join,
    retryNow,
    disable,
  };
}
