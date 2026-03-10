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

import { invoke, logger } from "./platform";

export const getBuckets = async (): Promise<Bucket[]> => {
  try {
    return await invoke<Bucket[]>("get_buckets");
  } catch (error) {
    logger.error("Error fetching buckets.");
    throw error;
  }
};

export const createBucket = async (bucket: NewBucket): Promise<Bucket> => {
  try {
    return await invoke<Bucket>("create_bucket", { bucket });
  } catch (error) {
    logger.error("Error creating bucket.");
    throw error;
  }
};

export const updateBucket = async (bucket: Bucket): Promise<Bucket> => {
  try {
    return await invoke<Bucket>("update_bucket", { bucket });
  } catch (error) {
    logger.error("Error updating bucket.");
    throw error;
  }
};

export const deleteBucket = async (bucketId: string): Promise<void> => {
  try {
    await invoke<void>("delete_bucket", { bucketId });
  } catch (error) {
    logger.error("Error deleting bucket.");
    throw error;
  }
};

export const getBucketAccountDefaults = async (): Promise<BucketAccountDefault[]> => {
  try {
    return await invoke<BucketAccountDefault[]>("get_bucket_account_defaults");
  } catch (error) {
    logger.error("Error fetching bucket account defaults.");
    throw error;
  }
};

export const assignBucketAccountDefault = async (
  assignment: NewBucketAccountDefault,
): Promise<BucketAccountDefault> => {
  try {
    return await invoke<BucketAccountDefault>("assign_bucket_account_default", { assignment });
  } catch (error) {
    logger.error("Error assigning bucket account default.");
    throw error;
  }
};

export const removeBucketAccountDefault = async (accountId: string): Promise<void> => {
  try {
    await invoke<void>("remove_bucket_account_default", { accountId });
  } catch (error) {
    logger.error("Error removing bucket account default.");
    throw error;
  }
};

export const getBucketHoldingOverrides = async (): Promise<BucketHoldingOverride[]> => {
  try {
    return await invoke<BucketHoldingOverride[]>("get_bucket_holding_overrides");
  } catch (error) {
    logger.error("Error fetching bucket holding overrides.");
    throw error;
  }
};

export const assignBucketHoldingOverride = async (
  assignment: NewBucketHoldingOverride,
): Promise<BucketHoldingOverride> => {
  try {
    return await invoke<BucketHoldingOverride>("assign_bucket_holding_override", { assignment });
  } catch (error) {
    logger.error("Error assigning bucket holding override.");
    throw error;
  }
};

export const removeBucketHoldingOverride = async (
  accountId: string,
  assetId: string,
): Promise<void> => {
  try {
    await invoke<void>("remove_bucket_holding_override", { accountId, assetId });
  } catch (error) {
    logger.error("Error removing bucket holding override.");
    throw error;
  }
};

export const getBucketAssetAssignments = async (): Promise<BucketAssetAssignment[]> => {
  try {
    return await invoke<BucketAssetAssignment[]>("get_bucket_asset_assignments");
  } catch (error) {
    logger.error("Error fetching bucket asset assignments.");
    throw error;
  }
};

export const assignBucketAsset = async (
  assignment: NewBucketAssetAssignment,
): Promise<BucketAssetAssignment> => {
  try {
    return await invoke<BucketAssetAssignment>("assign_bucket_asset", { assignment });
  } catch (error) {
    logger.error("Error assigning bucket asset.");
    throw error;
  }
};

export const removeBucketAssetAssignment = async (assetId: string): Promise<void> => {
  try {
    await invoke<void>("remove_bucket_asset_assignment", { assetId });
  } catch (error) {
    logger.error("Error removing bucket asset assignment.");
    throw error;
  }
};

export const getBucketAllocation = async (
  accountId: string,
  baseCurrency: string,
): Promise<BucketAllocation> => {
  try {
    return await invoke<BucketAllocation>("get_bucket_allocation", { accountId, baseCurrency });
  } catch (error) {
    logger.error("Error fetching bucket allocation.");
    throw error;
  }
};
