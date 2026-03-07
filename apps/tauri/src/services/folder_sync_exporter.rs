//! Export pending local sync mutations into shared-folder event files.

use std::fs;
use std::sync::Arc;

use chrono::Utc;
use wealthfolio_core::sync::{
    event_file_name, FolderSyncEventFileV1, FolderSyncMetadataV1, FOLDER_SYNC_VERSION_V1,
};
use wealthfolio_storage_sqlite::sync::{AppSyncRepository, FolderSyncRepository, FolderSyncStatusUpdate};

use crate::services::folder_sync_fs::FolderSyncFsService;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSyncExportResult {
    pub exported_event_ids: Vec<String>,
}

pub struct FolderSyncExporter {
    app_sync_repository: Arc<AppSyncRepository>,
    folder_sync_repository: Arc<FolderSyncRepository>,
    fs_service: FolderSyncFsService,
    local_device_id: String,
}

impl FolderSyncExporter {
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

    pub async fn export_pending_events(&self, limit: i64) -> Result<FolderSyncExportResult, String> {
        let now = Utc::now().to_rfc3339();
        self.ensure_folder_initialized(&now)?;
        self.folder_sync_repository
            .update_status(FolderSyncStatusUpdate {
                sync_state: Some("exporting".to_string()),
                last_checked_at: Some(now.clone()),
                updated_at: Some(now.clone()),
                ..Default::default()
            })
            .await
            .map_err(|err| err.to_string())?;

        let pending = self
            .app_sync_repository
            .list_pending_outbox(limit)
            .map_err(|err| err.to_string())?;
        if pending.is_empty() {
            self.folder_sync_repository
                .update_status(FolderSyncStatusUpdate {
                    sync_state: Some("idle".to_string()),
                    last_checked_at: Some(now.clone()),
                    last_error: Some(None),
                    updated_at: Some(now),
                    ..Default::default()
                })
                .await
                .map_err(|err| err.to_string())?;
            return Ok(FolderSyncExportResult {
                exported_event_ids: Vec::new(),
            });
        }

        let mut exported_event_ids = Vec::with_capacity(pending.len());
        for event in pending {
            let payload = serde_json::from_str(&event.payload)
                .map_err(|err| format!("Failed to parse outbox payload '{}': {err}", event.event_id))?;
            let event_file = FolderSyncEventFileV1 {
                version: FOLDER_SYNC_VERSION_V1,
                event_id: event.event_id.clone(),
                device_id: self.local_device_id.clone(),
                entity: event.entity,
                entity_id: event.entity_id,
                op: event.op,
                client_timestamp: event.client_timestamp,
                payload,
                schema_version: Some(FOLDER_SYNC_VERSION_V1),
                app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
            };

            if let Err(err) = self.fs_service.write_event_file(&event_file) {
                if !self.is_existing_event_file(&event_file)? {
                    self.record_export_error(&event.event_id, &err).await?;
                    return Err(err);
                }
            }

            exported_event_ids.push(event.event_id);
        }

        self.app_sync_repository
            .mark_outbox_sent(exported_event_ids.clone())
            .await
            .map_err(|err| err.to_string())?;

        let status_timestamp = Utc::now().to_rfc3339();
        self.folder_sync_repository
            .append_history(
                "export".to_string(),
                "success".to_string(),
                format!(
                    "Exported {} event(s) to shared folder",
                    exported_event_ids.len()
                ),
                exported_event_ids.last().cloned(),
                Some(self.local_device_id.clone()),
                status_timestamp.clone(),
            )
            .await
            .map_err(|err| err.to_string())?;
        self.folder_sync_repository
            .update_status(FolderSyncStatusUpdate {
                sync_state: Some("up_to_date".to_string()),
                last_checked_at: Some(status_timestamp.clone()),
                last_successful_sync_at: Some(status_timestamp.clone()),
                last_local_export_at: Some(status_timestamp.clone()),
                last_error: Some(None),
                updated_at: Some(status_timestamp),
                ..Default::default()
            })
            .await
            .map_err(|err| err.to_string())?;

        Ok(FolderSyncExportResult { exported_event_ids })
    }

    fn ensure_folder_initialized(&self, timestamp: &str) -> Result<(), String> {
        self.fs_service.initialize_folder(
            &self.local_device_id,
            &FolderSyncMetadataV1 {
                version: FOLDER_SYNC_VERSION_V1,
                created_at: timestamp.to_string(),
                created_by_device_id: self.local_device_id.clone(),
            },
        )
    }

    fn is_existing_event_file(&self, event_file: &FolderSyncEventFileV1) -> Result<bool, String> {
        let path = self
            .fs_service
            .root()
            .join("events")
            .join(&self.local_device_id)
            .join(event_file_name(&event_file.event_id));
        if !path.exists() {
            return Ok(false);
        }

        let existing: FolderSyncEventFileV1 = serde_json::from_slice(
            &fs::read(&path).map_err(|err| format!("Failed to read existing event file: {err}"))?,
        )
        .map_err(|err| format!("Failed to parse existing event file: {err}"))?;
        Ok(existing == *event_file)
    }

    async fn record_export_error(&self, event_id: &str, error: &str) -> Result<(), String> {
        let timestamp = Utc::now().to_rfc3339();
        self.folder_sync_repository
            .append_history(
                "export".to_string(),
                "error".to_string(),
                format!("Failed to export event '{}': {}", event_id, error),
                Some(event_id.to_string()),
                Some(self.local_device_id.clone()),
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

    use tempfile::tempdir;
    use wealthfolio_core::settings::SettingsRepositoryTrait;
    use wealthfolio_core::sync::{FolderSyncEventFileV1, SyncEntity, SyncOperation};
    use wealthfolio_storage_sqlite::db::{self, write_actor, WriteHandle};
    use wealthfolio_storage_sqlite::settings::SettingsRepository;
    use wealthfolio_storage_sqlite::sync::{
        insert_outbox_event, AppSyncRepository, FolderSyncRepository, OutboxWriteRequest,
    };

    use crate::services::folder_sync_fs::FolderSyncFsService;

    use super::FolderSyncExporter;

    struct ExporterTestContext {
        _tempdir: tempfile::TempDir,
        writer: WriteHandle,
        app_sync_repository: Arc<AppSyncRepository>,
        folder_sync_repository: Arc<FolderSyncRepository>,
        settings_repository: Arc<SettingsRepository>,
        shared_root: PathBuf,
        local_device_id: String,
    }

    async fn setup_context() -> ExporterTestContext {
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
        let settings_repository = Arc::new(SettingsRepository::new(pool.clone(), writer.clone()));
        let local_device_id = "device-local".to_string();
        let now = chrono::Utc::now().to_rfc3339();
        folder_sync_repository
            .upsert_config(
                tempdir
                    .path()
                    .join("PanoramaSync")
                    .to_string_lossy()
                    .into_owned(),
                local_device_id.clone(),
                true,
                Some(now.clone()),
                now,
            )
            .await
            .expect("upsert folder sync config");

        ExporterTestContext {
            _tempdir: tempdir,
            writer,
            app_sync_repository,
            folder_sync_repository,
            settings_repository,
            shared_root: app_data_dir.parent().expect("tempdir root").join("PanoramaSync"),
            local_device_id,
        }
    }

    #[tokio::test]
    async fn exports_pending_outbox_events_into_local_device_directory() {
        let context = setup_context().await;
        context
            .writer
            .exec(move |conn| {
                let mut request = OutboxWriteRequest::new(
                    SyncEntity::Platform,
                    "platform-export-1",
                    SyncOperation::Create,
                    serde_json::json!({
                        "id": "platform-export-1",
                        "name": "Synced Platform",
                        "url": "https://broker.example/platform-export-1",
                        "external_id": serde_json::Value::Null,
                        "kind": "BROKERAGE",
                        "website_url": "https://broker.example",
                        "logo_url": serde_json::Value::Null
                    }),
                );
                request.event_id = Some("platform-export-1".to_string());
                insert_outbox_event(
                    conn,
                    request,
                )?;
                Ok(())
            })
            .await
            .expect("insert outbox event");

        let exporter = FolderSyncExporter::new(
            context.app_sync_repository.clone(),
            context.folder_sync_repository.clone(),
            FolderSyncFsService::new(context.shared_root.clone()),
            context.local_device_id.clone(),
        );
        let result = exporter.export_pending_events(20).await.expect("export events");

        assert_eq!(result.exported_event_ids, vec!["platform-export-1".to_string()]);
        let event_path = context
            .shared_root
            .join("events")
            .join(&context.local_device_id)
            .join("platform-export-1.json");
        assert!(event_path.exists(), "expected exported event file");

        let event_file: FolderSyncEventFileV1 = serde_json::from_slice(
            &std::fs::read(&event_path).expect("read exported event file"),
        )
        .expect("parse exported event file");
        assert_eq!(event_file.event_id, "platform-export-1");
        assert_eq!(event_file.entity, SyncEntity::Platform);
        assert_eq!(event_file.device_id, context.local_device_id);
        assert_eq!(
            context
                .app_sync_repository
                .list_pending_outbox(20)
                .expect("list pending")
                .len(),
            0
        );
        assert!(
            context
                .folder_sync_repository
                .get_status()
                .expect("get status")
                .last_local_export_at
                .is_some()
        );
    }

    #[tokio::test]
    async fn does_not_emit_event_files_for_local_only_settings_updates() {
        let context = setup_context().await;
        context
            .settings_repository
            .update_setting("instance_id", "local-machine-only")
            .await
            .expect("update instance_id");
        context
            .settings_repository
            .update_setting("theme", "dark")
            .await
            .expect("update theme");

        let exporter = FolderSyncExporter::new(
            context.app_sync_repository.clone(),
            context.folder_sync_repository.clone(),
            FolderSyncFsService::new(context.shared_root.clone()),
            context.local_device_id.clone(),
        );
        let result = exporter.export_pending_events(20).await.expect("export events");

        assert!(result.exported_event_ids.is_empty());
        let local_events_dir = context
            .shared_root
            .join("events")
            .join(&context.local_device_id);
        if local_events_dir.exists() {
            let entries = std::fs::read_dir(local_events_dir)
                .expect("read local events dir")
                .collect::<Result<Vec<_>, _>>()
                .expect("collect dir entries");
            assert!(entries.is_empty(), "expected no exported event files");
        }
        assert_eq!(
            context
                .app_sync_repository
                .list_pending_outbox(20)
                .expect("list pending")
                .len(),
            0
        );
    }
}
