//! Repository for local-only folder sync metadata tables.

use std::sync::Arc;

use chrono::Utc;
use diesel::dsl::count_star;
use diesel::prelude::*;

use super::model::{FolderSyncConfigDB, FolderSyncHistoryEntryDB, FolderSyncStatusDB};
use crate::db::{get_connection, DbPool, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{
    folder_sync_config, folder_sync_history, folder_sync_imported_events, folder_sync_status,
};
use wealthfolio_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSyncConfigRecord {
    pub shared_folder_path: String,
    pub device_id: String,
    pub is_enabled: bool,
    pub initialized_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSyncHistoryEntryRecord {
    pub id: i32,
    pub event_type: String,
    pub status: String,
    pub message: String,
    pub event_id: Option<String>,
    pub source_device_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSyncStatusRecord {
    pub sync_state: String,
    pub last_checked_at: Option<String>,
    pub last_successful_sync_at: Option<String>,
    pub last_local_export_at: Option<String>,
    pub last_remote_apply_at: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FolderSyncStatusUpdate {
    pub sync_state: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_successful_sync_at: Option<String>,
    pub last_local_export_at: Option<String>,
    pub last_remote_apply_at: Option<String>,
    pub last_error: Option<Option<String>>,
    pub updated_at: Option<String>,
}

pub struct FolderSyncRepository {
    pool: Arc<DbPool>,
    writer: WriteHandle,
}

impl FolderSyncRepository {
    pub fn new(pool: Arc<DbPool>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }

    pub fn get_config(&self) -> Result<Option<FolderSyncConfigRecord>> {
        let mut conn = get_connection(&self.pool)?;
        let row = folder_sync_config::table
            .find(1)
            .select(FolderSyncConfigDB::as_select())
            .first::<FolderSyncConfigDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;
        Ok(row.map(to_config_record))
    }

    pub async fn upsert_config(
        &self,
        _shared_folder_path: String,
        _device_id: String,
        _is_enabled: bool,
        _initialized_at: Option<String>,
        _timestamp: String,
    ) -> Result<()> {
        let created_at = self
            .get_config()?
            .map(|config| config.created_at)
            .unwrap_or_else(|| _timestamp.clone());

        self.writer
            .exec(move |conn| {
                diesel::replace_into(folder_sync_config::table)
                    .values((
                        folder_sync_config::id.eq(1),
                        folder_sync_config::shared_folder_path.eq(_shared_folder_path),
                        folder_sync_config::device_id.eq(_device_id),
                        folder_sync_config::is_enabled.eq(i32::from(_is_enabled)),
                        folder_sync_config::initialized_at.eq(_initialized_at),
                        folder_sync_config::created_at.eq(created_at),
                        folder_sync_config::updated_at.eq(_timestamp),
                    ))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }

    pub fn is_event_imported(&self, event_id_value: &str) -> Result<bool> {
        let mut conn = get_connection(&self.pool)?;
        let count = folder_sync_imported_events::table
            .filter(folder_sync_imported_events::event_id.eq(event_id_value))
            .select(count_star())
            .first::<i64>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(count > 0)
    }

    pub async fn mark_event_imported(
        &self,
        _event_id: String,
        _source_device_id: String,
        _file_path: String,
        _imported_at: String,
    ) -> Result<bool> {
        self.writer
            .exec(move |conn| {
                let inserted = diesel::insert_into(folder_sync_imported_events::table)
                    .values((
                        folder_sync_imported_events::event_id.eq(_event_id),
                        folder_sync_imported_events::source_device_id.eq(_source_device_id),
                        folder_sync_imported_events::file_path.eq(_file_path),
                        folder_sync_imported_events::imported_at.eq(_imported_at),
                    ))
                    .on_conflict_do_nothing()
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(inserted > 0)
            })
            .await
    }

    pub async fn append_history(
        &self,
        _event_type: String,
        _status: String,
        _message: String,
        _event_id: Option<String>,
        _source_device_id: Option<String>,
        _created_at: String,
    ) -> Result<()> {
        self.writer
            .exec(move |conn| {
                diesel::insert_into(folder_sync_history::table)
                    .values((
                        folder_sync_history::event_type.eq(_event_type),
                        folder_sync_history::status.eq(_status),
                        folder_sync_history::message.eq(_message),
                        folder_sync_history::event_id.eq(_event_id),
                        folder_sync_history::source_device_id.eq(_source_device_id),
                        folder_sync_history::created_at.eq(_created_at),
                    ))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }

    pub fn list_recent_history(
        &self,
        limit_value: i64,
    ) -> Result<Vec<FolderSyncHistoryEntryRecord>> {
        let mut conn = get_connection(&self.pool)?;
        let rows = folder_sync_history::table
            .select(FolderSyncHistoryEntryDB::as_select())
            .order_by(folder_sync_history::created_at.desc())
            .then_order_by(folder_sync_history::id.desc())
            .limit(limit_value)
            .load::<FolderSyncHistoryEntryDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(rows.into_iter().map(to_history_record).collect())
    }

    pub fn get_status(&self) -> Result<FolderSyncStatusRecord> {
        let mut conn = get_connection(&self.pool)?;
        let row = folder_sync_status::table
            .find(1)
            .select(FolderSyncStatusDB::as_select())
            .first::<FolderSyncStatusDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;
        Ok(row
            .map(to_status_record)
            .unwrap_or_else(default_status_record))
    }

    pub async fn update_status(&self, update: FolderSyncStatusUpdate) -> Result<()> {
        let current = self.get_status()?;
        let next = FolderSyncStatusRecord {
            sync_state: update.sync_state.unwrap_or(current.sync_state),
            last_checked_at: update.last_checked_at.or(current.last_checked_at),
            last_successful_sync_at: update
                .last_successful_sync_at
                .or(current.last_successful_sync_at),
            last_local_export_at: update.last_local_export_at.or(current.last_local_export_at),
            last_remote_apply_at: update.last_remote_apply_at.or(current.last_remote_apply_at),
            last_error: update.last_error.unwrap_or(current.last_error),
            updated_at: update.updated_at.unwrap_or_else(|| Utc::now().to_rfc3339()),
        };

        self.writer
            .exec(move |conn| {
                diesel::replace_into(folder_sync_status::table)
                    .values((
                        folder_sync_status::id.eq(1),
                        folder_sync_status::sync_state.eq(next.sync_state),
                        folder_sync_status::last_checked_at.eq(next.last_checked_at),
                        folder_sync_status::last_successful_sync_at
                            .eq(next.last_successful_sync_at),
                        folder_sync_status::last_local_export_at.eq(next.last_local_export_at),
                        folder_sync_status::last_remote_apply_at.eq(next.last_remote_apply_at),
                        folder_sync_status::last_error.eq(next.last_error),
                        folder_sync_status::updated_at.eq(next.updated_at),
                    ))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }
}

fn to_config_record(row: FolderSyncConfigDB) -> FolderSyncConfigRecord {
    FolderSyncConfigRecord {
        shared_folder_path: row.shared_folder_path,
        device_id: row.device_id,
        is_enabled: row.is_enabled != 0,
        initialized_at: row.initialized_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn to_history_record(row: FolderSyncHistoryEntryDB) -> FolderSyncHistoryEntryRecord {
    FolderSyncHistoryEntryRecord {
        id: row.id,
        event_type: row.event_type,
        status: row.status,
        message: row.message,
        event_id: row.event_id,
        source_device_id: row.source_device_id,
        created_at: row.created_at,
    }
}

fn to_status_record(row: FolderSyncStatusDB) -> FolderSyncStatusRecord {
    FolderSyncStatusRecord {
        sync_state: row.sync_state,
        last_checked_at: row.last_checked_at,
        last_successful_sync_at: row.last_successful_sync_at,
        last_local_export_at: row.last_local_export_at,
        last_remote_apply_at: row.last_remote_apply_at,
        last_error: row.last_error,
        updated_at: row.updated_at,
    }
}

fn default_status_record() -> FolderSyncStatusRecord {
    FolderSyncStatusRecord {
        sync_state: "idle".to_string(),
        last_checked_at: None,
        last_successful_sync_at: None,
        last_local_export_at: None,
        last_remote_apply_at: None,
        last_error: None,
        updated_at: Utc::now().to_rfc3339(),
    }
}

#[cfg(test)]
mod tests {
    use diesel::r2d2::{self, Pool};
    use diesel::sqlite::SqliteConnection;
    use diesel::RunQueryDsl;
    use std::sync::Arc;
    use tempfile::tempdir;

    use super::{FolderSyncRepository, FolderSyncStatusUpdate};
    use crate::db::WriteHandle;
    use crate::db::{create_pool, get_connection, init, run_migrations, write_actor::spawn_writer};

    fn setup_db() -> (
        Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        WriteHandle,
    ) {
        let app_data = tempdir()
            .expect("tempdir")
            .keep()
            .to_string_lossy()
            .to_string();
        let db_path = init(&app_data).expect("init db");
        run_migrations(&db_path).expect("migrate db");
        let pool = create_pool(&db_path).expect("create pool");
        let writer = spawn_writer(pool.as_ref().clone());
        (pool, writer)
    }

    fn setup_repo() -> FolderSyncRepository {
        let (pool, writer) = setup_db();
        FolderSyncRepository::new(pool, writer)
    }

    #[tokio::test]
    async fn creates_folder_sync_foundation_tables() {
        let (pool, _writer) = setup_db();
        let mut conn = get_connection(&pool).expect("conn");

        for table in [
            "folder_sync_config",
            "folder_sync_imported_events",
            "folder_sync_history",
            "folder_sync_status",
        ] {
            let sql = format!(
                "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='{}'",
                table
            );

            #[derive(diesel::QueryableByName)]
            struct CountRow {
                #[diesel(sql_type = diesel::sql_types::BigInt)]
                c: i64,
            }

            let row = diesel::sql_query(sql)
                .get_result::<CountRow>(&mut conn)
                .expect("table exists");
            assert_eq!(row.c, 1, "missing table {table}");
        }
    }

    #[tokio::test]
    async fn upsert_config_persists_and_loads_current_config() {
        let repo = setup_repo();
        assert!(repo.get_config().expect("initial config").is_none());

        let initialized_at = "2026-03-07T12:00:00.000Z".to_string();
        let timestamp = "2026-03-07T12:00:05.000Z".to_string();

        repo.upsert_config(
            "/Users/example/Sync/PanoramaSync".to_string(),
            "device-a".to_string(),
            true,
            Some(initialized_at.clone()),
            timestamp.clone(),
        )
        .await
        .expect("upsert config");

        let config = repo
            .get_config()
            .expect("load config")
            .expect("config should exist");
        assert_eq!(
            config.shared_folder_path,
            "/Users/example/Sync/PanoramaSync"
        );
        assert_eq!(config.device_id, "device-a");
        assert!(config.is_enabled);
        assert_eq!(
            config.initialized_at.as_deref(),
            Some(initialized_at.as_str())
        );
        assert_eq!(config.created_at, timestamp);
        assert_eq!(config.updated_at, "2026-03-07T12:00:05.000Z");
    }

    #[tokio::test]
    async fn mark_event_imported_is_idempotent() {
        let repo = setup_repo();
        assert!(!repo.is_event_imported("evt-1").expect("not imported yet"));

        assert!(
            repo.mark_event_imported(
                "evt-1".to_string(),
                "device-b".to_string(),
                "events/device-b/evt-1.json".to_string(),
                "2026-03-07T12:10:00.000Z".to_string(),
            )
            .await
            .expect("first mark imported"),
            "first insert should report a new marker"
        );

        assert!(repo.is_event_imported("evt-1").expect("imported"));

        assert!(
            !repo
                .mark_event_imported(
                    "evt-1".to_string(),
                    "device-b".to_string(),
                    "events/device-b/evt-1.json".to_string(),
                    "2026-03-07T12:10:01.000Z".to_string(),
                )
                .await
                .expect("idempotent mark imported"),
            "second insert should be a no-op"
        );
    }

    #[tokio::test]
    async fn append_history_records_newest_entries_first() {
        let repo = setup_repo();

        repo.append_history(
            "export".to_string(),
            "success".to_string(),
            "Exported local changes".to_string(),
            Some("evt-1".to_string()),
            None,
            "2026-03-07T12:20:00.000Z".to_string(),
        )
        .await
        .expect("append history entry");

        repo.append_history(
            "import".to_string(),
            "success".to_string(),
            "Applied remote changes".to_string(),
            Some("evt-2".to_string()),
            Some("device-b".to_string()),
            "2026-03-07T12:21:00.000Z".to_string(),
        )
        .await
        .expect("append second history entry");

        let history = repo.list_recent_history(10).expect("list history");
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].event_type, "import");
        assert_eq!(history[0].event_id.as_deref(), Some("evt-2"));
        assert_eq!(history[1].event_type, "export");
        assert_eq!(history[1].event_id.as_deref(), Some("evt-1"));
    }

    #[tokio::test]
    async fn update_status_persists_timestamps_and_error_state() {
        let repo = setup_repo();
        let initial = repo.get_status().expect("initial status");
        assert_eq!(initial.sync_state, "idle");
        assert!(initial.last_successful_sync_at.is_none());

        repo.update_status(FolderSyncStatusUpdate {
            sync_state: Some("checking".to_string()),
            last_checked_at: Some("2026-03-07T12:30:00.000Z".to_string()),
            updated_at: Some("2026-03-07T12:30:00.000Z".to_string()),
            ..FolderSyncStatusUpdate::default()
        })
        .await
        .expect("mark checked");

        repo.update_status(FolderSyncStatusUpdate {
            sync_state: Some("up_to_date".to_string()),
            last_successful_sync_at: Some("2026-03-07T12:31:00.000Z".to_string()),
            last_local_export_at: Some("2026-03-07T12:30:30.000Z".to_string()),
            last_remote_apply_at: Some("2026-03-07T12:30:45.000Z".to_string()),
            last_error: Some(None),
            updated_at: Some("2026-03-07T12:31:00.000Z".to_string()),
            ..FolderSyncStatusUpdate::default()
        })
        .await
        .expect("mark success");

        let status = repo.get_status().expect("final status");
        assert_eq!(status.sync_state, "up_to_date");
        assert_eq!(
            status.last_checked_at.as_deref(),
            Some("2026-03-07T12:30:00.000Z")
        );
        assert_eq!(
            status.last_successful_sync_at.as_deref(),
            Some("2026-03-07T12:31:00.000Z")
        );
        assert_eq!(
            status.last_local_export_at.as_deref(),
            Some("2026-03-07T12:30:30.000Z")
        );
        assert_eq!(
            status.last_remote_apply_at.as_deref(),
            Some("2026-03-07T12:30:45.000Z")
        );
        assert_eq!(status.last_error, None);
    }
}
