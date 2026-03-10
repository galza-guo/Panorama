import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignBucketAccountDefault,
  assignBucketAsset,
  assignBucketHoldingOverride,
  createBucket,
  deleteBucket,
  getBucketAccountDefaults,
  getBucketAllocation,
  getBucketAssetAssignments,
  getBucketHoldingOverrides,
  getBuckets,
  removeBucketAccountDefault,
  removeBucketAssetAssignment,
  removeBucketHoldingOverride,
  updateBucket,
} from "@/adapters";
import { useSettingsContext } from "@/lib/settings-provider";
import { QueryKeys } from "@/lib/query-keys";
import type {
  Bucket,
  BucketAccountDefault,
  BucketAllocation,
  BucketAssetAssignment,
  BucketHoldingOverride,
  NewBucket,
  NewBucketAccountDefault,
  NewBucketAssetAssignment,
  NewBucketHoldingOverride,
} from "@/lib/types";
import { useMemo } from "react";

const UNASSIGNED_BUCKET_ID = "unassigned";

async function invalidateBucketQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [QueryKeys.BUCKETS] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.BUCKET_ACCOUNT_DEFAULTS] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.BUCKET_HOLDING_OVERRIDES] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.BUCKET_ASSET_ASSIGNMENTS] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.BUCKET_ALLOCATION] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_HOLDINGS] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ALTERNATIVE_HOLDINGS] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] }),
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS_SUMMARY] }),
  ]);
}

function useBucketsEnabled() {
  const { settings } = useSettingsContext();
  return settings?.bucketsEnabled ?? false;
}

export function useBuckets() {
  const enabled = useBucketsEnabled();

  return useQuery<Bucket[], Error>({
    queryKey: [QueryKeys.BUCKETS],
    queryFn: getBuckets,
    enabled,
  });
}

export function useBucketAccountDefaults() {
  const enabled = useBucketsEnabled();

  return useQuery<BucketAccountDefault[], Error>({
    queryKey: [QueryKeys.BUCKET_ACCOUNT_DEFAULTS],
    queryFn: getBucketAccountDefaults,
    enabled,
  });
}

export function useBucketHoldingOverrides() {
  const enabled = useBucketsEnabled();

  return useQuery<BucketHoldingOverride[], Error>({
    queryKey: [QueryKeys.BUCKET_HOLDING_OVERRIDES],
    queryFn: getBucketHoldingOverrides,
    enabled,
  });
}

export function useBucketAssetAssignments() {
  const enabled = useBucketsEnabled();

  return useQuery<BucketAssetAssignment[], Error>({
    queryKey: [QueryKeys.BUCKET_ASSET_ASSIGNMENTS],
    queryFn: getBucketAssetAssignments,
    enabled,
  });
}

export function useBucketAllocation(accountId: string | null, baseCurrency: string | null) {
  const enabled = useBucketsEnabled();

  return useQuery<BucketAllocation, Error>({
    queryKey: QueryKeys.bucketAllocation(accountId ?? "", baseCurrency ?? ""),
    queryFn: () => getBucketAllocation(accountId ?? "", baseCurrency ?? "USD"),
    enabled: enabled && !!accountId && !!baseCurrency,
  });
}

export function useCreateBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucket: NewBucket) => createBucket(bucket),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useUpdateBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucket: Bucket) => updateBucket(bucket),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useDeleteBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucketId: string) => deleteBucket(bucketId),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useAssignBucketAccountDefault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignment: NewBucketAccountDefault) => assignBucketAccountDefault(assignment),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useRemoveBucketAccountDefault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => removeBucketAccountDefault(accountId),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useAssignBucketHoldingOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignment: NewBucketHoldingOverride) => assignBucketHoldingOverride(assignment),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useRemoveBucketHoldingOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, assetId }: { accountId: string; assetId: string }) =>
      removeBucketHoldingOverride(accountId, assetId),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useAssignBucketAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignment: NewBucketAssetAssignment) => assignBucketAsset(assignment),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useRemoveBucketAssetAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetId: string) => removeBucketAssetAssignment(assetId),
    onSuccess: async () => {
      await invalidateBucketQueries(queryClient);
    },
  });
}

export function useBucketResolution() {
  const enabled = useBucketsEnabled();
  const { data: buckets = [], isLoading: isLoadingBuckets } = useBuckets();
  const { data: accountDefaults = [], isLoading: isLoadingAccountDefaults } =
    useBucketAccountDefaults();
  const { data: holdingOverrides = [], isLoading: isLoadingHoldingOverrides } =
    useBucketHoldingOverrides();
  const { data: assetAssignments = [], isLoading: isLoadingAssetAssignments } =
    useBucketAssetAssignments();

  const bucketMap = useMemo(() => {
    return new Map(buckets.map((bucket) => [bucket.id, bucket]));
  }, [buckets]);

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

  const unassignedBucket = bucketMap.get(UNASSIGNED_BUCKET_ID) ?? null;

  const resolveBucketById = (bucketId: string | null | undefined) => {
    if (!enabled) return null;
    return (bucketId ? bucketMap.get(bucketId) : null) ?? unassignedBucket;
  };

  const resolveAccountBucket = (accountId: string | null | undefined) => {
    if (!accountId) return resolveBucketById(null);
    return resolveBucketById(accountDefaultMap.get(accountId));
  };

  const resolveHoldingBucket = (accountId: string | null | undefined, assetId: string | null) => {
    if (!accountId || !assetId) return resolveBucketById(null);
    return resolveBucketById(
      holdingOverrideMap.get(`${accountId}:${assetId}`) ?? accountDefaultMap.get(accountId),
    );
  };

  const resolveAssetBucket = (assetId: string | null | undefined) => {
    if (!assetId) return resolveBucketById(null);
    return resolveBucketById(assetAssignmentMap.get(assetId));
  };

  return {
    isEnabled: enabled,
    isLoading:
      enabled &&
      (isLoadingBuckets ||
        isLoadingAccountDefaults ||
        isLoadingHoldingOverrides ||
        isLoadingAssetAssignments),
    buckets,
    resolveBucketById,
    resolveAccountBucket,
    resolveHoldingBucket,
    resolveAssetBucket,
  };
}
