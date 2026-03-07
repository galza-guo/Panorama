//! Snapshot export and join/restore flows for folder sync.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use uuid::Uuid;
use wealthfolio_core::settings::SettingsRepositoryTrait;
use wealthfolio_core::sync::{
    is_shared_setting_key, FolderSyncSnapshotManifestV1, APP_SYNC_TABLES, FOLDER_SYNC_VERSION_V1,
};
use wealthfolio_storage_sqlite::db;
use wealthfolio_storage_sqlite::sync::{AppSyncRepository, FolderSyncRepository};

use crate::services::folder_sync_fs::{FolderSyncFsService, FolderSyncSnapshotFileRef};
use crate::services::folder_sync_importer::{FolderSyncImportResult, FolderSyncImporter};

#[derive(Debug, Clone)]
pub struct FolderSyncSnapshotExportResult {
    pub snapshot_id: String,
    pub snapshot_ref: FolderSyncSnapshotFileRef,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSyncJoinResult {
    pub snapshot_id: String,
    pub backup_path: Option<String>,
    pub import_result: FolderSyncImportResult,
}

struct LoadedSnapshot {
    snapshot_ref: FolderSyncSnapshotFileRef,
    manifest: FolderSyncSnapshotManifestV1,
}

pub struct FolderSyncSnapshotService {
    app_sync_repository: Arc<AppSyncRepository>,
    folder_sync_repository: Arc<FolderSyncRepository>,
    settings_repository: Arc<dyn SettingsRepositoryTrait>,
    fs_service: FolderSyncFsService,
    app_data_dir: PathBuf,
    local_device_id: String,
}

impl FolderSyncSnapshotService {
    pub fn new(
        app_sync_repository: Arc<AppSyncRepository>,
        folder_sync_repository: Arc<FolderSyncRepository>,
        settings_repository: Arc<dyn SettingsRepositoryTrait>,
        fs_service: FolderSyncFsService,
        app_data_dir: PathBuf,
        local_device_id: String,
    ) -> Self {
        Self {
            app_sync_repository,
            folder_sync_repository,
            settings_repository,
            fs_service,
            app_data_dir,
            local_device_id,
        }
    }

    pub async fn export_snapshot(&self) -> Result<FolderSyncSnapshotExportResult, String> {
        let snapshot_id = Uuid::now_v7().to_string();
        let created_at = Utc::now().to_rfc3339();
        let sqlite_bytes = self
            .app_sync_repository
            .export_snapshot_sqlite_image(Vec::new())
            .await
            .map_err(|err| err.to_string())?;
        let manifest = FolderSyncSnapshotManifestV1 {
            version: FOLDER_SYNC_VERSION_V1,
            snapshot_id: snapshot_id.clone(),
            device_id: self.local_device_id.clone(),
            created_at: created_at.clone(),
            tables: APP_SYNC_TABLES.iter().map(|value| value.to_string()).collect(),
            latest_event_id: self
                .app_sync_repository
                .latest_known_event_id()
                .map_err(|err| err.to_string())?,
            shared_settings: self.collect_shared_settings()?,
        };
        let snapshot_ref = self
            .fs_service
            .write_snapshot(&manifest, &sqlite_bytes)?;
        self.folder_sync_repository
            .append_history(
                "snapshot_export".to_string(),
                "success".to_string(),
                format!("Exported snapshot '{}'", snapshot_id),
                manifest.latest_event_id.clone(),
                Some(self.local_device_id.clone()),
                created_at,
            )
            .await
            .map_err(|err| err.to_string())?;

        Ok(FolderSyncSnapshotExportResult {
            snapshot_id,
            snapshot_ref,
        })
    }

    pub async fn join_from_latest_snapshot(&self) -> Result<FolderSyncJoinResult, String> {
        let latest_snapshot = self.load_latest_snapshot()?;
        let backup_path = self.backup_if_local_shared_data_exists()?;
        self.app_sync_repository
            .restore_snapshot_tables_from_file(
                latest_snapshot
                    .snapshot_ref
                    .db_path
                    .to_string_lossy()
                    .into_owned(),
                latest_snapshot.manifest.tables.clone(),
                0,
                self.local_device_id.clone(),
                None,
            )
            .await
            .map_err(|err| err.to_string())?;
        self.apply_shared_settings(&latest_snapshot.manifest).await?;

        let importer = FolderSyncImporter::new(
            self.app_sync_repository.clone(),
            self.folder_sync_repository.clone(),
            self.fs_service.clone(),
            self.local_device_id.clone(),
        );
        let import_result = importer
            .import_remote_events_after(latest_snapshot.manifest.latest_event_id.as_deref())
            .await?;
        self.folder_sync_repository
            .append_history(
                "snapshot_join".to_string(),
                "success".to_string(),
                format!(
                    "Joined snapshot '{}' with {} imported event(s)",
                    latest_snapshot.manifest.snapshot_id,
                    import_result.applied_event_ids.len()
                ),
                latest_snapshot.manifest.latest_event_id.clone(),
                Some(latest_snapshot.manifest.device_id.clone()),
                Utc::now().to_rfc3339(),
            )
            .await
            .map_err(|err| err.to_string())?;

        Ok(FolderSyncJoinResult {
            snapshot_id: latest_snapshot.manifest.snapshot_id,
            backup_path,
            import_result,
        })
    }

    fn load_latest_snapshot(&self) -> Result<LoadedSnapshot, String> {
        let snapshots = self.fs_service.list_snapshots()?;
        let mut loaded = Vec::with_capacity(snapshots.len());
        for snapshot_ref in snapshots {
            let manifest = self.read_manifest(&snapshot_ref.manifest_path)?;
            loaded.push(LoadedSnapshot {
                snapshot_ref,
                manifest,
            });
        }

        loaded
            .into_iter()
            .max_by(|left, right| compare_snapshot_recency(&left.manifest, &right.manifest))
            .ok_or_else(|| "No folder sync snapshot is available".to_string())
    }

    fn read_manifest(&self, path: &Path) -> Result<FolderSyncSnapshotManifestV1, String> {
        serde_json::from_slice(
            &fs::read(path).map_err(|err| format!("Failed to read snapshot manifest: {err}"))?,
        )
        .map_err(|err| format!("Failed to parse snapshot manifest '{}': {err}", path.display()))
    }

    fn backup_if_local_shared_data_exists(&self) -> Result<Option<String>, String> {
        let summary = self
            .app_sync_repository
            .get_local_sync_data_summary()
            .map_err(|err| err.to_string())?;
        if summary.total_rows == 0 {
            return Ok(None);
        }

        db::backup_database(self.app_data_dir.to_string_lossy().as_ref())
            .map(Some)
            .map_err(|err| err.to_string())
    }

    fn collect_shared_settings(&self) -> Result<Option<BTreeMap<String, String>>, String> {
        let mut settings = BTreeMap::new();
        for key in ["base_currency"] {
            if !is_shared_setting_key(key) {
                continue;
            }
            let value = self
                .settings_repository
                .get_setting(key)
                .map_err(|err| err.to_string())?;
            if !value.trim().is_empty() {
                settings.insert(key.to_string(), value);
            }
        }

        if settings.is_empty() {
            Ok(None)
        } else {
            Ok(Some(settings))
        }
    }

    async fn apply_shared_settings(
        &self,
        manifest: &FolderSyncSnapshotManifestV1,
    ) -> Result<(), String> {
        let Some(shared_settings) = manifest.shared_settings.as_ref() else {
            return Ok(());
        };

        for (key, value) in shared_settings {
            if !is_shared_setting_key(key) {
                continue;
            }
            self.settings_repository
                .update_setting(key, value)
                .await
                .map_err(|err| err.to_string())?;
        }
        Ok(())
    }
}

fn compare_snapshot_recency(
    left: &FolderSyncSnapshotManifestV1,
    right: &FolderSyncSnapshotManifestV1,
) -> std::cmp::Ordering {
    let left_created_at = DateTime::parse_from_rfc3339(&left.created_at)
        .map(|timestamp| timestamp.with_timezone(&Utc));
    let right_created_at = DateTime::parse_from_rfc3339(&right.created_at)
        .map(|timestamp| timestamp.with_timezone(&Utc));

    match (left_created_at, right_created_at) {
        (Ok(left_ts), Ok(right_ts)) => left_ts
            .cmp(&right_ts)
            .then_with(|| left.snapshot_id.cmp(&right.snapshot_id)),
        _ => left
            .created_at
            .cmp(&right.created_at)
            .then_with(|| left.snapshot_id.cmp(&right.snapshot_id)),
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::sync::Arc;

    use diesel::prelude::*;
    use tempfile::tempdir;
    use wealthfolio_core::settings::SettingsRepositoryTrait;
    use wealthfolio_core::sync::{
        FolderSyncEventFileV1, FolderSyncSnapshotManifestV1, SyncEntity, SyncOperation,
        FOLDER_SYNC_VERSION_V1,
    };
    use wealthfolio_storage_sqlite::db::{self, write_actor};
    use wealthfolio_storage_sqlite::schema::platforms;
    use wealthfolio_storage_sqlite::settings::SettingsRepository;
    use wealthfolio_storage_sqlite::sync::{AppSyncRepository, FolderSyncRepository};

    use crate::services::folder_sync_fs::FolderSyncFsService;
    use super::FolderSyncSnapshotService;

    struct SnapshotTestDevice {
        app_data_dir: PathBuf,
        pool: Arc<wealthfolio_storage_sqlite::DbPool>,
        app_sync_repository: Arc<AppSyncRepository>,
        folder_sync_repository: Arc<FolderSyncRepository>,
        settings_repository: Arc<SettingsRepository>,
        fs_service: FolderSyncFsService,
        shared_root: PathBuf,
        local_device_id: String,
    }

    async fn setup_device(
        root: &Path,
        app_dir_name: &str,
        device_id: &str,
        shared_root: &Path,
    ) -> SnapshotTestDevice {
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

        SnapshotTestDevice {
            app_data_dir,
            pool,
            app_sync_repository,
            folder_sync_repository,
            settings_repository,
            fs_service: FolderSyncFsService::new(shared_root.to_path_buf()),
            shared_root: shared_root.to_path_buf(),
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
    async fn exports_shared_snapshot_into_device_snapshot_directory() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let device = setup_device(root.path(), "device-a", "device-a", &shared_root).await;
        device
            .settings_repository
            .update_setting("base_currency", "USD")
            .await
            .expect("set base currency");
        device
            .app_sync_repository
            .apply_remote_event_lww(
                SyncEntity::Platform,
                "platform-snapshot-1".to_string(),
                SyncOperation::Create,
                "evt-snapshot-1".to_string(),
                "2026-03-07T14:00:00Z".to_string(),
                1,
                serde_json::json!({
                    "id": "platform-snapshot-1",
                    "name": "Snapshot Platform",
                    "url": "https://broker.example/snapshot",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/snapshot",
                    "logo_url": serde_json::Value::Null
                }),
            )
            .await
            .expect("seed platform");

        let service = FolderSyncSnapshotService::new(
            device.app_sync_repository.clone(),
            device.folder_sync_repository.clone(),
            device.settings_repository.clone(),
            device.fs_service.clone(),
            device.app_data_dir.clone(),
            device.local_device_id.clone(),
        );
        let result = service.export_snapshot().await.expect("export snapshot");

        assert!(result.snapshot_ref.db_path.exists());
        let manifest: FolderSyncSnapshotManifestV1 = serde_json::from_slice(
            &std::fs::read(&result.snapshot_ref.manifest_path).expect("read manifest"),
        )
        .expect("parse manifest");
        assert_eq!(manifest.device_id, "device-a");
        assert_eq!(manifest.latest_event_id.as_deref(), Some("evt-snapshot-1"));
        assert_eq!(
            manifest
                .shared_settings
                .as_ref()
                .and_then(|settings| settings.get("base_currency"))
                .map(String::as_str),
            Some("USD")
        );
    }

    #[tokio::test]
    async fn restores_from_newest_snapshot_and_imports_later_events_into_clean_database() {
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
                "platform-shared-1".to_string(),
                SyncOperation::Create,
                "evt-snapshot-base".to_string(),
                "2026-03-07T14:00:00Z".to_string(),
                1,
                serde_json::json!({
                    "id": "platform-shared-1",
                    "name": "Older Snapshot",
                    "url": "https://broker.example/older",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/older",
                    "logo_url": serde_json::Value::Null
                }),
            )
            .await
            .expect("seed older platform");
        let source_service = FolderSyncSnapshotService::new(
            source.app_sync_repository.clone(),
            source.folder_sync_repository.clone(),
            source.settings_repository.clone(),
            source.fs_service.clone(),
            source.app_data_dir.clone(),
            source.local_device_id.clone(),
        );
        source_service
            .export_snapshot()
            .await
            .expect("export older snapshot");

        source
            .app_sync_repository
            .apply_remote_event_lww(
                SyncEntity::Platform,
                "platform-shared-1".to_string(),
                SyncOperation::Update,
                "evt-snapshot-newer".to_string(),
                "2026-03-07T14:05:00Z".to_string(),
                2,
                serde_json::json!({
                    "id": "platform-shared-1",
                    "name": "Newest Snapshot",
                    "url": "https://broker.example/newer",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/newer",
                    "logo_url": serde_json::Value::Null
                }),
            )
            .await
            .expect("seed newer platform");
        let latest_snapshot = source_service
            .export_snapshot()
            .await
            .expect("export newer snapshot");

        source
            .fs_service
            .write_event_file(&FolderSyncEventFileV1 {
                version: FOLDER_SYNC_VERSION_V1,
                event_id: "evt-z-after-snapshot".to_string(),
                device_id: "device-a".to_string(),
                entity: SyncEntity::Platform,
                entity_id: "platform-shared-1".to_string(),
                op: SyncOperation::Update,
                client_timestamp: "2026-03-07T14:06:00Z".to_string(),
                payload: serde_json::json!({
                    "id": "platform-shared-1",
                    "name": "After Snapshot Event",
                    "url": "https://broker.example/after",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/after",
                    "logo_url": serde_json::Value::Null
                }),
                schema_version: Some(FOLDER_SYNC_VERSION_V1),
                app_version: Some("3.0.0".to_string()),
            })
            .expect("write later event");

        let target_service = FolderSyncSnapshotService::new(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
            target.settings_repository.clone(),
            target.fs_service.clone(),
            target.app_data_dir.clone(),
            target.local_device_id.clone(),
        );
        let join_result = target_service
            .join_from_latest_snapshot()
            .await
            .expect("join latest snapshot");

        assert_eq!(join_result.snapshot_id, latest_snapshot.snapshot_id);
        assert!(join_result.backup_path.is_none());
        assert_eq!(
            load_platform_name(&target.pool, "platform-shared-1").as_deref(),
            Some("After Snapshot Event")
        );
        assert_eq!(
            target
                .settings_repository
                .get_setting("base_currency")
                .expect("get base currency"),
            "USD"
        );
    }

    #[tokio::test]
    async fn join_creates_local_backup_before_overwriting_existing_shared_data() {
        let root = tempdir().expect("tempdir");
        let shared_root = root.path().join("PanoramaSync");
        let source = setup_device(root.path(), "source-app", "device-a", &shared_root).await;
        let target = setup_device(root.path(), "target-app", "device-b", &shared_root).await;

        source
            .settings_repository
            .update_setting("base_currency", "USD")
            .await
            .expect("set source base currency");
        source
            .app_sync_repository
            .apply_remote_event_lww(
                SyncEntity::Platform,
                "platform-join-1".to_string(),
                SyncOperation::Create,
                "evt-join-source".to_string(),
                "2026-03-07T15:00:00Z".to_string(),
                1,
                serde_json::json!({
                    "id": "platform-join-1",
                    "name": "Source Snapshot",
                    "url": "https://broker.example/source",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/source",
                    "logo_url": serde_json::Value::Null
                }),
            )
            .await
            .expect("seed source snapshot");
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
        .expect("export source snapshot");

        target
            .app_sync_repository
            .apply_remote_event_lww(
                SyncEntity::Platform,
                "platform-target-local".to_string(),
                SyncOperation::Create,
                "evt-target-local".to_string(),
                "2026-03-07T14:59:00Z".to_string(),
                1,
                serde_json::json!({
                    "id": "platform-target-local",
                    "name": "Target Local",
                    "url": "https://broker.example/target-local",
                    "external_id": serde_json::Value::Null,
                    "kind": "BROKERAGE",
                    "website_url": "https://broker.example/target-local",
                    "logo_url": serde_json::Value::Null
                }),
            )
            .await
            .expect("seed target local row");

        let join_result = FolderSyncSnapshotService::new(
            target.app_sync_repository.clone(),
            target.folder_sync_repository.clone(),
            target.settings_repository.clone(),
            target.fs_service.clone(),
            target.app_data_dir.clone(),
            target.local_device_id.clone(),
        )
        .join_from_latest_snapshot()
        .await
        .expect("join with backup");

        let backup_path = join_result.backup_path.expect("backup path");
        assert!(Path::new(&backup_path).exists(), "expected local backup file");
        assert_eq!(
            load_platform_name(&target.pool, "platform-join-1").as_deref(),
            Some("Source Snapshot")
        );
        assert_eq!(
            target
                .settings_repository
                .get_setting("base_currency")
                .expect("get base currency"),
            "USD"
        );
    }
}
