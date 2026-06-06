//! Database models for local external connectors.

use chrono::{NaiveDate, NaiveDateTime};
use diesel::prelude::*;
use panorama_core::connectors::{
    ConnectorCapability, ConnectorEnvironment, ConnectorProvider, ExternalAccountLink,
    ExternalAccountLinkStatus, ExternalAccountSyncMode, ExternalConnection,
    ExternalConnectionStatus,
};
use panorama_core::Result;
use serde::{Deserialize, Serialize};

use crate::errors::StorageError;

use super::schema::{external_account_links, external_connections};

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = external_connections)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ExternalConnectionDB {
    pub id: String,
    pub provider: String,
    pub display_name: String,
    pub environment: String,
    pub owner_name: Option<String>,
    pub status: String,
    pub capabilities_json: String,
    pub metadata_json: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = external_account_links)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ExternalAccountLinkDB {
    pub id: String,
    pub connection_id: String,
    pub provider: String,
    pub remote_account_id: String,
    pub local_account_id: String,
    pub remote_account_number_masked: Option<String>,
    pub remote_account_type: Option<String>,
    pub linked_at: NaiveDateTime,
    pub source_from_date: NaiveDate,
    pub sync_mode: String,
    pub status: String,
    pub metadata_json: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

pub fn serialize_capabilities(capabilities: &[ConnectorCapability]) -> Result<String> {
    serde_json::to_string(capabilities)
        .map_err(|e| StorageError::SerializationError(e.to_string()).into())
}

fn deserialize_capabilities(value: &str) -> Result<Vec<ConnectorCapability>> {
    serde_json::from_str(value).map_err(|e| StorageError::SerializationError(e.to_string()).into())
}

impl TryFrom<ExternalConnectionDB> for ExternalConnection {
    type Error = panorama_core::Error;

    fn try_from(db: ExternalConnectionDB) -> Result<Self> {
        Ok(Self {
            id: db.id,
            provider: ConnectorProvider::try_from(db.provider.as_str())
                .map_err(StorageError::SerializationError)?,
            display_name: db.display_name,
            environment: ConnectorEnvironment::try_from(db.environment.as_str())
                .map_err(StorageError::SerializationError)?,
            owner_name: db.owner_name,
            status: ExternalConnectionStatus::try_from(db.status.as_str())
                .map_err(StorageError::SerializationError)?,
            capabilities: deserialize_capabilities(&db.capabilities_json)?,
            metadata_json: db.metadata_json,
            created_at: db.created_at,
            updated_at: db.updated_at,
        })
    }
}

impl TryFrom<ExternalConnection> for ExternalConnectionDB {
    type Error = panorama_core::Error;

    fn try_from(connection: ExternalConnection) -> Result<Self> {
        Ok(Self {
            id: connection.id,
            provider: connection.provider.as_db_str().to_string(),
            display_name: connection.display_name,
            environment: connection.environment.as_db_str().to_string(),
            owner_name: connection.owner_name,
            status: connection.status.as_db_str().to_string(),
            capabilities_json: serialize_capabilities(&connection.capabilities)?,
            metadata_json: connection.metadata_json,
            created_at: connection.created_at,
            updated_at: connection.updated_at,
        })
    }
}

impl TryFrom<ExternalAccountLinkDB> for ExternalAccountLink {
    type Error = panorama_core::Error;

    fn try_from(db: ExternalAccountLinkDB) -> Result<Self> {
        Ok(Self {
            id: db.id,
            connection_id: db.connection_id,
            provider: ConnectorProvider::try_from(db.provider.as_str())
                .map_err(StorageError::SerializationError)?,
            remote_account_id: db.remote_account_id,
            local_account_id: db.local_account_id,
            remote_account_number_masked: db.remote_account_number_masked,
            remote_account_type: db.remote_account_type,
            linked_at: db.linked_at,
            source_from_date: db.source_from_date,
            sync_mode: ExternalAccountSyncMode::try_from(db.sync_mode.as_str())
                .map_err(StorageError::SerializationError)?,
            status: ExternalAccountLinkStatus::try_from(db.status.as_str())
                .map_err(StorageError::SerializationError)?,
            metadata_json: db.metadata_json,
            created_at: db.created_at,
            updated_at: db.updated_at,
        })
    }
}

impl TryFrom<ExternalAccountLink> for ExternalAccountLinkDB {
    type Error = panorama_core::Error;

    fn try_from(link: ExternalAccountLink) -> Result<Self> {
        Ok(Self {
            id: link.id,
            connection_id: link.connection_id,
            provider: link.provider.as_db_str().to_string(),
            remote_account_id: link.remote_account_id,
            local_account_id: link.local_account_id,
            remote_account_number_masked: link.remote_account_number_masked,
            remote_account_type: link.remote_account_type,
            linked_at: link.linked_at,
            source_from_date: link.source_from_date,
            sync_mode: link.sync_mode.as_db_str().to_string(),
            status: link.status.as_db_str().to_string(),
            metadata_json: link.metadata_json,
            created_at: link.created_at,
            updated_at: link.updated_at,
        })
    }
}
