// Tauri adapter - Desktop implementation
// This file re-exports all domain-specific modules

import type { RunEnv } from "../types";
import { RunEnvs } from "../types";

// Platform constants from core
export { isDesktop, isWeb, logger } from "./core";

/**
 * Runtime environment identifier - always "desktop" for Tauri builds
 */
export const RUN_ENV: RunEnv = RunEnvs.DESKTOP;

// Re-export types and constants from ../types
export type { EventCallback, UnlistenFn, RunEnv, Logger } from "../types";
export { RunEnvs } from "../types";
export type {
  AddonFile,
  AddonInstallResult,
  AddonManifest,
  AddonUpdateCheckResult,
  AddonUpdateInfo,
  AddonValidationResult,
  ExtractedAddon,
  FunctionPermission,
  InstalledAddon,
  Permission,
  MarketDataProviderSetting,
  ProviderCapabilities,
  ImportRunsRequest,
  UpdateThreadRequest,
  UpdateToolResultRequest,
  AppInfo,
  UpdateCheckResult,
  UpdateCheckPayload,
  PlatformCapabilities,
  PlatformInfo,
} from "../types";

// Re-export AI types from features/ai-assistant
export type {
  AiChatModelConfig,
  AiSendMessageRequest,
  AiStreamEvent,
  AiToolCall,
  AiToolResult,
  AiChatMessage,
  AiUsageStats,
  AiThread,
  ThreadPage,
  ListThreadsRequest,
} from "@/features/ai-assistant/types";

// ============================================================================
// Shared domain modules (identical logic for both platforms)
// ============================================================================

// Account Commands
export * from "../shared/accounts";

// Activity Commands
export * from "../shared/activities";
export { parseCsv } from "./activities";

// Portfolio Commands
export * from "../shared/portfolio";

// Target Allocation Commands
export * from "../shared/target-allocation";

// Market Data Commands
export * from "../shared/market-data";

// Goal Commands
export * from "../shared/goals";

// Taxonomy Commands
export * from "../shared/taxonomies";

// Alternative Assets Commands
export * from "../shared/alternative-assets";

// Contribution Limits Commands
export * from "../shared/contribution-limits";

// Exchange Rates Commands
export * from "../shared/exchange-rates";

// Secrets Commands
export * from "../shared/secrets";

// Webull HK Local Connect Commands
export * from "../shared/webull-hk";

// AI Providers Commands
export * from "../shared/ai-providers";

// AI Thread Commands
export * from "../shared/ai-threads";

// Health Center Commands
export * from "../shared/health";

// Photo Tray Commands
export * from "../shared/photos";

// ============================================================================
// Platform-specific modules (different implementations)
// ============================================================================

// Settings Commands (contains platform-specific backupDatabase, etc.)
export {
  getSettings,
  updateSettings,
  isAutoUpdateCheckEnabled,
  backupDatabase,
  backupDatabaseToPath,
  restoreDatabase,
  getAppInfo,
  checkForUpdates,
  installUpdate,
  getPlatform,
} from "./settings";

export {
  getFolderSyncState,
  initializeFolderSync,
  joinFolderSync,
  retryFolderSyncNow,
  disableFolderSync,
} from "./folder-sync";

// Addon Commands (platform-specific)
export {
  extractAddonZip,
  installAddonZip,
  installAddonFile,
  listInstalledAddons,
  toggleAddon,
  uninstallAddon,
  loadAddonForRuntime,
  getEnabledAddonsOnStartup,
  getInstalledAddons,
  loadAddon,
  extractAddon,
  installAddon,
  getEnabledAddons,
  checkAddonUpdate,
  checkAllAddonUpdates,
  updateAddon,
  downloadAddonForReview,
  installFromStaging,
  clearAddonStaging,
  getAddonRatings,
  submitAddonRating,
  fetchAddonStoreListings,
} from "./addons";

// AI Streaming (Tauri Channel-based implementation)
export { streamAiChat } from "./ai-streaming";

// Event Listeners (Tauri listen() implementation)
export {
  listenFileDropHover,
  listenFileDrop,
  listenFileDropCancelled,
  listenPortfolioUpdateStart,
  listenPortfolioUpdateComplete,
  listenDatabaseRestored,
  listenPortfolioUpdateError,
  listenMarketSyncComplete,
  listenMarketSyncStart,
  listenMarketSyncError,
  listenNavigateToRoute,
  listenDeepLink,
} from "./events";

// File Dialogs (Tauri file dialogs)
export {
  openCsvFileDialog,
  openFolderDialog,
  openDatabaseFileDialog,
  openFileSaveDialog,
  openUrlInBrowser,
} from "./files";
