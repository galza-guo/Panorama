import type { FolderSyncCommandResult, FolderSyncState } from "@/lib/types";

import { invoke } from "./core";

export const getFolderSyncState = async (): Promise<FolderSyncState> => {
  return invoke<FolderSyncState>("get_folder_sync_state");
};

export const initializeFolderSync = async (
  sharedFolderPath: string,
): Promise<FolderSyncCommandResult> => {
  return invoke<FolderSyncCommandResult>("initialize_folder_sync", { sharedFolderPath });
};

export const joinFolderSync = async (sharedFolderPath: string): Promise<FolderSyncCommandResult> => {
  return invoke<FolderSyncCommandResult>("join_folder_sync", { sharedFolderPath });
};

export const retryFolderSyncNow = async (): Promise<FolderSyncCommandResult> => {
  return invoke<FolderSyncCommandResult>("retry_folder_sync_now");
};

export const disableFolderSync = async (): Promise<FolderSyncCommandResult> => {
  return invoke<FolderSyncCommandResult>("disable_folder_sync");
};
