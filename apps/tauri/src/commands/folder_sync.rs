//! Tauri commands for Syncthing-backed folder sync.

use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use tauri::State;
use uuid::Uuid;
use wealthfolio_core::sync::{FolderSyncMetadataV1, FOLDER_SYNC_VERSION_V1};
use wealthfolio_storage_sqlite::settings::SettingsRepository;
use wealthfolio_storage_sqlite::sync::{
    AppSyncRepository, FolderSyncHistoryEntryRecord, FolderSyncRepository, FolderSyncStatusRecord,
    FolderSyncStatusUpdate,
};

use crate::context::ServiceContext;
use crate::services::folder_sync_exporter::FolderSyncExporter;
use crate::services::folder_sync_fs::FolderSyncFsService;
use crate::services::folder_sync_importer::FolderSyncImporter;
use crate::services::folder_sync_snapshot::FolderSyncSnapshotService;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncConfigResult {
    pub shared_folder_path: String,
    pub device_id: String,
    pub is_enabled: bool,
    pub initialized_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncStatusResult {
    pub sync_state: String,
    pub last_checked_at: Option<String>,
    pub last_successful_sync_at: Option<String>,
    pub last_local_export_at: Option<String>,
    pub last_remote_apply_at: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncHistoryEntryResult {
    pub id: i32,
    pub event_type: String,
    pub status: String,
    pub message: String,
    pub event_id: Option<String>,
    pub source_device_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncStateResult {
    pub config: Option<FolderSyncConfigResult>,
    pub status: FolderSyncStatusResult,
    pub history: Vec<FolderSyncHistoryEntryResult>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncCommandResult {
    pub status: String,
    pub message: String,
    pub snapshot_id: Option<String>,
    pub backup_path: Option<String>,
}

fn map_config(
    config: wealthfolio_storage_sqlite::sync::FolderSyncConfigRecord,
) -> FolderSyncConfigResult {
    FolderSyncConfigResult {
        shared_folder_path: config.shared_folder_path,
        device_id: config.device_id,
        is_enabled: config.is_enabled,
        initialized_at: config.initialized_at,
        created_at: config.created_at,
        updated_at: config.updated_at,
    }
}

fn map_status(status: FolderSyncStatusRecord) -> FolderSyncStatusResult {
    FolderSyncStatusResult {
        sync_state: status.sync_state,
        last_checked_at: status.last_checked_at,
        last_successful_sync_at: status.last_successful_sync_at,
        last_local_export_at: status.last_local_export_at,
        last_remote_apply_at: status.last_remote_apply_at,
        last_error: status.last_error,
        updated_at: status.updated_at,
    }
}

fn map_history(entry: FolderSyncHistoryEntryRecord) -> FolderSyncHistoryEntryResult {
    FolderSyncHistoryEntryResult {
        id: entry.id,
        event_type: entry.event_type,
        status: entry.status,
        message: entry.message,
        event_id: entry.event_id,
        source_device_id: entry.source_device_id,
        created_at: entry.created_at,
    }
}

pub(crate) fn get_folder_sync_state_internal(
    folder_sync_repository: Arc<FolderSyncRepository>,
) -> Result<FolderSyncStateResult, String> {
    Ok(FolderSyncStateResult {
        config: folder_sync_repository
            .get_config()
            .map_err(|err| err.to_string())?
            .map(map_config),
        status: map_status(
            folder_sync_repository
                .get_status()
                .map_err(|err| err.to_string())?,
        ),
        history: folder_sync_repository
            .list_recent_history(20)
            .map_err(|err| err.to_string())?
            .into_iter()
            .map(map_history)
            .collect(),
    })
}

pub(crate) async fn initialize_folder_sync_internal(
    app_sync_repository: Arc<AppSyncRepository>,
    folder_sync_repository: Arc<FolderSyncRepository>,
    settings_repository: Arc<SettingsRepository>,
    app_data_dir: PathBuf,
    shared_folder_path: String,
    device_id: Option<String>,
) -> Result<FolderSyncCommandResult, String> {
    let existing = folder_sync_repository
        .get_config()
        .map_err(|err| err.to_string())?;
    let device_id = device_id
        .or_else(|| existing.as_ref().map(|config| config.device_id.clone()))
        .unwrap_or_else(|| Uuid::now_v7().to_string());
    let now = Utc::now().to_rfc3339();

    folder_sync_repository
        .upsert_config(
            shared_folder_path.clone(),
            device_id.clone(),
            true,
            Some(now.clone()),
            now.clone(),
        )
        .await
        .map_err(|err| err.to_string())?;
    FolderSyncFsService::new(PathBuf::from(&shared_folder_path)).initialize_folder(
        &device_id,
        &FolderSyncMetadataV1 {
            version: FOLDER_SYNC_VERSION_V1,
            created_at: now.clone(),
            created_by_device_id: device_id.clone(),
        },
    )?;

    let snapshot = FolderSyncSnapshotService::new(
        app_sync_repository,
        folder_sync_repository,
        settings_repository,
        FolderSyncFsService::new(PathBuf::from(&shared_folder_path)),
        app_data_dir,
        device_id,
    )
    .export_snapshot()
    .await?;

    Ok(FolderSyncCommandResult {
        status: "initialized".to_string(),
        message: "Folder sync initialized".to_string(),
        snapshot_id: Some(snapshot.snapshot_id),
        backup_path: None,
    })
}

pub(crate) async fn join_folder_sync_internal(
    app_sync_repository: Arc<AppSyncRepository>,
    folder_sync_repository: Arc<FolderSyncRepository>,
    settings_repository: Arc<SettingsRepository>,
    app_data_dir: PathBuf,
    shared_folder_path: String,
    device_id: Option<String>,
) -> Result<FolderSyncCommandResult, String> {
    let existing = folder_sync_repository
        .get_config()
        .map_err(|err| err.to_string())?;
    let device_id = device_id
        .or_else(|| existing.as_ref().map(|config| config.device_id.clone()))
        .unwrap_or_else(|| Uuid::now_v7().to_string());
    let now = Utc::now().to_rfc3339();

    folder_sync_repository
        .upsert_config(
            shared_folder_path.clone(),
            device_id.clone(),
            true,
            Some(now.clone()),
            now.clone(),
        )
        .await
        .map_err(|err| err.to_string())?;
    FolderSyncFsService::new(PathBuf::from(&shared_folder_path)).initialize_folder(
        &device_id,
        &FolderSyncMetadataV1 {
            version: FOLDER_SYNC_VERSION_V1,
            created_at: now,
            created_by_device_id: device_id.clone(),
        },
    )?;

    let result = FolderSyncSnapshotService::new(
        app_sync_repository,
        folder_sync_repository,
        settings_repository,
        FolderSyncFsService::new(PathBuf::from(&shared_folder_path)),
        app_data_dir,
        device_id,
    )
    .join_from_latest_snapshot()
    .await?;

    Ok(FolderSyncCommandResult {
        status: "joined".to_string(),
        message: "Joined existing shared folder".to_string(),
        snapshot_id: Some(result.snapshot_id),
        backup_path: result.backup_path,
    })
}

pub(crate) async fn retry_folder_sync_now_internal(
    app_sync_repository: Arc<AppSyncRepository>,
    folder_sync_repository: Arc<FolderSyncRepository>,
) -> Result<FolderSyncCommandResult, String> {
    let config = folder_sync_repository
        .get_config()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Folder sync is not configured".to_string())?;
    if !config.is_enabled {
        return Err("Folder sync is disabled".to_string());
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
    let import_result = importer.import_remote_events().await?;
    let export_result = exporter.export_pending_events(100).await?;

    Ok(FolderSyncCommandResult {
        status: "ok".to_string(),
        message: format!(
            "Imported {} and exported {} event(s)",
            import_result.applied_event_ids.len(),
            export_result.exported_event_ids.len()
        ),
        snapshot_id: None,
        backup_path: None,
    })
}

pub(crate) async fn disable_folder_sync_internal(
    folder_sync_repository: Arc<FolderSyncRepository>,
) -> Result<FolderSyncCommandResult, String> {
    let config = folder_sync_repository
        .get_config()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Folder sync is not configured".to_string())?;
    let now = Utc::now().to_rfc3339();
    folder_sync_repository
        .upsert_config(
            config.shared_folder_path,
            config.device_id,
            false,
            config.initialized_at,
            now.clone(),
        )
        .await
        .map_err(|err| err.to_string())?;
    folder_sync_repository
        .update_status(FolderSyncStatusUpdate {
            sync_state: Some("idle".to_string()),
            last_error: Some(None),
            updated_at: Some(now),
            ..Default::default()
        })
        .await
        .map_err(|err| err.to_string())?;

    Ok(FolderSyncCommandResult {
        status: "disabled".to_string(),
        message: "Folder sync disabled".to_string(),
        snapshot_id: None,
        backup_path: None,
    })
}

#[tauri::command]
pub async fn get_folder_sync_state(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<FolderSyncStateResult, String> {
    get_folder_sync_state_internal(state.folder_sync_repository())
}

#[tauri::command]
pub async fn initialize_folder_sync(
    shared_folder_path: String,
    device_id: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<FolderSyncCommandResult, String> {
    initialize_folder_sync_internal(
        state.app_sync_repository(),
        state.folder_sync_repository(),
        state.settings_repository(),
        PathBuf::from(state.app_data_dir()),
        shared_folder_path,
        device_id,
    )
    .await
}

#[tauri::command]
pub async fn join_folder_sync(
    shared_folder_path: String,
    device_id: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<FolderSyncCommandResult, String> {
    join_folder_sync_internal(
        state.app_sync_repository(),
        state.folder_sync_repository(),
        state.settings_repository(),
        PathBuf::from(state.app_data_dir()),
        shared_folder_path,
        device_id,
    )
    .await
}

#[tauri::command]
pub async fn retry_folder_sync_now(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<FolderSyncCommandResult, String> {
    retry_folder_sync_now_internal(state.app_sync_repository(), state.folder_sync_repository())
        .await
}

#[tauri::command]
pub async fn disable_folder_sync(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<FolderSyncCommandResult, String> {
    disable_folder_sync_internal(state.folder_sync_repository()).await
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::sync::Arc;

    use diesel::prelude::*;
    use tempfile::tempdir;
    use wealthfolio_core::settings::SettingsRepositoryTrait;
    use wealthfolio_core::sync::{
        FolderSyncEventFileV1, SyncEntity, SyncOperation, FOLDER_SYNC_VERSION_V1,
    };
    use wealthfolio_storage_sqlite::db::{self, write_actor};
    use wealthfolio_storage_sqlite::schema::platforms;
    use wealthfolio_storage_sqlite::settings::SettingsRepository;
    use wealthfolio_storage_sqlite::sync::{AppSyncRepository, FolderSyncRepository};

    use crate::commands::folder_sync::{
        disable_folder_sync_internal, get_folder_sync_state_internal,
        initialize_folder_sync_internal, join_folder_sync_internal, retry_folder_sync_now_internal,
    };
    use crate::services::folder_sync_fs::FolderSyncFsService;
    use crate::services::folder_sync_snapshot::FolderSyncSnapshotService;

    struct CommandTestDevice {
        app_data_dir: PathBuf,
        pool: Arc<wealthfolio_storage_sqlite::DbPool>,
        app_sync_repository: Arc<AppSyncRepository>,
        folder_sync_repository: Arc<FolderSyncRepository>,
        settings_repository: Arc<SettingsRepository>,
        fs_service: FolderSyncFsService,
        local_device_id: String,
    }

    async fn setup_device(
        root: &Path,
        app_dir_name: &str,
        device_id: &str,
        shared_root: &Path,
    ) -> CommandTestDevice {
        let app_data_dir = root.join(app_dir_name);
        std::fs::create_dir_all(&app_data_dir).expect("create app-data");
        let db_path = db::init(app_data_dir.to_str().expect("app-data str")).expect("init db");
        db::run_migrations(&db_path).expect("run migrations");
        let pool = db::create_pool(&db_path).expect("create pool");
        let writer = write_actor::spawn_writer(pool.as_ref().clone());
        let app_sync_repository = Arc::new(AppSyncRepository::new(pool.clone(), writer.clone()));
        let folder_sync_repository =
            Arc::new(FolderSyncRepository::new(pool.clone(), writer.clone()));
        let settings_repository = Arc::new(SettingsRepository::new(pool.clone(), writer.clone()));

        CommandTestDevice {
            app_data_dir,
            pool,
            app_sync_repository,
            folder_sync_repository,
            settings_repository,
            fs_service: FolderSyncFsService::new(shared_root.to_path_buf()),
            local_device_id: device_id.to_string(),
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
    async fn initialize_command_saves_config_and_exports_initial_snapshot() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let device = setup_device(root.path(), "device-a", "device-a", &shared_root).await;

        let result = initialize_folder_sync_internal(
            device.app_sync_repository.clone(),
            device.folder_sync_repository.clone(),
            device.settings_repository.clone(),
            device.app_data_dir.clone(),
            shared_root.to_string_lossy().into_owned(),
            Some(device.local_device_id.clone()),
        )
        .await
        .expect("initialize folder sync");

        assert_eq!(result.status, "initialized");
        let config = device
            .folder_sync_repository
            .get_config()
            .expect("get config")
            .expect("config");
        assert!(config.is_enabled);
        assert!(shared_root.join("folder.json").exists());
        assert!(!device
            .fs_service
            .list_snapshots()
            .expect("list snapshots")
            .is_empty());
    }

    #[tokio::test]
    async fn join_command_restores_from_existing_snapshot() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let source = setup_device(root.path(), "source-app", "device-a", &shared_root).await;
        let target = setup_device(root.path(), "target-app", "device-b", &shared_root).await;

        source
            .settings_repository
            .update_setting("base_currency", "USD")
            .await
            .expect("set base currency");
        source
            .app_sync_repository
            .apply_remote_event_lww(
                SyncEntity::Platform,
                "platform-command-join".to_string(),
                SyncOperation::Create,
                "evt-command-join".to_string(),
                "2026-03-07T17:00:00Z".to_string(),
                1,
                serde_json::json!({
                    "id": "platform-command-join",
                    "name": "Command Join",
                    "url": "https://broker.example/command-join",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/command-join",
                    "logo_url": serde_json::Value::Null
                }),
            )
            .await
            .expect("seed snapshot row");
        FolderSyncSnapshotService::new(
            source.app_sync_repository.clone(),
            source.folder_sync_repository.clone(),
            source.settings_repository.clone(),
            source.fs_service.clone(),
            source.app_data_dir.clone(),
            source.local_device_id.clone(),
        )
        .export_snapshot()
        .await
        .expect("export snapshot");

        let result = join_folder_sync_internal(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
            target.settings_repository.clone(),
            target.app_data_dir.clone(),
            shared_root.to_string_lossy().into_owned(),
            Some(target.local_device_id.clone()),
        )
        .await
        .expect("join folder sync");

        assert_eq!(result.status, "joined");
        assert_eq!(
            load_platform_name(&target.pool, "platform-command-join").as_deref(),
            Some("Command Join")
        );
    }

    #[tokio::test]
    async fn retry_command_runs_import_cycle_immediately() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let source = setup_device(root.path(), "source-app", "device-a", &shared_root).await;
        let target = setup_device(root.path(), "target-app", "device-b", &shared_root).await;

        initialize_folder_sync_internal(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
            target.settings_repository.clone(),
            target.app_data_dir.clone(),
            shared_root.to_string_lossy().into_owned(),
            Some(target.local_device_id.clone()),
        )
        .await
        .expect("initialize target");

        source
            .fs_service
            .write_event_file(&FolderSyncEventFileV1 {
                version: FOLDER_SYNC_VERSION_V1,
                event_id: "evt-command-retry".to_string(),
                device_id: "device-a".to_string(),
                entity: SyncEntity::Platform,
                entity_id: "platform-command-retry".to_string(),
                op: SyncOperation::Create,
                client_timestamp: "2026-03-07T17:05:00Z".to_string(),
                payload: serde_json::json!({
                    "id": "platform-command-retry",
                    "name": "Command Retry",
                    "url": "https://broker.example/command-retry",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/command-retry",
                    "logo_url": serde_json::Value::Null
                }),
                schema_version: Some(FOLDER_SYNC_VERSION_V1),
                app_version: Some("3.0.0".to_string()),
            })
            .expect("write event");

        let result = retry_folder_sync_now_internal(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
        )
        .await
        .expect("retry now");

        assert_eq!(result.status, "ok");
        assert_eq!(
            load_platform_name(&target.pool, "platform-command-retry").as_deref(),
            Some("Command Retry")
        );
    }

    #[tokio::test]
    async fn disable_command_marks_config_disabled() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let device = setup_device(root.path(), "device-a", "device-a", &shared_root).await;

        initialize_folder_sync_internal(
            device.app_sync_repository.clone(),
            device.folder_sync_repository.clone(),
            device.settings_repository.clone(),
            device.app_data_dir.clone(),
            shared_root.to_string_lossy().into_owned(),
            Some(device.local_device_id.clone()),
        )
        .await
        .expect("initialize");

        disable_folder_sync_internal(device.folder_sync_repository.clone())
            .await
            .expect("disable");

        let config = device
            .folder_sync_repository
            .get_config()
            .expect("get config")
            .expect("config");
        assert!(!config.is_enabled);
    }

    #[tokio::test]
    async fn state_command_returns_config_status_and_history() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let device = setup_device(root.path(), "device-a", "device-a", &shared_root).await;

        initialize_folder_sync_internal(
            device.app_sync_repository.clone(),
            device.folder_sync_repository.clone(),
            device.settings_repository.clone(),
            device.app_data_dir.clone(),
            shared_root.to_string_lossy().into_owned(),
            Some(device.local_device_id.clone()),
        )
        .await
        .expect("initialize");

        let state = get_folder_sync_state_internal(device.folder_sync_repository.clone())
            .expect("get state");
        assert!(state.config.is_some());
        assert!(!state.history.is_empty());
        assert!(!state.status.sync_state.is_empty());
    }
}
