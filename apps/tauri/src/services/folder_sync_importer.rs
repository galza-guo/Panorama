//! Import shared-folder event files into the local SQLite database.

use std::fs;
use std::sync::Arc;

use chrono::Utc;
use wealthfolio_core::sync::{FolderSyncEventFileV1, FOLDER_SYNC_VERSION_V1};
use wealthfolio_storage_sqlite::sync::{AppSyncRepository, FolderSyncRepository, FolderSyncStatusUpdate};

use crate::services::folder_sync_fs::FolderSyncFsService;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSyncImportResult {
    pub discovered_event_ids: Vec<String>,
    pub applied_event_ids: Vec<String>,
    pub skipped_event_ids: Vec<String>,
}

pub struct FolderSyncImporter {
    app_sync_repository: Arc<AppSyncRepository>,
    folder_sync_repository: Arc<FolderSyncRepository>,
    fs_service: FolderSyncFsService,
    local_device_id: String,
}

impl FolderSyncImporter {
    pub fn new(
        app_sync_repository: Arc<AppSyncRepository>,
        folder_sync_repository: Arc<FolderSyncRepository>,
        fs_service: FolderSyncFsService,
        local_device_id: String,
    ) -> Self {
        Self {
            app_sync_repository,
            folder_sync_repository,
            fs_service,
            local_device_id,
        }
    }

    pub async fn import_remote_events(&self) -> Result<FolderSyncImportResult, String> {
        let started_at = Utc::now().to_rfc3339();
        self.folder_sync_repository
            .update_status(FolderSyncStatusUpdate {
                sync_state: Some("applying_changes".to_string()),
                last_checked_at: Some(started_at.clone()),
                updated_at: Some(started_at.clone()),
                ..Default::default()
            })
            .await
            .map_err(|err| err.to_string())?;

        let event_refs = self
            .fs_service
            .list_remote_event_files(&self.local_device_id)?;
        let discovered_event_ids = event_refs
            .iter()
            .map(|event_ref| event_ref.event_id.clone())
            .collect::<Vec<_>>();
        if event_refs.is_empty() {
            self.folder_sync_repository
                .update_status(FolderSyncStatusUpdate {
                    sync_state: Some("idle".to_string()),
                    last_checked_at: Some(started_at.clone()),
                    last_error: Some(None),
                    updated_at: Some(started_at),
                    ..Default::default()
                })
                .await
                .map_err(|err| err.to_string())?;
            return Ok(FolderSyncImportResult {
                discovered_event_ids,
                applied_event_ids: Vec::new(),
                skipped_event_ids: Vec::new(),
            });
        }

        let mut next_seq = self
            .app_sync_repository
            .next_local_replay_seq()
            .map_err(|err| err.to_string())?;
        let mut applied_event_ids = Vec::new();
        let mut skipped_event_ids = Vec::new();

        for event_ref in event_refs {
            if self
                .folder_sync_repository
                .is_event_imported(&event_ref.event_id)
                .map_err(|err| err.to_string())?
            {
                skipped_event_ids.push(event_ref.event_id.clone());
                continue;
            }

            if self
                .app_sync_repository
                .has_applied_event(&event_ref.event_id)
                .map_err(|err| err.to_string())?
            {
                self.folder_sync_repository
                    .mark_event_imported(
                        event_ref.event_id.clone(),
                        event_ref.device_id.clone(),
                        event_ref.path.to_string_lossy().into_owned(),
                        Utc::now().to_rfc3339(),
                    )
                    .await
                    .map_err(|err| err.to_string())?;
                skipped_event_ids.push(event_ref.event_id.clone());
                continue;
            }

            let event = self.read_event_file(&event_ref.path)?;
            if event.version != FOLDER_SYNC_VERSION_V1 {
                let error = format!(
                    "Unsupported folder sync event version '{}' in {}",
                    event.version,
                    event_ref.path.display()
                );
                self.record_import_error(&event_ref.event_id, &error).await?;
                return Err(error);
            }
            if event.event_id != event_ref.event_id || event.device_id != event_ref.device_id {
                let error = format!(
                    "Folder sync event metadata mismatch for {}",
                    event_ref.path.display()
                );
                self.record_import_error(&event_ref.event_id, &error).await?;
                return Err(error);
            }

            let applied = self
                .app_sync_repository
                .apply_remote_event_lww(
                    event.entity,
                    event.entity_id,
                    event.op,
                    event.event_id.clone(),
                    event.client_timestamp,
                    next_seq,
                    event.payload,
                )
                .await
                .map_err(|err| err.to_string())?;
            next_seq += 1;

            self.folder_sync_repository
                .mark_event_imported(
                    event.event_id.clone(),
                    event.device_id,
                    event_ref.path.to_string_lossy().into_owned(),
                    Utc::now().to_rfc3339(),
                )
                .await
                .map_err(|err| err.to_string())?;

            if applied {
                applied_event_ids.push(event.event_id);
            } else {
                skipped_event_ids.push(event.event_id);
            }
        }

        let completed_at = Utc::now().to_rfc3339();
        self.folder_sync_repository
            .append_history(
                "import".to_string(),
                "success".to_string(),
                format!(
                    "Imported {} remote event(s), skipped {}",
                    applied_event_ids.len(),
                    skipped_event_ids.len()
                ),
                applied_event_ids
                    .last()
                    .cloned()
                    .or_else(|| skipped_event_ids.last().cloned()),
                None,
                completed_at.clone(),
            )
            .await
            .map_err(|err| err.to_string())?;
        self.folder_sync_repository
            .update_status(FolderSyncStatusUpdate {
                sync_state: Some("up_to_date".to_string()),
                last_checked_at: Some(completed_at.clone()),
                last_successful_sync_at: Some(completed_at.clone()),
                last_remote_apply_at: applied_event_ids.last().map(|_| completed_at.clone()),
                last_error: Some(None),
                updated_at: Some(completed_at),
                ..Default::default()
            })
            .await
            .map_err(|err| err.to_string())?;

        Ok(FolderSyncImportResult {
            discovered_event_ids,
            applied_event_ids,
            skipped_event_ids,
        })
    }

    fn read_event_file(&self, path: &std::path::Path) -> Result<FolderSyncEventFileV1, String> {
        serde_json::from_slice(
            &fs::read(path).map_err(|err| format!("Failed to read event file: {err}"))?,
        )
        .map_err(|err| format!("Failed to parse event file '{}': {err}", path.display()))
    }

    async fn record_import_error(&self, event_id: &str, error: &str) -> Result<(), String> {
        let timestamp = Utc::now().to_rfc3339();
        self.folder_sync_repository
            .append_history(
                "import".to_string(),
                "error".to_string(),
                format!("Failed to import event '{}': {}", event_id, error),
                Some(event_id.to_string()),
                None,
                timestamp.clone(),
            )
            .await
            .map_err(|err| err.to_string())?;
        self.folder_sync_repository
            .update_status(FolderSyncStatusUpdate {
                sync_state: Some("needs_attention".to_string()),
                last_checked_at: Some(timestamp.clone()),
                last_error: Some(Some(error.to_string())),
                updated_at: Some(timestamp),
                ..Default::default()
            })
            .await
            .map_err(|err| err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use diesel::prelude::*;
    use tempfile::tempdir;
    use wealthfolio_core::sync::{
        FolderSyncEventFileV1, FolderSyncMetadataV1, SyncEntity, SyncOperation,
        FOLDER_SYNC_VERSION_V1,
    };
    use wealthfolio_storage_sqlite::db::{self, write_actor};
    use wealthfolio_storage_sqlite::schema::platforms;
    use wealthfolio_storage_sqlite::sync::{AppSyncRepository, FolderSyncRepository};

    use crate::services::folder_sync_fs::FolderSyncFsService;

    use super::FolderSyncImporter;

    struct ImporterTestContext {
        _tempdir: tempfile::TempDir,
        pool: Arc<wealthfolio_storage_sqlite::DbPool>,
        app_sync_repository: Arc<AppSyncRepository>,
        folder_sync_repository: Arc<FolderSyncRepository>,
        fs_service: FolderSyncFsService,
        shared_root: PathBuf,
        local_device_id: String,
    }

    async fn setup_context() -> ImporterTestContext {
        let tempdir = tempdir().expect("tempdir");
        let app_data_dir = tempdir.path().join("app-data");
        std::fs::create_dir_all(&app_data_dir).expect("create app-data");
        let db_path = db::init(app_data_dir.to_str().expect("app-data str")).expect("init db");
        db::run_migrations(&db_path).expect("run migrations");
        let pool = db::create_pool(&db_path).expect("create pool");
        let writer = write_actor::spawn_writer(pool.as_ref().clone());
        let app_sync_repository = Arc::new(AppSyncRepository::new(pool.clone(), writer.clone()));
        let folder_sync_repository =
            Arc::new(FolderSyncRepository::new(pool.clone(), writer.clone()));
        let shared_root = tempdir.path().join("PanoramaSync");
        let fs_service = FolderSyncFsService::new(shared_root.clone());
        let local_device_id = "device-local".to_string();
        fs_service
            .initialize_folder(
                &local_device_id,
                &FolderSyncMetadataV1 {
                    version: FOLDER_SYNC_VERSION_V1,
                    created_at: chrono::Utc::now().to_rfc3339(),
                    created_by_device_id: local_device_id.clone(),
                },
            )
            .expect("initialize folder");

        ImporterTestContext {
            _tempdir: tempdir,
            pool,
            app_sync_repository,
            folder_sync_repository,
            fs_service,
            shared_root,
            local_device_id,
        }
    }

    fn load_platform_name(
        pool: &Arc<wealthfolio_storage_sqlite::DbPool>,
        platform_id: &str,
    ) -> Option<String> {
        let mut conn = wealthfolio_storage_sqlite::get_connection(pool).expect("conn");
        platforms::table
            .filter(platforms::id.eq(platform_id))
            .select(platforms::name)
            .first::<Option<String>>(&mut conn)
            .optional()
            .expect("query platform")
            .flatten()
    }

    #[tokio::test]
    async fn imports_remote_event_once_and_skips_duplicate_replay() {
        let context = setup_context().await;
        let remote_event = FolderSyncEventFileV1 {
            version: FOLDER_SYNC_VERSION_V1,
            event_id: "evt-platform-import-1".to_string(),
            device_id: "device-remote".to_string(),
            entity: SyncEntity::Platform,
            entity_id: "platform-import-1".to_string(),
            op: SyncOperation::Create,
            client_timestamp: "2026-03-07T13:00:00Z".to_string(),
            payload: serde_json::json!({
                "id": "platform-import-1",
                "name": "Imported Platform",
                "url": "https://broker.example/imported",
                "external_id": serde_json::Value::Null,
                "kind": "BROKERAGE",
                "website_url": "https://broker.example",
                "logo_url": serde_json::Value::Null
            }),
            schema_version: Some(FOLDER_SYNC_VERSION_V1),
            app_version: Some("3.0.0".to_string()),
        };
        context
            .fs_service
            .write_event_file(&remote_event)
            .expect("write remote event");

        let importer = FolderSyncImporter::new(
            context.app_sync_repository.clone(),
            context.folder_sync_repository.clone(),
            context.fs_service.clone(),
            context.local_device_id.clone(),
        );

        let first_result = importer.import_remote_events().await.expect("first import");
        assert_eq!(
            first_result.applied_event_ids,
            vec!["evt-platform-import-1".to_string()]
        );
        assert_eq!(
            load_platform_name(&context.pool, "platform-import-1").as_deref(),
            Some("Imported Platform")
        );
        assert!(
            context
                .folder_sync_repository
                .is_event_imported("evt-platform-import-1")
                .expect("import marker")
        );

        let second_result = importer.import_remote_events().await.expect("second import");
        assert!(second_result.applied_event_ids.is_empty());
        assert_eq!(
            load_platform_name(&context.pool, "platform-import-1").as_deref(),
            Some("Imported Platform")
        );
    }

    #[tokio::test]
    async fn applies_newer_remote_event_and_skips_older_remote_event_via_lww() {
        let context = setup_context().await;
        context
            .app_sync_repository
            .apply_remote_event_lww(
                SyncEntity::Platform,
                "platform-lww-1".to_string(),
                SyncOperation::Create,
                "evt-local-platform-1".to_string(),
                "2026-03-07T13:00:00Z".to_string(),
                1,
                serde_json::json!({
                    "id": "platform-lww-1",
                    "name": "Local Base",
                    "url": "https://broker.example/local",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/local",
                    "logo_url": serde_json::Value::Null
                }),
            )
            .await
            .expect("seed local platform");

        context
            .fs_service
            .write_event_file(&FolderSyncEventFileV1 {
                version: FOLDER_SYNC_VERSION_V1,
                event_id: "evt-remote-platform-newer".to_string(),
                device_id: "device-remote".to_string(),
                entity: SyncEntity::Platform,
                entity_id: "platform-lww-1".to_string(),
                op: SyncOperation::Update,
                client_timestamp: "2026-03-07T13:00:05Z".to_string(),
                payload: serde_json::json!({
                    "id": "platform-lww-1",
                    "name": "Remote Newer",
                    "url": "https://broker.example/newer",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/newer",
                    "logo_url": serde_json::Value::Null
                }),
                schema_version: Some(FOLDER_SYNC_VERSION_V1),
                app_version: Some("3.0.0".to_string()),
            })
            .expect("write newer remote event");
        context
            .fs_service
            .write_event_file(&FolderSyncEventFileV1 {
                version: FOLDER_SYNC_VERSION_V1,
                event_id: "evt-remote-platform-older".to_string(),
                device_id: "device-remote".to_string(),
                entity: SyncEntity::Platform,
                entity_id: "platform-lww-1".to_string(),
                op: SyncOperation::Update,
                client_timestamp: "2026-03-07T12:59:59Z".to_string(),
                payload: serde_json::json!({
                    "id": "platform-lww-1",
                    "name": "Remote Older",
                    "url": "https://broker.example/older",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/older",
                    "logo_url": serde_json::Value::Null
                }),
                schema_version: Some(FOLDER_SYNC_VERSION_V1),
                app_version: Some("3.0.0".to_string()),
            })
            .expect("write older remote event");

        let importer = FolderSyncImporter::new(
            context.app_sync_repository.clone(),
            context.folder_sync_repository.clone(),
            context.fs_service.clone(),
            context.local_device_id.clone(),
        );
        let result = importer.import_remote_events().await.expect("import remote events");

        assert_eq!(
            result.applied_event_ids,
            vec!["evt-remote-platform-newer".to_string()]
        );
        assert_eq!(
            result.skipped_event_ids,
            vec!["evt-remote-platform-older".to_string()]
        );
        assert_eq!(
            load_platform_name(&context.pool, "platform-lww-1").as_deref(),
            Some("Remote Newer")
        );
    }
}
