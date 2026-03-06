use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};

async fn refresh_market_data_client_if_needed(
    state: &Arc<AppState>,
    secret_key: &str,
) -> ApiResult<()> {
    let providers = state.quote_service.get_providers_info().await?;

    if let Some(provider) = providers.into_iter().find(|p| p.id == secret_key) {
        state
            .quote_service
            .update_provider_settings(&provider.id, provider.priority, provider.enabled)
            .await?;
    }

    Ok(())
}

#[derive(serde::Deserialize)]
struct SecretSetBody {
    #[serde(rename = "secretKey")]
    secret_key: String,
    secret: String,
}

async fn set_secret(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SecretSetBody>,
) -> ApiResult<StatusCode> {
    state
        .secret_store
        .set_secret(&body.secret_key, &body.secret)?;
    refresh_market_data_client_if_needed(&state, &body.secret_key).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct SecretQuery {
    #[serde(rename = "secretKey")]
    secret_key: String,
}

async fn get_secret(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SecretQuery>,
) -> ApiResult<Json<Option<String>>> {
    let val = state.secret_store.get_secret(&q.secret_key)?;
    Ok(Json(val))
}

async fn delete_secret(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SecretQuery>,
) -> ApiResult<StatusCode> {
    state.secret_store.delete_secret(&q.secret_key)?;
    refresh_market_data_client_if_needed(&state, &q.secret_key).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route(
        "/secrets",
        post(set_secret).get(get_secret).delete(delete_secret),
    )
}
