use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, put},
    Json, Router,
};
use serde::Deserialize;
use tracing::debug;
use wealthfolio_core::buckets::{
    Bucket, BucketAccountDefault, BucketAllocation, BucketAssetAssignment, BucketHoldingOverride,
    NewBucket, NewBucketAccountDefault, NewBucketAssetAssignment, NewBucketHoldingOverride,
};

use crate::{error::ApiResult, main_lib::AppState};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AllocationQuery {
    base_currency: Option<String>,
}

async fn get_buckets(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Bucket>>> {
    debug!("Fetching buckets...");
    Ok(Json(state.bucket_service.list_buckets()?))
}

async fn create_bucket(
    State(state): State<Arc<AppState>>,
    Json(bucket): Json<NewBucket>,
) -> ApiResult<Json<Bucket>> {
    debug!("Creating bucket {}...", bucket.name);
    Ok(Json(state.bucket_service.create_bucket(bucket).await?))
}

async fn update_bucket(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(mut bucket): Json<Bucket>,
) -> ApiResult<Json<Bucket>> {
    debug!("Updating bucket {}...", id);
    bucket.id = id;
    Ok(Json(state.bucket_service.update_bucket(bucket).await?))
}

async fn delete_bucket(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    debug!("Deleting bucket {}...", id);
    let _ = state.bucket_service.delete_bucket(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_account_defaults(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<BucketAccountDefault>>> {
    debug!("Fetching bucket account defaults...");
    Ok(Json(state.bucket_service.list_account_defaults()?))
}

async fn assign_account_default(
    State(state): State<Arc<AppState>>,
    Json(assignment): Json<NewBucketAccountDefault>,
) -> ApiResult<Json<BucketAccountDefault>> {
    debug!(
        "Assigning account {} to bucket {}...",
        assignment.account_id, assignment.bucket_id
    );
    Ok(Json(
        state.bucket_service.assign_account_default(assignment).await?,
    ))
}

async fn remove_account_default(
    Path(account_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    debug!("Removing bucket account default for {}...", account_id);
    let _ = state.bucket_service.remove_account_default(&account_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_holding_overrides(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<BucketHoldingOverride>>> {
    debug!("Fetching bucket holding overrides...");
    Ok(Json(state.bucket_service.list_holding_overrides()?))
}

async fn assign_holding_override(
    State(state): State<Arc<AppState>>,
    Json(assignment): Json<NewBucketHoldingOverride>,
) -> ApiResult<Json<BucketHoldingOverride>> {
    debug!(
        "Assigning holding {} in account {} to bucket {}...",
        assignment.asset_id, assignment.account_id, assignment.bucket_id
    );
    Ok(Json(
        state
            .bucket_service
            .assign_holding_override(assignment)
            .await?,
    ))
}

async fn remove_holding_override(
    Path((account_id, asset_id)): Path<(String, String)>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    debug!(
        "Removing bucket holding override for account {} asset {}...",
        account_id, asset_id
    );
    let _ = state
        .bucket_service
        .remove_holding_override(&account_id, &asset_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_asset_assignments(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<BucketAssetAssignment>>> {
    debug!("Fetching bucket asset assignments...");
    Ok(Json(state.bucket_service.list_asset_assignments()?))
}

async fn assign_asset(
    State(state): State<Arc<AppState>>,
    Json(assignment): Json<NewBucketAssetAssignment>,
) -> ApiResult<Json<BucketAssetAssignment>> {
    debug!(
        "Assigning standalone asset {} to bucket {}...",
        assignment.asset_id, assignment.bucket_id
    );
    Ok(Json(state.bucket_service.assign_asset(assignment).await?))
}

async fn remove_asset_assignment(
    Path(asset_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    debug!("Removing bucket asset assignment for {}...", asset_id);
    let _ = state.bucket_service.remove_asset_assignment(&asset_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_bucket_allocation(
    Path(account_id): Path<String>,
    State(state): State<Arc<AppState>>,
    Query(query): Query<AllocationQuery>,
) -> ApiResult<Json<BucketAllocation>> {
    debug!("Fetching bucket allocation for account {}...", account_id);
    let base_currency = query
        .base_currency
        .unwrap_or_else(|| state.base_currency.read().unwrap().clone());
    Ok(Json(
        state
            .bucket_service
            .get_bucket_allocation(&account_id, &base_currency)
            .await?,
    ))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/buckets", get(get_buckets).post(create_bucket))
        .route("/buckets/{id}", put(update_bucket).delete(delete_bucket))
        .route(
            "/buckets/account-defaults",
            get(get_account_defaults).put(assign_account_default),
        )
        .route(
            "/buckets/account-defaults/{accountId}",
            delete(remove_account_default),
        )
        .route(
            "/buckets/holding-overrides",
            get(get_holding_overrides).put(assign_holding_override),
        )
        .route(
            "/buckets/holding-overrides/{accountId}/{assetId}",
            delete(remove_holding_override),
        )
        .route(
            "/buckets/asset-assignments",
            get(get_asset_assignments).put(assign_asset),
        )
        .route(
            "/buckets/asset-assignments/{assetId}",
            delete(remove_asset_assignment),
        )
        .route("/buckets/allocation/{accountId}", get(get_bucket_allocation))
}
