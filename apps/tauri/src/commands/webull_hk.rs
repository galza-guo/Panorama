//! Tauri commands for local Webull HK connections.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use panorama_core::{
    accounts::TrackingMode,
    assets::AssetSpec,
    connectors::{
        ConnectorCapability, ConnectorEnvironment, ConnectorProvider, ExternalAccountLink,
        ExternalAccountLinkRepositoryTrait, ExternalAccountLinkStatus, ExternalAccountSyncMode,
        ExternalConnection, ExternalConnectionRepositoryTrait, ExternalConnectionStatus,
        NewExternalAccountLink, NewExternalConnection,
    },
    portfolio::snapshot::{AccountStateSnapshot, Position, SnapshotSource},
    utils::time_utils::valuation_date_today,
};
use panorama_local_connectors::webull_hk::{
    client::{WebullHkClient, WebullHkEnvironment},
    sync::{map_account_list, map_account_snapshot, WebullHkAccountSnapshot},
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::{context::ServiceContext, secret_store::shared_secret_store};

pub const WEBULL_HK_APP_KEY_SECRET: &str = "app_key";
pub const WEBULL_HK_APP_SECRET_SECRET: &str = "app_secret";
pub const WEBULL_HK_ACCESS_TOKEN_SECRET: &str = "access_token";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWebullHkConnectionRequest {
    pub display_name: String,
    #[serde(default)]
    pub environment: ConnectorEnvironment,
    pub owner_name: Option<String>,
    pub app_key: String,
    pub app_secret: String,
    pub access_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkWebullHkAccountRequest {
    pub connection_id: String,
    pub remote_account_id: String,
    pub local_account_id: String,
    pub remote_account_number_masked: Option<String>,
    pub remote_account_type: Option<String>,
    pub source_from_date: chrono::NaiveDate,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebullHkRemoteAccountDto {
    pub remote_account_id: String,
    pub account_number_masked: Option<String>,
    pub account_type: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebullHkSnapshotSyncResult {
    pub link_id: String,
    pub local_account_id: String,
    pub remote_account_id: String,
    pub snapshot_date: chrono::NaiveDate,
    pub positions: usize,
    pub cash_balances: usize,
    pub assets_created: usize,
}

#[tauri::command]
pub async fn create_webull_hk_connection(
    context: State<'_, Arc<ServiceContext>>,
    request: CreateWebullHkConnectionRequest,
) -> Result<ExternalConnection, String> {
    validate_create_connection_request(&request)?;

    let connection_id = Uuid::new_v4().to_string();
    store_webull_hk_secret(
        &connection_id,
        WEBULL_HK_APP_KEY_SECRET,
        request.app_key.trim(),
    )?;
    store_webull_hk_secret(
        &connection_id,
        WEBULL_HK_APP_SECRET_SECRET,
        request.app_secret.trim(),
    )?;
    if let Some(access_token) = request
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|token| !token.is_empty())
    {
        store_webull_hk_secret(&connection_id, WEBULL_HK_ACCESS_TOKEN_SECRET, access_token)?;
    }

    let status = if request
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .is_some()
    {
        ExternalConnectionStatus::Active
    } else {
        ExternalConnectionStatus::NeedsAuth
    };

    let new_connection = NewExternalConnection {
        id: Some(connection_id.clone()),
        provider: ConnectorProvider::WebullHk,
        display_name: request.display_name.trim().to_string(),
        environment: request.environment,
        owner_name: request
            .owner_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        status,
        capabilities: vec![
            ConnectorCapability::PortfolioSnapshotSync,
            ConnectorCapability::OrderHistoryImport,
        ],
        metadata_json: None,
    };

    context
        .connector_repository()
        .create_connection(new_connection)
        .await
        .map_err(|error| {
            let _ = delete_webull_hk_secrets(&connection_id);
            error.to_string()
        })
}

#[tauri::command]
pub async fn list_webull_hk_connections(
    context: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ExternalConnection>, String> {
    context
        .connector_repository()
        .list_connections()
        .map(|connections| {
            connections
                .into_iter()
                .filter(|connection| connection.provider == ConnectorProvider::WebullHk)
                .collect()
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_webull_hk_connection(
    context: State<'_, Arc<ServiceContext>>,
    connection_id: String,
) -> Result<(), String> {
    validate_required_secret("connection_id", &connection_id)?;
    context
        .connector_repository()
        .delete_connection(connection_id.trim())
        .await
        .map_err(|error| error.to_string())?;
    delete_webull_hk_secrets(connection_id.trim())
}

#[tauri::command]
pub async fn list_webull_hk_remote_accounts(
    context: State<'_, Arc<ServiceContext>>,
    connection_id: String,
) -> Result<Vec<WebullHkRemoteAccountDto>, String> {
    let connection = get_webull_hk_connection(context.inner(), &connection_id)?;
    let client = build_webull_hk_client(&connection)?;
    let response = client
        .get_account_list()
        .await
        .map_err(|error| error.to_string())?;

    Ok(map_account_list(response)
        .into_iter()
        .map(|account| WebullHkRemoteAccountDto {
            remote_account_id: account.remote_account_id,
            account_number_masked: account.account_number_masked,
            account_type: account.account_type,
            user_id: account.user_id,
        })
        .collect())
}

#[tauri::command]
pub async fn link_webull_hk_account(
    context: State<'_, Arc<ServiceContext>>,
    request: LinkWebullHkAccountRequest,
) -> Result<ExternalAccountLink, String> {
    validate_required_secret("connection_id", &request.connection_id)?;
    validate_required_secret("remote_account_id", &request.remote_account_id)?;
    validate_required_secret("local_account_id", &request.local_account_id)?;
    get_webull_hk_connection(context.inner(), &request.connection_id)?;

    let local_account = context
        .account_service()
        .get_account(request.local_account_id.trim())
        .map_err(|error| error.to_string())?;
    let should_update_account = local_account.tracking_mode != TrackingMode::Holdings
        || local_account.provider.as_deref() != Some("WEBULL_HK")
        || local_account.provider_account_id.as_deref() != Some(request.remote_account_id.trim());
    if should_update_account {
        let mut update = panorama_core::accounts::AccountUpdate {
            id: Some(local_account.id.clone()),
            name: local_account.name,
            account_type: local_account.account_type,
            group: local_account.group,
            is_default: local_account.is_default,
            is_active: local_account.is_active,
            platform_id: local_account.platform_id,
            account_number: local_account.account_number,
            meta: local_account.meta,
            provider: local_account.provider,
            provider_account_id: local_account.provider_account_id,
            is_archived: Some(local_account.is_archived),
            tracking_mode: Some(TrackingMode::Holdings),
            account_owner: local_account.account_owner,
        };
        update.provider = Some("WEBULL_HK".to_string());
        update.provider_account_id = Some(request.remote_account_id.trim().to_string());
        context
            .account_service()
            .update_account(update)
            .await
            .map_err(|error| error.to_string())?;
    }

    let link = NewExternalAccountLink {
        id: None,
        connection_id: request.connection_id.trim().to_string(),
        provider: ConnectorProvider::WebullHk,
        remote_account_id: request.remote_account_id.trim().to_string(),
        local_account_id: request.local_account_id.trim().to_string(),
        remote_account_number_masked: normalize_optional_string(
            request.remote_account_number_masked.as_deref(),
        ),
        remote_account_type: normalize_optional_string(request.remote_account_type.as_deref()),
        source_from_date: request.source_from_date,
        sync_mode: ExternalAccountSyncMode::Prospective,
        status: ExternalAccountLinkStatus::Active,
        metadata_json: None,
    };

    context
        .connector_repository()
        .create_account_link(link)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_webull_hk_account_links(
    context: State<'_, Arc<ServiceContext>>,
    connection_id: String,
) -> Result<Vec<ExternalAccountLink>, String> {
    validate_required_secret("connection_id", &connection_id)?;
    context
        .connector_repository()
        .list_account_links_for_connection(connection_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn sync_webull_hk_account_snapshot(
    context: State<'_, Arc<ServiceContext>>,
    link_id: String,
) -> Result<WebullHkSnapshotSyncResult, String> {
    validate_required_secret("link_id", &link_id)?;
    let link = context
        .connector_repository()
        .get_account_link(link_id.trim())
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Webull HK account link not found".to_string())?;
    let connection = get_webull_hk_connection(context.inner(), &link.connection_id)?;
    let account = context
        .account_service()
        .get_account(&link.local_account_id)
        .map_err(|error| error.to_string())?;
    let snapshot_date = valuation_date_today();

    if snapshot_date < link.source_from_date {
        return Err(format!(
            "Webull HK sync starts on {}; today is {}",
            link.source_from_date, snapshot_date
        ));
    }

    let client = build_webull_hk_client(&connection)?;
    let balance = client
        .get_account_balance(&link.remote_account_id, Some(&account.currency))
        .await
        .map_err(|error| error.to_string())?;
    let positions = client
        .get_account_positions(&link.remote_account_id)
        .await
        .map_err(|error| error.to_string())?;
    let mapped_snapshot =
        map_account_snapshot(balance, positions).map_err(|error| error.to_string())?;
    let assets_created =
        save_mapped_snapshot(context.inner(), &account, snapshot_date, mapped_snapshot)
            .await
            .map_err(|error| error.to_string())?;

    Ok(WebullHkSnapshotSyncResult {
        link_id: link.id,
        local_account_id: account.id,
        remote_account_id: link.remote_account_id,
        snapshot_date,
        positions: assets_created.positions,
        cash_balances: assets_created.cash_balances,
        assets_created: assets_created.assets_created,
    })
}

struct SaveSnapshotStats {
    positions: usize,
    cash_balances: usize,
    assets_created: usize,
}

async fn save_mapped_snapshot(
    context: &Arc<ServiceContext>,
    account: &panorama_core::accounts::Account,
    snapshot_date: chrono::NaiveDate,
    mapped_snapshot: WebullHkAccountSnapshot,
) -> panorama_core::Result<SaveSnapshotStats> {
    let asset_specs = mapped_snapshot
        .positions
        .iter()
        .map(|position| position.asset_spec.clone())
        .collect::<Vec<AssetSpec>>();
    let ensure_result = context
        .asset_service()
        .ensure_assets(asset_specs, context.activity_repository().as_ref())
        .await?;
    let mut key_to_asset_id = HashMap::new();
    for (asset_id, asset) in &ensure_result.assets {
        key_to_asset_id.insert(asset_id.clone(), asset_id.clone());
        if let Some(instrument_key) = &asset.instrument_key {
            key_to_asset_id.insert(instrument_key.clone(), asset_id.clone());
        }
    }

    let now = Utc::now();
    let mut positions = HashMap::new();
    let mut cost_basis = Decimal::ZERO;
    for mapped_position in mapped_snapshot.positions {
        let spec_key = mapped_position
            .asset_spec
            .instrument_key()
            .unwrap_or_else(|| mapped_position.symbol.clone());
        let asset_id = key_to_asset_id
            .get(&spec_key)
            .cloned()
            .ok_or_else(|| panorama_core::Error::Asset(format!("Asset {spec_key} not found")))?;
        cost_basis += convert_amount_for_snapshot(
            context,
            mapped_position.total_cost_basis,
            &mapped_position.currency,
            &account.currency,
            snapshot_date,
        )
        .await?;

        positions.insert(
            asset_id.clone(),
            Position {
                id: format!("POS-{}-{}", asset_id, account.id),
                account_id: account.id.clone(),
                asset_id,
                quantity: mapped_position.quantity,
                average_cost: mapped_position.average_cost,
                total_cost_basis: mapped_position.total_cost_basis,
                currency: mapped_position.currency,
                inception_date: now,
                lots: std::collections::VecDeque::new(),
                created_at: now,
                last_updated: now,
                is_alternative: false,
            },
        );
    }

    let mut cash_balances = HashMap::new();
    let mut cash_total_account_currency = Decimal::ZERO;
    for cash in mapped_snapshot.cash_balances {
        cash_total_account_currency += convert_amount_for_snapshot(
            context,
            cash.amount,
            &cash.currency,
            &account.currency,
            snapshot_date,
        )
        .await?;
        cash_balances.insert(cash.currency, cash.amount);
    }

    let stats = SaveSnapshotStats {
        positions: positions.len(),
        cash_balances: cash_balances.len(),
        assets_created: ensure_result.created_ids.len(),
    };

    let snapshot = AccountStateSnapshot {
        id: AccountStateSnapshot::stable_id(&account.id, snapshot_date),
        account_id: account.id.clone(),
        snapshot_date,
        currency: account.currency.clone(),
        positions,
        cash_balances,
        cost_basis,
        net_contribution: Decimal::ZERO,
        net_contribution_base: Decimal::ZERO,
        cash_total_account_currency,
        cash_total_base_currency: Decimal::ZERO,
        calculated_at: now.naive_utc(),
        source: SnapshotSource::BrokerImported,
    };

    context
        .snapshot_service()
        .save_manual_snapshot(&account.id, snapshot)
        .await?;

    Ok(stats)
}

async fn convert_amount_for_snapshot(
    context: &Arc<ServiceContext>,
    amount: Decimal,
    from_currency: &str,
    to_currency: &str,
    date: chrono::NaiveDate,
) -> panorama_core::Result<Decimal> {
    if from_currency == to_currency {
        return Ok(amount);
    }
    context
        .fx_service()
        .register_currency_pair(from_currency, to_currency)
        .await?;
    match context
        .fx_service()
        .convert_currency_for_date(amount, from_currency, to_currency, date)
    {
        Ok(converted) => Ok(converted),
        Err(error) => {
            log::warn!(
                "Webull HK snapshot FX conversion failed for {} {} -> {} on {}: {}",
                amount,
                from_currency,
                to_currency,
                date,
                error
            );
            Ok(amount)
        }
    }
}

fn validate_create_connection_request(
    request: &CreateWebullHkConnectionRequest,
) -> Result<(), String> {
    validate_required_secret("display_name", &request.display_name)?;
    validate_required_secret(WEBULL_HK_APP_KEY_SECRET, &request.app_key)?;
    validate_required_secret(WEBULL_HK_APP_SECRET_SECRET, &request.app_secret)
}

pub fn validate_required_secret(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
    }
}

pub fn webull_hk_secret_key(connection_id: &str, secret_name: &str) -> String {
    format!(
        "connector:webull_hk:{}:{}",
        connection_id.trim(),
        secret_name.trim()
    )
}

fn store_webull_hk_secret(
    connection_id: &str,
    secret_name: &str,
    value: &str,
) -> Result<(), String> {
    shared_secret_store()
        .set_secret(&webull_hk_secret_key(connection_id, secret_name), value)
        .map_err(|error| error.to_string())
}

fn read_webull_hk_secret(connection_id: &str, secret_name: &str) -> Result<Option<String>, String> {
    shared_secret_store()
        .get_secret(&webull_hk_secret_key(connection_id, secret_name))
        .map_err(|error| error.to_string())
}

fn delete_webull_hk_secrets(connection_id: &str) -> Result<(), String> {
    for secret_name in [
        WEBULL_HK_APP_KEY_SECRET,
        WEBULL_HK_APP_SECRET_SECRET,
        WEBULL_HK_ACCESS_TOKEN_SECRET,
    ] {
        shared_secret_store()
            .delete_secret(&webull_hk_secret_key(connection_id, secret_name))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn build_webull_hk_client(connection: &ExternalConnection) -> Result<WebullHkClient, String> {
    let app_key = read_webull_hk_secret(&connection.id, WEBULL_HK_APP_KEY_SECRET)?
        .ok_or_else(|| "Webull HK App Key is missing".to_string())?;
    let app_secret = read_webull_hk_secret(&connection.id, WEBULL_HK_APP_SECRET_SECRET)?
        .ok_or_else(|| "Webull HK App Secret is missing".to_string())?;
    let access_token = read_webull_hk_secret(&connection.id, WEBULL_HK_ACCESS_TOKEN_SECRET)?;
    let environment = match connection.environment {
        ConnectorEnvironment::Sandbox => WebullHkEnvironment::Sandbox,
        ConnectorEnvironment::Production => WebullHkEnvironment::Production,
    };

    WebullHkClient::new(environment, app_key, app_secret, access_token)
        .map_err(|error| error.to_string())
}

fn get_webull_hk_connection(
    context: &Arc<ServiceContext>,
    connection_id: &str,
) -> Result<ExternalConnection, String> {
    let connection = context
        .connector_repository()
        .get_connection(connection_id.trim())
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Webull HK connection not found".to_string())?;

    if connection.provider != ConnectorProvider::WebullHk {
        return Err("Connection is not a Webull HK connection".to_string());
    }

    Ok(connection)
}

fn normalize_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::{
        validate_required_secret, webull_hk_secret_key, WEBULL_HK_ACCESS_TOKEN_SECRET,
        WEBULL_HK_APP_KEY_SECRET, WEBULL_HK_APP_SECRET_SECRET,
    };

    #[test]
    fn webull_hk_secret_keys_are_namespaced_by_connection_id() {
        assert_eq!(
            webull_hk_secret_key("conn-1", WEBULL_HK_APP_KEY_SECRET),
            "connector:webull_hk:conn-1:app_key"
        );
        assert_eq!(
            webull_hk_secret_key("conn-1", WEBULL_HK_APP_SECRET_SECRET),
            "connector:webull_hk:conn-1:app_secret"
        );
        assert_eq!(
            webull_hk_secret_key("conn-1", WEBULL_HK_ACCESS_TOKEN_SECRET),
            "connector:webull_hk:conn-1:access_token"
        );
    }

    #[test]
    fn validate_required_secret_rejects_blank_values() {
        assert!(validate_required_secret("app_key", "abc").is_ok());
        assert!(validate_required_secret("app_key", " ").is_err());
    }
}
