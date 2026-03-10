import { getHoldings } from "@/adapters";
import { useAlternativeHoldings } from "@/hooks/use-alternative-assets";
import { useAccounts } from "@/hooks/use-accounts";
import {
  useAssignBucketAccountDefault,
  useAssignBucketAsset,
  useAssignBucketHoldingOverride,
  useBucketAccountDefaults,
  useBucketAssetAssignments,
  useBucketHoldingOverrides,
  useBuckets,
  useCreateBucket,
  useDeleteBucket,
  useRemoveBucketAccountDefault,
  useRemoveBucketAssetAssignment,
  useRemoveBucketHoldingOverride,
  useUpdateBucket,
} from "@/hooks/use-buckets";
import { QueryKeys } from "@/lib/query-keys";
import type { Bucket, Holding, NewBucket } from "@/lib/types";
import { useQueries } from "@tanstack/react-query";
import { Badge } from "@wealthfolio/ui";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@wealthfolio/ui/components/ui/alert-dialog";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@wealthfolio/ui/components/ui/dialog";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@wealthfolio/ui/components/ui/select";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { useEffect, useMemo, useState } from "react";
import { SettingsHeader } from "../settings-header";

const BUCKET_COLOR_SWATCHES = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
] as const;

const INHERIT_BUCKET_VALUE = "__inherit__";
const UNASSIGNED_BUCKET_ID = "unassigned";

interface BucketDraft {
  name: string;
  color: string;
  targetPercent: string;
}

interface BucketDialogProps {
  bucket?: Bucket | null;
  defaultSortOrder: number;
  isPending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (bucket: NewBucket) => Promise<void>;
}

function BucketDialog({
  bucket,
  defaultSortOrder,
  isPending,
  open,
  onOpenChange,
  onSave,
}: BucketDialogProps) {
  const [draft, setDraft] = useState<BucketDraft>({
    name: "",
    color: BUCKET_COLOR_SWATCHES[0],
    targetPercent: "",
  });

  useEffect(() => {
    if (!open) return;

    setDraft({
      name: bucket?.name ?? "",
      color: bucket?.color ?? BUCKET_COLOR_SWATCHES[0],
      targetPercent: bucket?.targetPercent?.toString() ?? "",
    });
  }, [bucket, open]);

  const targetValue = draft.targetPercent.trim() === "" ? null : Number(draft.targetPercent);
  const isTargetValid =
    targetValue === null ||
    (Number.isFinite(targetValue) && targetValue >= 0 && targetValue <= 100);
  const canSave = draft.name.trim().length > 0 && isTargetValid;

  const handleSave = async () => {
    if (!canSave) return;

    try {
      await onSave({
        id: bucket?.id ?? null,
        name: draft.name.trim(),
        color: draft.color,
        targetPercent: targetValue,
        sortOrder: bucket?.sortOrder ?? defaultSortOrder,
        isSystem: bucket?.isSystem ?? false,
      });
    } catch (error) {
      console.error("Failed to save bucket:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bucket ? "Edit Bucket" : "New Bucket"}</DialogTitle>
          <DialogDescription>
            Define a bucket name, choose its color, and optionally set a target percentage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bucket-name">Name</Label>
            <Input
              id="bucket-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Growth"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bucket-target">Target %</Label>
            <Input
              id="bucket-target"
              inputMode="decimal"
              value={draft.targetPercent}
              onChange={(event) =>
                setDraft((current) => ({ ...current, targetPercent: event.target.value }))
              }
              placeholder="Optional"
            />
            {!isTargetValid && (
              <p className="text-destructive text-xs">Target must be between 0 and 100.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {BUCKET_COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, color }))}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                    draft.color === color ? "border-foreground scale-105" : "border-border"
                  }`}
                  aria-label={`Select color ${color}`}
                >
                  <span className="h-5 w-5 rounded-full" style={{ backgroundColor: color }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending}>
            {bucket ? "Save Changes" : "Create Bucket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AssignmentRowProps {
  controlClassName?: string;
  controlTestId?: string;
  description: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  status?: React.ReactNode;
}

function AssignmentRow({
  controlClassName,
  controlTestId,
  description,
  label,
  value,
  options,
  onValueChange,
  status,
}: AssignmentRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{label}</p>
          {status}
        </div>
        <p className="text-muted-foreground truncate text-xs">{description}</p>
      </div>
      <div
        className={controlClassName ?? "w-full sm:w-60"}
        data-testid={controlTestId}
      >
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select bucket" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function BucketsPage() {
  const { data: buckets = [], isLoading: isLoadingBuckets } = useBuckets();
  const { data: accountDefaults = [] } = useBucketAccountDefaults();
  const { data: holdingOverrides = [] } = useBucketHoldingOverrides();
  const { data: assetAssignments = [] } = useBucketAssetAssignments();
  const { accounts = [], isLoading: isLoadingAccounts } = useAccounts();
  const { data: alternativeHoldings = [], isLoading: isLoadingAssets } = useAlternativeHoldings();

  const createBucketMutation = useCreateBucket();
  const updateBucketMutation = useUpdateBucket();
  const deleteBucketMutation = useDeleteBucket();
  const assignAccountDefaultMutation = useAssignBucketAccountDefault();
  const removeAccountDefaultMutation = useRemoveBucketAccountDefault();
  const assignHoldingOverrideMutation = useAssignBucketHoldingOverride();
  const removeHoldingOverrideMutation = useRemoveBucketHoldingOverride();
  const assignAssetMutation = useAssignBucketAsset();
  const removeAssetAssignmentMutation = useRemoveBucketAssetAssignment();

  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState<Bucket | null>(null);
  const [isInvestmentOverridesOpen, setIsInvestmentOverridesOpen] = useState(false);

  const holdingQueries = useQueries({
    queries: accounts.map((account) => ({
      queryKey: [QueryKeys.HOLDINGS, account.id],
      queryFn: () => getHoldings(account.id),
      enabled: accounts.length > 0,
    })),
  });

  const sortedBuckets = useMemo(() => {
    return [...buckets].sort((left, right) => left.sortOrder - right.sortOrder);
  }, [buckets]);

  const nextSortOrder = useMemo(() => {
    if (sortedBuckets.length === 0) return 10;
    return Math.max(...sortedBuckets.map((bucket) => bucket.sortOrder)) + 10;
  }, [sortedBuckets]);

  const bucketMap = useMemo(() => {
    return new Map(sortedBuckets.map((bucket) => [bucket.id, bucket]));
  }, [sortedBuckets]);

  const accountDefaultMap = useMemo(() => {
    return new Map(accountDefaults.map((assignment) => [assignment.accountId, assignment.bucketId]));
  }, [accountDefaults]);

  const holdingOverrideMap = useMemo(() => {
    return new Map(
      holdingOverrides.map((assignment) => [
        `${assignment.accountId}:${assignment.assetId}`,
        assignment.bucketId,
      ]),
    );
  }, [holdingOverrides]);

  const assetAssignmentMap = useMemo(() => {
    return new Map(assetAssignments.map((assignment) => [assignment.assetId, assignment.bucketId]));
  }, [assetAssignments]);

  const bucketUsage = useMemo(() => {
    const usage = new Map<string, { accounts: number; holdings: number; assets: number }>();

    sortedBuckets.forEach((bucket) => {
      usage.set(bucket.id, { accounts: 0, holdings: 0, assets: 0 });
    });

    accountDefaults.forEach((assignment) => {
      const counts = usage.get(assignment.bucketId);
      if (counts) {
        counts.accounts += 1;
      }
    });
    holdingOverrides.forEach((assignment) => {
      const counts = usage.get(assignment.bucketId);
      if (counts) {
        counts.holdings += 1;
      }
    });
    assetAssignments.forEach((assignment) => {
      const counts = usage.get(assignment.bucketId);
      if (counts) {
        counts.assets += 1;
      }
    });

    return usage;
  }, [accountDefaults, assetAssignments, holdingOverrides, sortedBuckets]);

  const investmentRows = accounts
    .flatMap((account, index) => {
      const holdings: Holding[] = holdingQueries[index]?.data ?? [];

      return holdings
        .filter((holding) => {
          const assetId = holding.instrument?.id;
          return holding.holdingType?.toLowerCase() !== "cash" && !!assetId;
        })
        .map((holding) => ({
          accountId: account.id,
          accountName: account.name,
          assetId: holding.instrument?.id ?? holding.id,
          symbol: holding.instrument?.symbol ?? holding.id,
          name: holding.instrument?.name ?? null,
          marketValue: holding.marketValue?.base ?? 0,
        }));
    })
    .sort((left, right) => right.marketValue - left.marketValue);

  const selectableBuckets = useMemo(() => {
    return sortedBuckets.map((bucket) => ({
      value: bucket.id,
      label: bucket.name,
    }));
  }, [sortedBuckets]);

  const resolveBucketName = (bucketId: string | undefined) => {
    return bucketMap.get(bucketId ?? UNASSIGNED_BUCKET_ID)?.name ?? "Unassigned";
  };

  const handleSaveBucket = async (bucket: NewBucket) => {
    if (editingBucket) {
      await updateBucketMutation.mutateAsync({
        ...editingBucket,
        name: bucket.name,
        color: bucket.color,
        targetPercent: bucket.targetPercent,
        sortOrder: bucket.sortOrder,
      });
    } else {
      await createBucketMutation.mutateAsync(bucket);
    }

    setIsDialogOpen(false);
    setEditingBucket(null);
  };

  const handleAccountBucketChange = async (accountId: string, bucketId: string) => {
    if (bucketId === UNASSIGNED_BUCKET_ID) {
      await removeAccountDefaultMutation.mutateAsync(accountId);
      return;
    }

    await assignAccountDefaultMutation.mutateAsync({ accountId, bucketId });
  };

  const handleHoldingBucketChange = async (
    accountId: string,
    assetId: string,
    bucketId: string,
  ) => {
    if (bucketId === INHERIT_BUCKET_VALUE) {
      await removeHoldingOverrideMutation.mutateAsync({ accountId, assetId });
      return;
    }

    await assignHoldingOverrideMutation.mutateAsync({ accountId, assetId, bucketId });
  };

  const handleAssetBucketChange = async (assetId: string, bucketId: string) => {
    if (bucketId === UNASSIGNED_BUCKET_ID) {
      await removeAssetAssignmentMutation.mutateAsync(assetId);
      return;
    }

    await assignAssetMutation.mutateAsync({ assetId, bucketId });
  };

  const isLoading =
    isLoadingBuckets ||
    isLoadingAccounts ||
    isLoadingAssets ||
    holdingQueries.some((query) => query.isLoading);

  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Buckets"
        text="Manage bucket definitions, account defaults, and manual overrides without changing the underlying portfolio."
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Bucket Definitions</CardTitle>
            <CardDescription>
              Buckets stay independent from accounts and holdings. Disable the feature any time to
              hide labels and insights without losing the mappings.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setEditingBucket(null);
              setIsDialogOpen(true);
            }}
          >
            <Icons.Plus className="mr-2 h-4 w-4" />
            Add Bucket
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedBuckets.map((bucket) => {
            const usage = bucketUsage.get(bucket.id) ?? { accounts: 0, holdings: 0, assets: 0 };

            return (
              <div
                key={bucket.id}
                className="flex flex-col gap-3 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: bucket.color }}
                    />
                    <p className="truncate text-sm font-semibold">{bucket.name}</p>
                    {bucket.isSystem && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        System
                      </Badge>
                    )}
                    {bucket.targetPercent !== null && bucket.targetPercent !== undefined && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        Target {bucket.targetPercent}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {usage.accounts} accounts, {usage.holdings} investment overrides, {usage.assets}{" "}
                    asset assignments
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!bucket.isSystem && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingBucket(bucket);
                        setIsDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  {!bucket.isSystem && (
                    <Button variant="ghost" size="sm" onClick={() => setBucketToDelete(bucket)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-6" data-testid="bucket-assignment-sections">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account Defaults</CardTitle>
            <CardDescription>
              Assign a default bucket to each account. Holdings inherit this unless they are
              explicitly overridden below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea
              className="h-[420px] pr-3"
              data-testid="bucket-account-defaults-scroll"
            >
              <div className="space-y-3">
                {accounts.map((account) => (
                  <AssignmentRow
                    key={account.id}
                    label={account.name}
                    description={`${account.accountType} · ${account.currency}`}
                    value={accountDefaultMap.get(account.id) ?? UNASSIGNED_BUCKET_ID}
                    options={selectableBuckets}
                    onValueChange={(bucketId) => {
                      handleAccountBucketChange(account.id, bucketId).catch(console.error);
                    }}
                  />
                ))}
                {!isLoading && accounts.length === 0 && (
                  <p className="text-muted-foreground text-sm">No accounts found.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Collapsible open={isInvestmentOverridesOpen} onOpenChange={setIsInvestmentOverridesOpen}>
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-lg">Investment Overrides</CardTitle>
                <CardDescription>
                  Override individual holdings when an account mixes different bucket roles.
                  Removing an override falls back to the account default.
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="self-start">
                  {isInvestmentOverridesOpen
                    ? "Hide investment overrides"
                    : "Show investment overrides"}
                  <Icons.ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isInvestmentOverridesOpen ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <ScrollArea
                  className="h-[420px] pr-3"
                  data-testid="bucket-investment-overrides-scroll"
                >
                  <div className="space-y-3">
                    {investmentRows.map((holding) => {
                      const overrideBucketId =
                        holdingOverrideMap.get(`${holding.accountId}:${holding.assetId}`) ?? null;
                      const inheritedBucketName = resolveBucketName(
                        accountDefaultMap.get(holding.accountId),
                      );
                      const holdingBucketOptions =
                        inheritedBucketName === "Unassigned"
                          ? selectableBuckets.filter(
                              (bucket) => bucket.value !== UNASSIGNED_BUCKET_ID,
                            )
                          : selectableBuckets;

                      return (
                        <AssignmentRow
                          key={`${holding.accountId}:${holding.assetId}`}
                          controlClassName="w-full sm:w-52"
                          controlTestId="bucket-investment-override-control"
                          label={holding.symbol}
                          description={`${holding.accountName} · ${holding.name ?? "Unnamed asset"}`}
                          value={overrideBucketId ?? INHERIT_BUCKET_VALUE}
                          options={[
                            {
                              value: INHERIT_BUCKET_VALUE,
                              label: `Inherit account default (${inheritedBucketName})`,
                            },
                            ...holdingBucketOptions,
                          ]}
                          status={
                            overrideBucketId ? (
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                Override
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                Inherited
                              </Badge>
                            )
                          }
                          onValueChange={(bucketId) => {
                            handleHoldingBucketChange(
                              holding.accountId,
                              holding.assetId,
                              bucketId,
                            ).catch(console.error);
                          }}
                        />
                      );
                    })}
                    {!isLoading && investmentRows.length === 0 && (
                      <p className="text-muted-foreground text-sm">No investment holdings found.</p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Standalone Assets</CardTitle>
          <CardDescription>
            Assign buckets to assets from the Holdings &gt; Assets tab. Insurance can use the same
            mapping once it has a tracked value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[420px] pr-3" data-testid="bucket-standalone-assets-scroll">
            <div className="space-y-3">
              {alternativeHoldings
                .filter((holding) => holding.kind !== "liability")
                .sort((left, right) => Number(right.marketValue) - Number(left.marketValue))
                .map((holding) => (
                  <AssignmentRow
                    key={holding.id}
                    label={holding.name}
                    description={`${holding.kind} · ${holding.currency}`}
                    value={assetAssignmentMap.get(holding.id) ?? UNASSIGNED_BUCKET_ID}
                    options={selectableBuckets}
                    onValueChange={(bucketId) => {
                      handleAssetBucketChange(holding.id, bucketId).catch(console.error);
                    }}
                  />
                ))}
              {!isLoading && alternativeHoldings.filter((holding) => holding.kind !== "liability").length === 0 && (
                <p className="text-muted-foreground text-sm">No standalone assets found.</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Separator />

      <div className="text-muted-foreground flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm">
        <Icons.Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          v1 resolves buckets at read time. If one real-world account mixes emergency cash and
          long-term equities, the dashboard is only as accurate as the overrides you assign here.
        </p>
      </div>

      <BucketDialog
        bucket={editingBucket}
        defaultSortOrder={nextSortOrder}
        isPending={createBucketMutation.isPending || updateBucketMutation.isPending}
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingBucket(null);
          }
        }}
        onSave={handleSaveBucket}
      />

      <AlertDialog open={!!bucketToDelete} onOpenChange={(open) => !open && setBucketToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bucket?</AlertDialogTitle>
            <AlertDialogDescription>
              Accounts, holding overrides, and asset assignments mapped to this bucket will fall
              back to Unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!bucketToDelete) return;
                deleteBucketMutation.mutate(bucketToDelete.id);
                setBucketToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
