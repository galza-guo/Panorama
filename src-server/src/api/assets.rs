use std::sync::Arc;

use crate::{
    api::shared::{enqueue_portfolio_job, PortfolioJobConfig},
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, put},
    Json, Router,
};
use wealthfolio_core::assets::{Asset as CoreAsset, UpdateAssetProfile};

#[derive(serde::Deserialize)]
struct AssetQuery {
    #[serde(rename = "assetId")]
    asset_id: String,
}

async fn get_asset_profile(
    State(state): State<Arc<AppState>>,
    Query(q): Query<AssetQuery>,
) -> ApiResult<Json<CoreAsset>> {
    let asset = state.asset_service.get_asset_by_id(&q.asset_id)?;
    Ok(Json(asset))
}

#[derive(serde::Deserialize)]
struct AssetListQuery {
    owner: Option<String>,
}

async fn list_assets(
    State(state): State<Arc<AppState>>,
    Query(q): Query<AssetListQuery>,
) -> ApiResult<Json<Vec<CoreAsset>>> {
    let owner = q.owner.as_deref().map(str::trim).filter(|owner| !owner.is_empty());
    let assets = state.asset_service.get_assets_by_owner(owner)?;
    Ok(Json(assets))
}

async fn update_asset_profile(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateAssetProfile>,
) -> ApiResult<Json<CoreAsset>> {
    let asset = state
        .asset_service
        .update_asset_profile(&id, payload)
        .await?;
    Ok(Json(asset))
}

#[derive(serde::Deserialize)]
struct DataSourceBody {
    #[serde(rename = "dataSource")]
    data_source: String,
}

async fn update_asset_data_source(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(body): Json<DataSourceBody>,
) -> ApiResult<Json<CoreAsset>> {
    let asset = state
        .asset_service
        .update_asset_data_source(&id, body.data_source)
        .await?;
    enqueue_portfolio_job(
        state.clone(),
        PortfolioJobConfig {
            account_ids: None,
            symbols: Some(vec![id]),
            refetch_all_market_data: true,
            force_full_recalculation: true,
        },
    );
    Ok(Json(asset))
}

async fn delete_asset(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    state.asset_service.delete_asset(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/assets", get(list_assets))
        .route("/assets/{id}", delete(delete_asset))
        .route("/assets/profile", get(get_asset_profile))
        .route("/assets/profile/{id}", put(update_asset_profile))
        .route("/assets/data-source/{id}", put(update_asset_data_source))
}
