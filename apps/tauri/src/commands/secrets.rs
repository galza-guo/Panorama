use crate::{context::ServiceContext, secret_store::KeyringSecretStore};
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::secrets::SecretStore;

async fn refresh_market_data_client_if_needed(
    secret_key: &str,
    state: &State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    let quote_service = state.quote_service();
    let providers = quote_service
        .get_providers_info()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(provider) = providers.into_iter().find(|p| p.id == secret_key) {
        quote_service
            .update_provider_settings(&provider.id, provider.priority, provider.enabled)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn set_secret(
    secret_key: String,
    secret: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    KeyringSecretStore
        .set_secret(&secret_key, &secret)
        .map_err(|e| e.to_string())?;

    refresh_market_data_client_if_needed(&secret_key, &state).await
}

#[tauri::command]
pub async fn get_secret(
    secret_key: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<String>, String> {
    KeyringSecretStore
        .get_secret(&secret_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_secret(
    secret_key: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    KeyringSecretStore
        .delete_secret(&secret_key)
        .map_err(|e| e.to_string())?;

    refresh_market_data_client_if_needed(&secret_key, &state).await
}
