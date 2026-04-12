//! Background orchestration for automatic folder sync.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tokio::sync::{mpsc, watch, Mutex};
use tokio::task::JoinHandle;
use wealthfolio_storage_sqlite::sync::{
    AppSyncRepository, FolderSyncRepository, FolderSyncStatusUpdate,
};

use crate::services::folder_sync_exporter::FolderSyncExporter;
use crate::services::folder_sync_fs::FolderSyncFsService;
use crate::services::folder_sync_importer::FolderSyncImporter;

#[derive(Debug, Clone, Copy)]
enum RuntimeTrigger {
    Startup,
    Foreground,
    Periodic,
    LocalMutation,
}

pub struct FolderSyncRuntime {
    trigger_tx: mpsc::UnboundedSender<RuntimeTrigger>,
    shutdown_tx: watch::Sender<bool>,
    join_handle: Mutex<Option<JoinHandle<()>>>,
}

impl FolderSyncRuntime {
    pub fn spawn(
        app_sync_repository: Arc<AppSyncRepository>,
        folder_sync_repository: Arc<FolderSyncRepository>,
        poll_interval: Duration,
    ) -> Self {
        let (trigger_tx, mut trigger_rx) = mpsc::unbounded_channel();
        let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
        let join_handle = tokio::spawn(async move {
            let mut ticker = tokio::time::interval(poll_interval);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            ticker.tick().await;

            loop {
                tokio::select! {
                    _ = ticker.tick() => {
                        if let Err(err) = run_cycle(
                            app_sync_repository.clone(),
                            folder_sync_repository.clone(),
                            RuntimeTrigger::Periodic,
                        ).await {
                            record_runtime_error(folder_sync_repository.clone(), err).await;
                        }
                    }
                    Some(trigger) = trigger_rx.recv() => {
                        if let Err(err) = run_cycle(
                            app_sync_repository.clone(),
                            folder_sync_repository.clone(),
                            trigger,
                        ).await {
                            record_runtime_error(folder_sync_repository.clone(), err).await;
                        }
                    }
                    changed = shutdown_rx.changed() => {
                        if changed.is_ok() && *shutdown_rx.borrow() {
                            break;
                        }
                    }
                }
            }
        });

        Self {
            trigger_tx,
            shutdown_tx,
            join_handle: Mutex::new(Some(join_handle)),
        }
    }

    pub fn trigger_startup(&self) {
        let _ = self.trigger_tx.send(RuntimeTrigger::Startup);
    }

    pub fn trigger_foreground(&self) {
        let _ = self.trigger_tx.send(RuntimeTrigger::Foreground);
    }

    pub fn trigger_local_mutation(&self) {
        let _ = self.trigger_tx.send(RuntimeTrigger::LocalMutation);
    }

    pub async fn stop(&self) {
        let _ = self.shutdown_tx.send(true);
        if let Some(handle) = self.join_handle.lock().await.take() {
            let _ = handle.await;
        }
    }
}

async fn run_cycle(
    app_sync_repository: Arc<AppSyncRepository>,
    folder_sync_repository: Arc<FolderSyncRepository>,
    trigger: RuntimeTrigger,
) -> Result<(), String> {
    let Some(config) = folder_sync_repository
        .get_config()
        .map_err(|err| err.to_string())?
    else {
        return Ok(());
    };
    if !config.is_enabled {
        return Ok(());
    }

    let fs_service = FolderSyncFsService::new(PathBuf::from(&config.shared_folder_path));
    let importer = FolderSyncImporter::new(
        app_sync_repository.clone(),
        folder_sync_repository.clone(),
        fs_service.clone(),
        config.device_id.clone(),
    );
    let exporter = FolderSyncExporter::new(
        app_sync_repository,
        folder_sync_repository,
        fs_service,
        config.device_id,
    );

    match trigger {
        RuntimeTrigger::Startup | RuntimeTrigger::Foreground | RuntimeTrigger::Periodic => {
            importer.import_remote_events().await?;
            exporter.export_pending_events(100).await?;
        }
        RuntimeTrigger::LocalMutation => {
            exporter.export_pending_events(100).await?;
        }
    }

    Ok(())
}

async fn record_runtime_error(folder_sync_repository: Arc<FolderSyncRepository>, error: String) {
    let now = Utc::now().to_rfc3339();
    if let Err(err) = folder_sync_repository
        .update_status(FolderSyncStatusUpdate {
            sync_state: Some("folder_unavailable".to_string()),
            last_checked_at: Some(now.clone()),
            last_error: Some(Some(error.clone())),
            updated_at: Some(now.clone()),
            ..Default::default()
        })
        .await
    {
        log::warn!("Failed to update folder sync runtime status: {}", err);
    }
    if let Err(err) = folder_sync_repository
        .append_history(
            "runtime".to_string(),
            "error".to_string(),
            format!("Folder sync runtime cycle failed: {}", error),
            None,
            None,
            now,
        )
        .await
    {
        log::warn!("Failed to append folder sync runtime history: {}", err);
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::Arc;
    use std::time::Duration;

    use diesel::prelude::*;
    use tempfile::tempdir;
    use wealthfolio_core::sync::{
        FolderSyncEventFileV1, SyncEntity, SyncOperation, FOLDER_SYNC_VERSION_V1,
    };
    use wealthfolio_storage_sqlite::db::{self, write_actor, WriteHandle};
    use wealthfolio_storage_sqlite::schema::platforms;
    use wealthfolio_storage_sqlite::sync::{
        insert_outbox_event, AppSyncRepository, FolderSyncRepository, OutboxWriteRequest,
    };

    use crate::services::folder_sync_fs::FolderSyncFsService;

    use super::FolderSyncRuntime;

    struct RuntimeTestDevice {
        pool: Arc<wealthfolio_storage_sqlite::DbPool>,
        writer: WriteHandle,
        app_sync_repository: Arc<AppSyncRepository>,
        folder_sync_repository: Arc<FolderSyncRepository>,
        fs_service: FolderSyncFsService,
    }

    async fn setup_device(
        root: &Path,
        app_dir_name: &str,
        device_id: &str,
        shared_root: &Path,
    ) -> RuntimeTestDevice {
        let app_data_dir = root.join(app_dir_name);
        std::fs::create_dir_all(&app_data_dir).expect("create app-data");
        let db_path = db::init(app_data_dir.to_str().expect("app-data str")).expect("init db");
        db::run_migrations(&db_path).expect("run migrations");
        let pool = db::create_pool(&db_path).expect("create pool");
        let writer = write_actor::spawn_writer(pool.as_ref().clone());
        let app_sync_repository = Arc::new(AppSyncRepository::new(pool.clone(), writer.clone()));
        let folder_sync_repository =
            Arc::new(FolderSyncRepository::new(pool.clone(), writer.clone()));
        folder_sync_repository
            .upsert_config(
                shared_root.to_string_lossy().into_owned(),
                device_id.to_string(),
                true,
                Some(chrono::Utc::now().to_rfc3339()),
                chrono::Utc::now().to_rfc3339(),
            )
            .await
            .expect("upsert folder sync config");

        RuntimeTestDevice {
            pool,
            writer,
            app_sync_repository,
            folder_sync_repository,
            fs_service: FolderSyncFsService::new(shared_root.to_path_buf()),
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

    async fn seed_remote_platform_event(
        fs_service: &FolderSyncFsService,
        device_id: &str,
        event_id: &str,
        platform_id: &str,
        platform_name: &str,
        client_timestamp: &str,
    ) {
        fs_service
            .write_event_file(&FolderSyncEventFileV1 {
                version: FOLDER_SYNC_VERSION_V1,
                event_id: event_id.to_string(),
                device_id: device_id.to_string(),
                entity: SyncEntity::Platform,
                entity_id: platform_id.to_string(),
                op: SyncOperation::Create,
                client_timestamp: client_timestamp.to_string(),
                payload: serde_json::json!({
                    "id": platform_id,
                    "name": platform_name,
                    "url": format!("https://broker.example/{platform_id}"),
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": format!("https://broker.example/{platform_id}"),
                    "logo_url": serde_json::Value::Null
                }),
                schema_version: Some(FOLDER_SYNC_VERSION_V1),
                app_version: Some("3.0.0".to_string()),
            })
            .expect("write remote event");
    }

    #[tokio::test]
    async fn startup_scan_trigger_imports_remote_changes() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let source = setup_device(root.path(), "source-app", "device-a", &shared_root).await;
        let target = setup_device(root.path(), "target-app", "device-b", &shared_root).await;

        seed_remote_platform_event(
            &source.fs_service,
            "device-a",
            "evt-runtime-startup-1",
            "platform-runtime-1",
            "Runtime Startup",
            "2026-03-07T16:00:00Z",
        )
        .await;

        let runtime = FolderSyncRuntime::spawn(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
            Duration::from_secs(60),
        );
        runtime.trigger_startup();
        tokio::time::sleep(Duration::from_millis(250)).await;

        assert_eq!(
            load_platform_name(&target.pool, "platform-runtime-1").as_deref(),
            Some("Runtime Startup")
        );

        runtime.stop().await;
    }

    #[tokio::test]
    async fn foreground_trigger_imports_remote_changes() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let source = setup_device(root.path(), "source-app", "device-a", &shared_root).await;
        let target = setup_device(root.path(), "target-app", "device-b", &shared_root).await;

        let runtime = FolderSyncRuntime::spawn(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
            Duration::from_secs(60),
        );

        seed_remote_platform_event(
            &source.fs_service,
            "device-a",
            "evt-runtime-foreground-1",
            "platform-runtime-foreground",
            "Runtime Foreground",
            "2026-03-07T16:05:00Z",
        )
        .await;

        runtime.trigger_foreground();
        tokio::time::sleep(Duration::from_millis(250)).await;

        assert_eq!(
            load_platform_name(&target.pool, "platform-runtime-foreground").as_deref(),
            Some("Runtime Foreground")
        );

        runtime.stop().await;
    }

    #[tokio::test]
    async fn periodic_polling_imports_remote_changes_without_manual_trigger() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let source = setup_device(root.path(), "source-app", "device-a", &shared_root).await;
        let target = setup_device(root.path(), "target-app", "device-b", &shared_root).await;

        let runtime = FolderSyncRuntime::spawn(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
            Duration::from_millis(50),
        );

        seed_remote_platform_event(
            &source.fs_service,
            "device-a",
            "evt-runtime-periodic-1",
            "platform-runtime-periodic",
            "Runtime Periodic",
            "2026-03-07T16:10:00Z",
        )
        .await;

        tokio::time::sleep(Duration::from_millis(250)).await;

        assert_eq!(
            load_platform_name(&target.pool, "platform-runtime-periodic").as_deref(),
            Some("Runtime Periodic")
        );

        runtime.stop().await;
    }

    #[tokio::test]
    async fn folder_unavailable_moves_status_without_crashing() {
        let root = tempdir().expect("tempdir");
        let shared_root_file = root.path().join("not-a-folder");
        std::fs::write(&shared_root_file, "blocked").expect("write blocking file");
        let target = setup_device(root.path(), "target-app", "device-b", &shared_root_file).await;
        target
            .writer
            .exec(move |conn| {
                let mut request = OutboxWriteRequest::new(
                    SyncEntity::Platform,
                    "platform-runtime-local",
                    SyncOperation::Create,
                    serde_json::json!({
                        "id": "platform-runtime-local",
                        "name": "Runtime Local",
                        "url": "https://broker.example/runtime-local",
                        "external_id": serde_json::Value::Null,
                        "kind": "BROKERAGE",
                        "website_url": "https://broker.example/runtime-local",
                        "logo_url": serde_json::Value::Null
                    }),
                );
                request.event_id = Some("evt-runtime-local-1".to_string());
                insert_outbox_event(conn, request)?;
                Ok(())
            })
            .await
            .expect("insert outbox");

        let runtime = FolderSyncRuntime::spawn(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
            Duration::from_secs(60),
        );
        runtime.trigger_local_mutation();
        tokio::time::sleep(Duration::from_millis(250)).await;

        let status = target
            .folder_sync_repository
            .get_status()
            .expect("get runtime status");
        assert_eq!(status.sync_state, "folder_unavailable");
        assert!(status.last_error.is_some());
        assert_eq!(
            target
                .app_sync_repository
                .list_pending_outbox(10)
                .expect("pending outbox")
                .len(),
            1
        );

        runtime.stop().await;
    }
}
