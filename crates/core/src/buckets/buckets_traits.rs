use async_trait::async_trait;

use crate::errors::Result;

use super::{
    Bucket, BucketAccountDefault, BucketAllocation, BucketAssetAssignment, BucketHoldingOverride,
    NewBucket, NewBucketAccountDefault, NewBucketAssetAssignment, NewBucketHoldingOverride,
};

#[async_trait]
pub trait BucketRepositoryTrait: Send + Sync {
    fn list_buckets(&self) -> Result<Vec<Bucket>>;
    fn get_bucket(&self, id: &str) -> Result<Option<Bucket>>;
    async fn create_bucket(&self, bucket: NewBucket) -> Result<Bucket>;
    async fn update_bucket(&self, bucket: Bucket) -> Result<Bucket>;
    async fn delete_bucket(&self, id: &str) -> Result<usize>;

    fn list_account_defaults(&self) -> Result<Vec<BucketAccountDefault>>;
    async fn upsert_account_default(
        &self,
        assignment: NewBucketAccountDefault,
    ) -> Result<BucketAccountDefault>;
    async fn delete_account_default(&self, account_id: &str) -> Result<usize>;

    fn list_holding_overrides(&self) -> Result<Vec<BucketHoldingOverride>>;
    async fn upsert_holding_override(
        &self,
        assignment: NewBucketHoldingOverride,
    ) -> Result<BucketHoldingOverride>;
    async fn delete_holding_override(&self, account_id: &str, asset_id: &str) -> Result<usize>;

    fn list_asset_assignments(&self) -> Result<Vec<BucketAssetAssignment>>;
    async fn upsert_asset_assignment(
        &self,
        assignment: NewBucketAssetAssignment,
    ) -> Result<BucketAssetAssignment>;
    async fn delete_asset_assignment(&self, asset_id: &str) -> Result<usize>;
}

#[async_trait]
pub trait BucketsServiceTrait: Send + Sync {
    fn list_buckets(&self) -> Result<Vec<Bucket>>;
    fn get_bucket(&self, id: &str) -> Result<Option<Bucket>>;
    async fn create_bucket(&self, bucket: NewBucket) -> Result<Bucket>;
    async fn update_bucket(&self, bucket: Bucket) -> Result<Bucket>;
    async fn delete_bucket(&self, id: &str) -> Result<usize>;

    fn list_account_defaults(&self) -> Result<Vec<BucketAccountDefault>>;
    async fn assign_account_default(
        &self,
        assignment: NewBucketAccountDefault,
    ) -> Result<BucketAccountDefault>;
    async fn remove_account_default(&self, account_id: &str) -> Result<usize>;

    fn list_holding_overrides(&self) -> Result<Vec<BucketHoldingOverride>>;
    async fn assign_holding_override(
        &self,
        assignment: NewBucketHoldingOverride,
    ) -> Result<BucketHoldingOverride>;
    async fn remove_holding_override(&self, account_id: &str, asset_id: &str) -> Result<usize>;

    fn list_asset_assignments(&self) -> Result<Vec<BucketAssetAssignment>>;
    async fn assign_asset(
        &self,
        assignment: NewBucketAssetAssignment,
    ) -> Result<BucketAssetAssignment>;
    async fn remove_asset_assignment(&self, asset_id: &str) -> Result<usize>;

    async fn get_bucket_allocation(
        &self,
        account_id: &str,
        base_currency: &str,
    ) -> Result<BucketAllocation>;
}
