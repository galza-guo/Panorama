//! Database models for local-only folder sync metadata tables.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(table_name = crate::schema::folder_sync_config)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct FolderSyncConfigDB {
    pub id: i32,
    pub shared_folder_path: String,
    pub device_id: String,
    pub is_enabled: i32,
    pub initialized_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(event_id))]
#[diesel(table_name = crate::schema::folder_sync_imported_events)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct FolderSyncImportedEventDB {
    pub event_id: String,
    pub source_device_id: String,
    pub file_path: String,
    pub imported_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(table_name = crate::schema::folder_sync_history)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct FolderSyncHistoryEntryDB {
    pub id: i32,
    pub event_type: String,
    pub status: String,
    pub message: String,
    pub event_id: Option<String>,
    pub source_device_id: Option<String>,
    pub created_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(table_name = crate::schema::folder_sync_status)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct FolderSyncStatusDB {
    pub id: i32,
    pub sync_state: String,
    pub last_checked_at: Option<String>,
    pub last_successful_sync_at: Option<String>,
    pub last_local_export_at: Option<String>,
    pub last_remote_apply_at: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}
