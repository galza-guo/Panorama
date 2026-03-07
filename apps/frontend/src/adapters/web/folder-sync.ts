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

export const getFolderSyncState = async (): Promise<FolderSyncState> => {
  return unsupportedState;
};

export const initializeFolderSync = async (): Promise<FolderSyncCommandResult> => {
  return unsupportedResult;
};

export const joinFolderSync = async (): Promise<FolderSyncCommandResult> => {
  return unsupportedResult;
};

export const retryFolderSyncNow = async (): Promise<FolderSyncCommandResult> => {
  return unsupportedResult;
};

export const disableFolderSync = async (): Promise<FolderSyncCommandResult> => {
  return unsupportedResult;
};
