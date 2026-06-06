use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use panorama_core::portfolio::target_allocation::{TargetAllocationPlanData, TargetAllocationView};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountDefaultRequest {
    account_id: String,
    folder_node_id: Option<String>,
}

async fn get_target_allocation(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<TargetAllocationView>> {
    let base_currency = state.base_currency.read().unwrap().clone();
    let view = state
        .target_allocation_service
        .get_target_allocation(&base_currency)
        .await?;
    Ok(Json(view))
}

async fn save_target_allocation(
    State(state): State<Arc<AppState>>,
    Json(plan): Json<TargetAllocationPlanData>,
) -> ApiResult<Json<TargetAllocationView>> {
    let base_currency = state.base_currency.read().unwrap().clone();
    let view = state
        .target_allocation_service
        .save_target_allocation(plan, &base_currency)
        .await?;
    Ok(Json(view))
}

async fn set_account_default(
    State(state): State<Arc<AppState>>,
    Json(request): Json<AccountDefaultRequest>,
) -> ApiResult<Json<TargetAllocationView>> {
    let base_currency = state.base_currency.read().unwrap().clone();
    let view = state
        .target_allocation_service
        .set_account_default(&request.account_id, request.folder_node_id, &base_currency)
        .await?;
    Ok(Json(view))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/target-allocation",
            get(get_target_allocation).post(save_target_allocation),
        )
        .route(
            "/target-allocation/account-default",
            post(set_account_default),
        )
}
