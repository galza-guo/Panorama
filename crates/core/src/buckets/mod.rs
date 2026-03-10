//! Buckets module - domain models, services, and traits.

mod buckets_model;
mod buckets_service;
mod buckets_traits;

pub use buckets_model::{
    Bucket, BucketAccountDefault, BucketAllocation, BucketAllocationItem, BucketAssetAssignment,
    BucketHoldingOverride, NewBucket, NewBucketAccountDefault, NewBucketAssetAssignment,
    NewBucketHoldingOverride, UNASSIGNED_BUCKET_ID,
};
pub use buckets_service::BucketsService;
pub use buckets_traits::{BucketRepositoryTrait, BucketsServiceTrait};
