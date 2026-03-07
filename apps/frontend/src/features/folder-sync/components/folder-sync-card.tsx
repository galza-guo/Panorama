import { useState } from "react";

import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";

import { useFolderSync } from "../hooks/use-folder-sync";

const statusLabels: Record<string, string> = {
  idle: "Idle",
  checking: "Checking",
  exporting: "Exporting",
  applying_changes: "Applying changes",
  up_to_date: "Up to date",
  needs_attention: "Needs attention",
  folder_unavailable: "Folder unavailable",
  unsupported: "Unsupported",
};

const statusVariants: Record<string, "destructive" | "outline" | "secondary" | "success" | "warning"> =
  {
    idle: "outline",
    checking: "secondary",
    exporting: "secondary",
    applying_changes: "secondary",
    up_to_date: "success",
    needs_attention: "warning",
    folder_unavailable: "destructive",
    unsupported: "outline",
  };

function getStatusLabel(syncState: string | null | undefined): string {
  if (!syncState) {
    return "Loading";
  }
  return statusLabels[syncState] ?? syncState;
}

function getStatusVariant(
  syncState: string | null | undefined,
): "destructive" | "outline" | "secondary" | "success" | "warning" {
  if (!syncState) {
    return "secondary";
  }
  return statusVariants[syncState] ?? "outline";
}

function TimestampRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-sm">
        {value ? (
          <time className="font-mono text-xs" dateTime={value}>
            {value}
          </time>
        ) : (
          <span className="text-muted-foreground">Never</span>
        )}
      </dd>
    </div>
  );
}

export function FolderSyncCard() {
  const { isLoading, config, status, history, lastError, initialize, join, retryNow, disable } =
    useFolderSync();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (actionName: string, action: () => Promise<unknown>) => {
    setPendingAction(actionName);
    setActionError(null);

    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Folder sync action failed");
    } finally {
      setPendingAction(null);
    }
  };

  const isBusy = isLoading || pendingAction !== null;
  const syncState = status?.syncState ?? (isLoading ? "checking" : "idle");
  const visibleHistory = history.slice(0, 5);
  const errorMessage = actionError ?? lastError;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-medium">Folder Sync</CardTitle>
            <CardDescription>
              Keep shared Panorama data aligned across devices through one Syncthing folder.
            </CardDescription>
          </div>
          <Badge variant={getStatusVariant(syncState)}>{getStatusLabel(syncState)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Shared folder</p>
          <p className="bg-muted rounded-md px-3 py-2 font-mono text-xs">
            {config?.sharedFolderPath ?? "Not configured"}
          </p>
        </div>

        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {!config ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={isBusy} onClick={() => runAction("initialize", () => initialize())}>
              Initialize Sync
            </Button>
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => runAction("join", () => join())}
            >
              Join Existing Sync
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => runAction("retry", retryNow)}
            >
              Check now
            </Button>
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => runAction("disable", disable)}
            >
              Disable Sync
            </Button>
          </div>
        )}

        <dl className="grid gap-4 md:grid-cols-3">
          <TimestampRow label="Last successful sync" value={status?.lastSuccessfulSyncAt} />
          <TimestampRow label="Last remote change" value={status?.lastRemoteApplyAt} />
          <TimestampRow label="Last local export" value={status?.lastLocalExportAt} />
        </dl>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Recent sync activity</p>
            <p className="text-muted-foreground text-xs">
              The latest import, export, and recovery events from this shared folder.
            </p>
          </div>

          {visibleHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sync activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {visibleHistory.map((entry) => (
                <li key={entry.id} className="bg-muted/40 rounded-md border px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm">{entry.message}</p>
                    <Badge variant={entry.status === "success" ? "success" : "outline"}>
                      {entry.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {entry.sourceDeviceId ? `From ${entry.sourceDeviceId} • ` : ""}
                    <time className="font-mono" dateTime={entry.createdAt}>
                      {entry.createdAt}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
