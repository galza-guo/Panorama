use crate::context::ServiceContext;
use crate::secret_store::shared_secret_store;
use log::{debug, error};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

// Storage keys (without prefix - the SecretStore adds "wealthfolio_" prefix)
const SYNC_ACCESS_TOKEN_KEY: &str = "sync_access_token";
const SYNC_REFRESH_TOKEN_KEY: &str = "sync_refresh_token";

#[tauri::command]
pub async fn store_sync_session(
    refresh_token: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    match refresh_token.as_deref().map(str::trim) {
        Some(token) if !token.is_empty() => {
            if let Err(e) = shared_secret_store().set_secret(SYNC_REFRESH_TOKEN_KEY, token) {
                error!("Failed to store refresh token in secret store: {}", e);
                return Err(format!("Failed to store refresh token: {}", e));
            }
            let _ = shared_secret_store().delete_secret(SYNC_ACCESS_TOKEN_KEY);
            debug!("Refresh token stored successfully");
        }
        _ => {
            if let Err(e) = shared_secret_store().delete_secret(SYNC_REFRESH_TOKEN_KEY) {
                error!("Failed to delete refresh token from secret store: {}", e);
            }
        }
    }

    state.connect_service().clear_cached_token().await;
    Ok(())
}

#[tauri::command]
pub async fn clear_sync_session(state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    let _ = shared_secret_store().delete_secret(SYNC_ACCESS_TOKEN_KEY);
    let refresh_result = shared_secret_store().delete_secret(SYNC_REFRESH_TOKEN_KEY);

    let mut errors = Vec::new();
    if let Err(e) = refresh_result {
        error!("Failed to delete refresh token from secret store: {}", e);
        errors.push(format!("refresh_token: {}", e));
    }

    state.connect_service().clear_cached_token().await;

    if errors.is_empty() {
        debug!("Sync session cleared from secret store");
        Ok(())
    } else {
        Err(format!(
            "Failed to clear some tokens: {}",
            errors.join(", ")
        ))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSyncSessionResponse {
    pub access_token: String,
    pub refresh_token: String,
}

#[tauri::command]
pub async fn restore_sync_session(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<RestoreSyncSessionResponse, String> {
    let access_token = state.connect_service().get_valid_access_token().await?;

    let refresh_token = shared_secret_store()
        .get_secret(SYNC_REFRESH_TOKEN_KEY)
        .map_err(|e| format!("Failed to read refresh token: {}", e))?
        .ok_or_else(|| "No sync session configured".to_string())?;

    Ok(RestoreSyncSessionResponse {
        access_token,
        refresh_token,
    })
}
