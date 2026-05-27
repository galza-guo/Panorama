import { invoke, isWeb } from "./platform";

export type ConnectorProvider = "WEBULL_HK";
export type ConnectorEnvironment = "SANDBOX" | "PRODUCTION";
export type ConnectorCapability =
  | "PORTFOLIO_SNAPSHOT_SYNC"
  | "ORDER_HISTORY_IMPORT"
  | "FULL_ACTIVITY_LEDGER_SYNC"
  | "TRADING"
  | "MARKET_DATA"
  | "STREAMING"
  | "WEB3_WALLET";
export type ExternalConnectionStatus = "ACTIVE" | "NEEDS_AUTH" | "PAUSED" | "FAILED";
export type ExternalAccountSyncMode = "PROSPECTIVE";
export type ExternalAccountLinkStatus = "ACTIVE" | "PAUSED" | "UNLINKED";

export interface ExternalConnection {
  id: string;
  provider: ConnectorProvider;
  displayName: string;
  environment: ConnectorEnvironment;
  ownerName?: string | null;
  status: ExternalConnectionStatus;
  capabilities: ConnectorCapability[];
  metadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebullHkConnectionRequest {
  displayName: string;
  environment: ConnectorEnvironment;
  ownerName?: string | null;
  appKey: string;
  appSecret: string;
  accessToken?: string | null;
}

export interface WebullHkRemoteAccount {
  remoteAccountId: string;
  accountNumberMasked?: string | null;
  accountType?: string | null;
  userId?: string | null;
}

export interface LinkWebullHkAccountRequest {
  connectionId: string;
  remoteAccountId: string;
  localAccountId: string;
  remoteAccountNumberMasked?: string | null;
  remoteAccountType?: string | null;
  sourceFromDate: string;
}

export interface ExternalAccountLink {
  id: string;
  connectionId: string;
  provider: ConnectorProvider;
  remoteAccountId: string;
  localAccountId: string;
  remoteAccountNumberMasked?: string | null;
  remoteAccountType?: string | null;
  linkedAt: string;
  sourceFromDate: string;
  syncMode: ExternalAccountSyncMode;
  status: ExternalAccountLinkStatus;
  metadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebullHkSnapshotSyncResult {
  linkId: string;
  localAccountId: string;
  remoteAccountId: string;
  snapshotDate: string;
  positions: number;
  cashBalances: number;
  assetsCreated: number;
}

function assertDesktopOnly() {
  if (isWeb) {
    throw new Error("Webull HK local connect is only available in the desktop app.");
  }
}

export async function createWebullHkConnection(
  request: CreateWebullHkConnectionRequest,
): Promise<ExternalConnection> {
  assertDesktopOnly();
  return invoke<ExternalConnection>("create_webull_hk_connection", { request });
}

export async function listWebullHkConnections(): Promise<ExternalConnection[]> {
  assertDesktopOnly();
  return invoke<ExternalConnection[]>("list_webull_hk_connections");
}

export async function deleteWebullHkConnection(connectionId: string): Promise<void> {
  assertDesktopOnly();
  return invoke<void>("delete_webull_hk_connection", { connectionId });
}

export async function listWebullHkRemoteAccounts(
  connectionId: string,
): Promise<WebullHkRemoteAccount[]> {
  assertDesktopOnly();
  return invoke<WebullHkRemoteAccount[]>("list_webull_hk_remote_accounts", { connectionId });
}

export async function linkWebullHkAccount(
  request: LinkWebullHkAccountRequest,
): Promise<ExternalAccountLink> {
  assertDesktopOnly();
  return invoke<ExternalAccountLink>("link_webull_hk_account", { request });
}

export async function listWebullHkAccountLinks(
  connectionId: string,
): Promise<ExternalAccountLink[]> {
  assertDesktopOnly();
  return invoke<ExternalAccountLink[]>("list_webull_hk_account_links", { connectionId });
}

export async function syncWebullHkAccountSnapshot(
  linkId: string,
): Promise<WebullHkSnapshotSyncResult> {
  assertDesktopOnly();
  return invoke<WebullHkSnapshotSyncResult>("sync_webull_hk_account_snapshot", { linkId });
}
