import type { FolderSyncCommandResult, FolderSyncState } from "@/lib/types";

const unsupportedState: FolderSyncState = {
  config: null,
  status: {
    syncState: "unsupported",
    lastCheckedAt: null,
    lastSuccessfulSyncAt: null,
    lastLocalExportAt: null,
    lastRemoteApplyAt: null,
    lastError: "Folder sync is only available in the desktop app.",
    updatedAt: new Date(0).toISOString(),
  },
  history: [],
};

const unsupportedResult: FolderSyncCommandResult = {
  status: "unsupported",
  message: "Folder sync is only available in the desktop app.",
  snapshotId: null,
  backupPath: null,
};

export const getFolderSyncState = (): Promise<FolderSyncState> => Promise.resolve(unsupportedState);

export const initializeFolderSync = (): Promise<FolderSyncCommandResult> =>
  Promise.resolve(unsupportedResult);

export const joinFolderSync = (): Promise<FolderSyncCommandResult> => Promise.resolve(unsupportedResult);

export const retryFolderSyncNow = (): Promise<FolderSyncCommandResult> =>
  Promise.resolve(unsupportedResult);

export const disableFolderSync = (): Promise<FolderSyncCommandResult> =>
  Promise.resolve(unsupportedResult);
