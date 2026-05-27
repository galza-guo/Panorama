import { isDesktop, type ConnectorEnvironment } from "@/adapters";
import type { ExternalAccountLink, ExternalConnection, WebullHkRemoteAccount } from "@/adapters";
import { useAccounts } from "@/hooks/use-accounts";
import { cn } from "@/lib/utils";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SettingsHeader } from "../settings-header";
import {
  useCreateWebullHkConnection,
  useDeleteWebullHkConnection,
  useLinkWebullHkAccount,
  useSyncWebullHkAccountSnapshot,
  useWebullHkAccountLinks,
  useWebullHkConnections,
  useWebullHkRemoteAccounts,
} from "./use-webull-hk";

const selectClassName =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

function todayDateInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function statusVariant(status: ExternalConnection["status"]) {
  if (status === "ACTIVE") return "success";
  if (status === "NEEDS_AUTH") return "warning";
  if (status === "FAILED") return "destructive";
  return "secondary";
}

function accountLabel(account: { name: string; currency: string; accountOwner?: string | null }) {
  return [account.name, account.currency, account.accountOwner].filter(Boolean).join(" · ");
}

function ConnectionForm() {
  const createConnection = useCreateWebullHkConnection();
  const [displayName, setDisplayName] = useState("Webull HK");
  const [ownerName, setOwnerName] = useState("");
  const [environment, setEnvironment] = useState<ConnectorEnvironment>("SANDBOX");
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const canSubmit = displayName.trim() && appKey.trim() && appSecret.trim() && accessToken.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    createConnection.mutate(
      {
        displayName: displayName.trim(),
        environment,
        ownerName: ownerName.trim() || null,
        appKey: appKey.trim(),
        appSecret: appSecret.trim(),
        accessToken: accessToken.trim(),
      },
      {
        onSuccess: () => {
          setAppKey("");
          setAppSecret("");
          setAccessToken("");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Connection</CardTitle>
        <CardDescription>Webull HK OpenAPI credentials stay on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="webull-display-name">Display name</Label>
            <Input
              id="webull-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webull-owner-name">Owner</Label>
            <Input
              id="webull-owner-name"
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webull-environment">Environment</Label>
            <select
              id="webull-environment"
              className={selectClassName}
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as ConnectorEnvironment)}
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="webull-app-key">App Key</Label>
            <Input
              id="webull-app-key"
              value={appKey}
              onChange={(event) => setAppKey(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webull-app-secret">App Secret</Label>
            <Input
              id="webull-app-secret"
              type="password"
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webull-access-token">Access Token</Label>
            <Input
              id="webull-access-token"
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex items-end md:col-span-2">
            <Button
              type="submit"
              disabled={!canSubmit || createConnection.isPending}
              className="w-full gap-2 md:w-auto"
            >
              {createConnection.isPending ? (
                <Icons.Spinner className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.Plus className="h-4 w-4" />
              )}
              Save Connection
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ConnectionsCard({
  connections,
  selectedConnectionId,
  isLoading,
  onSelect,
}: {
  connections: ExternalConnection[];
  selectedConnectionId: string | null;
  isLoading: boolean;
  onSelect: (connectionId: string) => void;
}) {
  const deleteConnection = useDeleteWebullHkConnection();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : connections.length === 0 ? (
          <div className="text-muted-foreground rounded-md border p-4 text-sm">
            No Webull HK connections
          </div>
        ) : (
          connections.map((connection) => (
            <div
              key={connection.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border p-3",
                selectedConnectionId === connection.id && "border-primary bg-primary/5",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onSelect(connection.id)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{connection.displayName}</span>
                  <Badge variant={statusVariant(connection.status)}>{connection.status}</Badge>
                </div>
                <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-xs">
                  <span>{connection.environment}</span>
                  {connection.ownerName && <span>{connection.ownerName}</span>}
                </div>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => deleteConnection.mutate(connection.id)}
                disabled={deleteConnection.isPending}
                aria-label={`Delete ${connection.displayName}`}
              >
                <Icons.Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RemoteAccountRow({
  remoteAccount,
  links,
  accounts,
  localAccountById,
  connectionId,
}: {
  remoteAccount: WebullHkRemoteAccount;
  links: ExternalAccountLink[];
  accounts: ReturnType<typeof useAccounts>["accounts"];
  localAccountById: Map<string, (typeof accounts)[number]>;
  connectionId: string;
}) {
  const linkAccount = useLinkWebullHkAccount(connectionId);
  const [selectedLocalAccountId, setSelectedLocalAccountId] = useState("");
  const [sourceFromDate, setSourceFromDate] = useState(todayDateInputValue);
  const existingLink = links.find((link) => link.remoteAccountId === remoteAccount.remoteAccountId);
  const existingLocalAccount = existingLink
    ? localAccountById.get(existingLink.localAccountId)
    : null;

  const handleLink = () => {
    if (!selectedLocalAccountId) return;

    linkAccount.mutate({
      connectionId,
      remoteAccountId: remoteAccount.remoteAccountId,
      localAccountId: selectedLocalAccountId,
      remoteAccountNumberMasked: remoteAccount.accountNumberMasked ?? null,
      remoteAccountType: remoteAccount.accountType ?? null,
      sourceFromDate,
    });
  };

  return (
    <div className="grid gap-3 rounded-md border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">
            {remoteAccount.accountNumberMasked ?? remoteAccount.remoteAccountId}
          </span>
          {remoteAccount.accountType && (
            <Badge variant="secondary">{remoteAccount.accountType}</Badge>
          )}
        </div>
        <div className="text-muted-foreground mt-1 truncate text-xs">
          {remoteAccount.remoteAccountId}
        </div>
      </div>
      {existingLink ? (
        <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-md px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm">
              {existingLocalAccount
                ? accountLabel(existingLocalAccount)
                : existingLink.localAccountId}
            </div>
            <div className="text-muted-foreground text-xs">From {existingLink.sourceFromDate}</div>
          </div>
          <Badge variant="success">Linked</Badge>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
          <select
            className={selectClassName}
            value={selectedLocalAccountId}
            onChange={(event) => setSelectedLocalAccountId(event.target.value)}
            disabled={accounts.length === 0}
            aria-label="Local account"
          >
            <option value="">Local account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={sourceFromDate}
            onChange={(event) => setSourceFromDate(event.target.value)}
            aria-label="Source from date"
          />
          <Button
            type="button"
            onClick={handleLink}
            disabled={!selectedLocalAccountId || linkAccount.isPending}
            className="gap-2"
          >
            {linkAccount.isPending ? (
              <Icons.Spinner className="h-4 w-4 animate-spin" />
            ) : (
              <Icons.Link className="h-4 w-4" />
            )}
            Link
          </Button>
        </div>
      )}
    </div>
  );
}

function RemoteAccountsCard({
  selectedConnectionId,
  links,
}: {
  selectedConnectionId: string | null;
  links: ExternalAccountLink[];
}) {
  const { accounts } = useAccounts({ filterActive: false, includeArchived: false });
  const remoteAccountsQuery = useWebullHkRemoteAccounts(selectedConnectionId, isDesktop);
  const localAccountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Remote Accounts</CardTitle>
          <CardDescription>Link each Webull account to one Panorama account.</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => remoteAccountsQuery.refetch()}
          disabled={!selectedConnectionId || remoteAccountsQuery.isFetching}
          className="gap-2"
        >
          <Icons.RefreshCw
            className={cn("h-4 w-4", remoteAccountsQuery.isFetching && "animate-spin")}
          />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!selectedConnectionId ? (
          <div className="text-muted-foreground rounded-md border p-4 text-sm">
            Select a connection
          </div>
        ) : remoteAccountsQuery.isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : remoteAccountsQuery.isError ? (
          <div className="text-destructive rounded-md border p-4 text-sm">
            {remoteAccountsQuery.error.message}
          </div>
        ) : remoteAccountsQuery.data?.length ? (
          remoteAccountsQuery.data.map((remoteAccount) => (
            <RemoteAccountRow
              key={remoteAccount.remoteAccountId}
              remoteAccount={remoteAccount}
              links={links}
              accounts={accounts}
              localAccountById={localAccountById}
              connectionId={selectedConnectionId}
            />
          ))
        ) : (
          <div className="text-muted-foreground rounded-md border p-4 text-sm">
            No remote accounts
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinkedAccountsCard({
  links,
  accountNameById,
  isLoading,
}: {
  links: ExternalAccountLink[];
  accountNameById: Map<string, string>;
  isLoading: boolean;
}) {
  const syncSnapshot = useSyncWebullHkAccountSnapshot();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linked Accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : links.length === 0 ? (
          <div className="text-muted-foreground rounded-md border p-4 text-sm">
            No linked accounts
          </div>
        ) : (
          links.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {accountNameById.get(link.localAccountId) ?? link.localAccountId}
                </div>
                <div className="text-muted-foreground mt-1 truncate text-xs">
                  {link.remoteAccountNumberMasked ?? link.remoteAccountId} · From{" "}
                  {link.sourceFromDate}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => syncSnapshot.mutate(link.id)}
                disabled={syncSnapshot.isPending}
                className="gap-2"
              >
                {syncSnapshot.isPending ? (
                  <Icons.Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <Icons.RefreshCw className="h-4 w-4" />
                )}
                Sync
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DesktopOnlyCard() {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <div className="bg-muted mb-2 flex h-12 w-12 items-center justify-center rounded-full">
          <Icons.Monitor className="text-muted-foreground h-6 w-6" />
        </div>
        <CardTitle>Desktop App Required</CardTitle>
        <CardDescription>Webull HK local connect is unavailable in web mode.</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function WebullHkSettingsPage() {
  const connectionsQuery = useWebullHkConnections(isDesktop);
  const connections = useMemo(() => connectionsQuery.data ?? [], [connectionsQuery.data]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const { accounts } = useAccounts({ filterActive: false, includeArchived: false });
  const linksQuery = useWebullHkAccountLinks(selectedConnectionId, isDesktop);
  const links = useMemo(() => linksQuery.data ?? [], [linksQuery.data]);

  useEffect(() => {
    if (connections.length === 0) {
      setSelectedConnectionId(null);
      return;
    }
    if (
      !selectedConnectionId ||
      !connections.some((connection) => connection.id === selectedConnectionId)
    ) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  const accountNameById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  return (
    <div className="space-y-6">
      <SettingsHeader heading="Webull HK" text="Local account linking and snapshot sync." />
      <Separator />
      {!isDesktop ? (
        <DesktopOnlyCard />
      ) : (
        <>
          <ConnectionForm />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <ConnectionsCard
              connections={connections}
              selectedConnectionId={selectedConnectionId}
              isLoading={connectionsQuery.isLoading}
              onSelect={setSelectedConnectionId}
            />
            <LinkedAccountsCard
              links={links}
              accountNameById={accountNameById}
              isLoading={linksQuery.isLoading}
            />
          </div>
          <RemoteAccountsCard selectedConnectionId={selectedConnectionId} links={links} />
        </>
      )}
    </div>
  );
}
