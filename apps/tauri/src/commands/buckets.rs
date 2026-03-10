use std::sync::Arc;

use log::debug;
use tauri::State;
use wealthfolio_core::buckets::{
    Bucket, BucketAccountDefault, BucketAllocation, BucketAssetAssignment, BucketHoldingOverride,
    NewBucket, NewBucketAccountDefault, NewBucketAssetAssignment, NewBucketHoldingOverride,
};

use crate::context::ServiceContext;

#[tauri::command]
pub async fn get_buckets(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Bucket>, String> {
    debug!("Fetching buckets...");
    state
        .bucket_service()
        .list_buckets()
        .map_err(|e| format!("Failed to load buckets: {}", e))
}

#[tauri::command]
pub async fn create_bucket(
    bucket: NewBucket,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Bucket, String> {
    debug!("Creating bucket {}...", bucket.name);
    state
        .bucket_service()
        .create_bucket(bucket)
        .await
        .map_err(|e| format!("Failed to create bucket: {}", e))
}

#[tauri::command]
pub async fn update_bucket(
    bucket: Bucket,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Bucket, String> {
    debug!("Updating bucket {}...", bucket.id);
    state
        .bucket_service()
        .update_bucket(bucket)
        .await
        .map_err(|e| format!("Failed to update bucket: {}", e))
}

#[tauri::command]
pub async fn delete_bucket(
    bucket_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Deleting bucket {}...", bucket_id);
    state
        .bucket_service()
        .delete_bucket(&bucket_id)
        .await
        .map_err(|e| format!("Failed to delete bucket: {}", e))
}

#[tauri::command]
pub async fn get_bucket_account_defaults(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<BucketAccountDefault>, String> {
    debug!("Fetching bucket account defaults...");
    state
        .bucket_service()
        .list_account_defaults()
        .map_err(|e| format!("Failed to load bucket account defaults: {}", e))
}

#[tauri::command]
pub async fn assign_bucket_account_default(
    assignment: NewBucketAccountDefault,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<BucketAccountDefault, String> {
    debug!(
        "Assigning account {} to bucket {}...",
        assignment.account_id, assignment.bucket_id
    );
    state
        .bucket_service()
        .assign_account_default(assignment)
        .await
        .map_err(|e| format!("Failed to assign bucket account default: {}", e))
}

#[tauri::command]
pub async fn remove_bucket_account_default(
    account_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Removing bucket account default for {}...", account_id);
    state
        .bucket_service()
        .remove_account_default(&account_id)
        .await
        .map_err(|e| format!("Failed to remove bucket account default: {}", e))
}

#[tauri::command]
pub async fn get_bucket_holding_overrides(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<BucketHoldingOverride>, String> {
    debug!("Fetching bucket holding overrides...");
    state
        .bucket_service()
        .list_holding_overrides()
        .map_err(|e| format!("Failed to load bucket holding overrides: {}", e))
}

#[tauri::command]
pub async fn assign_bucket_holding_override(
    assignment: NewBucketHoldingOverride,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<BucketHoldingOverride, String> {
    debug!(
        "Assigning holding {} in account {} to bucket {}...",
        assignment.asset_id, assignment.account_id, assignment.bucket_id
    );
    state
        .bucket_service()
        .assign_holding_override(assignment)
        .await
        .map_err(|e| format!("Failed to assign bucket holding override: {}", e))
}

#[tauri::command]
pub async fn remove_bucket_holding_override(
    account_id: String,
    asset_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!(
        "Removing bucket holding override for account {} asset {}...",
        account_id, asset_id
    );
    state
        .bucket_service()
        .remove_holding_override(&account_id, &asset_id)
        .await
        .map_err(|e| format!("Failed to remove bucket holding override: {}", e))
}

#[tauri::command]
pub async fn get_bucket_asset_assignments(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<BucketAssetAssignment>, String> {
    debug!("Fetching bucket asset assignments...");
    state
        .bucket_service()
        .list_asset_assignments()
        .map_err(|e| format!("Failed to load bucket asset assignments: {}", e))
}

#[tauri::command]
pub async fn assign_bucket_asset(
    assignment: NewBucketAssetAssignment,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<BucketAssetAssignment, String> {
    debug!(
        "Assigning standalone asset {} to bucket {}...",
        assignment.asset_id, assignment.bucket_id
    );
    state
        .bucket_service()
        .assign_asset(assignment)
        .await
        .map_err(|e| format!("Failed to assign bucket asset: {}", e))
}

#[tauri::command]
pub async fn remove_bucket_asset_assignment(
    asset_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Removing bucket asset assignment for {}...", asset_id);
    state
        .bucket_service()
        .remove_asset_assignment(&asset_id)
        .await
        .map_err(|e| format!("Failed to remove bucket asset assignment: {}", e))
}

#[tauri::command]
pub async fn get_bucket_allocation(
    account_id: String,
    base_currency: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<BucketAllocation, String> {
    debug!("Fetching bucket allocation for account {}...", account_id);
    let currency = base_currency.unwrap_or_else(|| state.get_base_currency());
    state
        .bucket_service()
        .get_bucket_allocation(&account_id, &currency)
        .await
        .map_err(|e| format!("Failed to load bucket allocation: {}", e))
}
