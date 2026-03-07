//! File system service for Syncthing-backed folder sync.

use std::fs;
use std::path::{Path, PathBuf};

use wealthfolio_core::sync::{
    event_file_name, snapshot_file_name, FolderSyncEventFileV1, FolderSyncMetadataV1,
    FolderSyncSnapshotManifestV1, FOLDER_SYNC_METADATA_FILE,
};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSyncEventFileRef {
    pub device_id: String,
    pub event_id: String,
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderSyncSnapshotFileRef {
    pub device_id: String,
    pub snapshot_id: String,
    pub db_path: PathBuf,
    pub manifest_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct FolderSyncFsService {
    root: PathBuf,
}

impl FolderSyncFsService {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn initialize_folder(
        &self,
        local_device_id: &str,
        metadata: &FolderSyncMetadataV1,
    ) -> Result<(), String> {
        fs::create_dir_all(self.events_device_dir(local_device_id))
            .map_err(|err| format!("Failed to create event directory: {err}"))?;
        fs::create_dir_all(self.snapshots_device_dir(local_device_id))
            .map_err(|err| format!("Failed to create snapshot directory: {err}"))?;

        let metadata_path = self.root.join(FOLDER_SYNC_METADATA_FILE);
        if !metadata_path.exists() {
            let metadata_json = serde_json::to_vec_pretty(metadata)
                .map_err(|err| format!("Failed to serialize folder metadata: {err}"))?;
            write_new_file_atomic(&metadata_path, &metadata_json)?;
        }

        Ok(())
    }

    pub fn write_event_file(&self, event: &FolderSyncEventFileV1) -> Result<PathBuf, String> {
        let target = self
            .events_device_dir(&event.device_id)
            .join(event_file_name(&event.event_id));
        let payload = serde_json::to_vec_pretty(event)
            .map_err(|err| format!("Failed to serialize event file: {err}"))?;
        write_new_file_atomic(&target, &payload)?;
        Ok(target)
    }

    pub fn list_remote_event_files(
        &self,
        local_device_id: &str,
    ) -> Result<Vec<FolderSyncEventFileRef>, String> {
        let events_root = self.root.join("events");
        if !events_root.exists() {
            return Ok(Vec::new());
        }

        let mut refs = Vec::new();
        for entry in fs::read_dir(&events_root)
            .map_err(|err| format!("Failed to read events directory: {err}"))?
        {
            let entry = entry.map_err(|err| format!("Failed to read event device entry: {err}"))?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let device_id = entry.file_name().to_string_lossy().to_string();
            if device_id == local_device_id {
                continue;
            }

            for file in fs::read_dir(&path)
                .map_err(|err| format!("Failed to read device event directory: {err}"))?
            {
                let file = file.map_err(|err| format!("Failed to read event file entry: {err}"))?;
                let file_path = file.path();
                if !file_path.is_file() {
                    continue;
                }

                let Some(file_name) = file_path.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                let Some(event_id) = file_name.strip_suffix(".json") else {
                    continue;
                };

                refs.push(FolderSyncEventFileRef {
                    device_id: device_id.clone(),
                    event_id: event_id.to_string(),
                    path: file_path,
                });
            }
        }

        refs.sort_by(|left, right| {
            left.device_id
                .cmp(&right.device_id)
                .then_with(|| left.event_id.cmp(&right.event_id))
        });
        Ok(refs)
    }

    pub fn write_snapshot(
        &self,
        manifest: &FolderSyncSnapshotManifestV1,
        sqlite_bytes: &[u8],
    ) -> Result<FolderSyncSnapshotFileRef, String> {
        let device_dir = self.snapshots_device_dir(&manifest.device_id);
        fs::create_dir_all(&device_dir)
            .map_err(|err| format!("Failed to create snapshot device directory: {err}"))?;

        let db_path = device_dir.join(snapshot_file_name(&manifest.snapshot_id));
        let manifest_path = device_dir.join(snapshot_manifest_file_name(&manifest.snapshot_id));

        if db_path.exists() || manifest_path.exists() {
            return Err(format!(
                "Snapshot '{}' already exists for device '{}'",
                manifest.snapshot_id, manifest.device_id
            ));
        }

        write_new_file_atomic(&db_path, sqlite_bytes)?;
        let manifest_json = serde_json::to_vec_pretty(manifest)
            .map_err(|err| format!("Failed to serialize snapshot manifest: {err}"))?;
        if let Err(err) = write_new_file_atomic(&manifest_path, &manifest_json) {
            let _ = fs::remove_file(&db_path);
            return Err(err);
        }

        Ok(FolderSyncSnapshotFileRef {
            device_id: manifest.device_id.clone(),
            snapshot_id: manifest.snapshot_id.clone(),
            db_path,
            manifest_path,
        })
    }

    pub fn list_snapshots(&self) -> Result<Vec<FolderSyncSnapshotFileRef>, String> {
        let snapshots_root = self.root.join("snapshots");
        if !snapshots_root.exists() {
            return Ok(Vec::new());
        }

        let mut refs = Vec::new();
        for entry in fs::read_dir(&snapshots_root)
            .map_err(|err| format!("Failed to read snapshots directory: {err}"))?
        {
            let entry = entry.map_err(|err| format!("Failed to read snapshot device entry: {err}"))?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let device_id = entry.file_name().to_string_lossy().to_string();
            for file in fs::read_dir(&path)
                .map_err(|err| format!("Failed to read snapshot device directory: {err}"))?
            {
                let file = file.map_err(|err| format!("Failed to read snapshot file entry: {err}"))?;
                let manifest_path = file.path();
                if !manifest_path.is_file() {
                    continue;
                }

                let Some(file_name) = manifest_path.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                let Some(snapshot_id) = file_name.strip_suffix(".json") else {
                    continue;
                };

                let db_path = path.join(snapshot_file_name(snapshot_id));
                if !db_path.exists() {
                    continue;
                }

                refs.push(FolderSyncSnapshotFileRef {
                    device_id: device_id.clone(),
                    snapshot_id: snapshot_id.to_string(),
                    db_path,
                    manifest_path,
                });
            }
        }

        refs.sort_by(|left, right| {
            left.device_id
                .cmp(&right.device_id)
                .then_with(|| left.snapshot_id.cmp(&right.snapshot_id))
        });
        Ok(refs)
    }

    fn events_device_dir(&self, device_id: &str) -> PathBuf {
        self.root.join("events").join(device_id)
    }

    fn snapshots_device_dir(&self, device_id: &str) -> PathBuf {
        self.root.join("snapshots").join(device_id)
    }
}

fn snapshot_manifest_file_name(snapshot_id: &str) -> String {
    format!("{}.json", snapshot_id)
}

fn write_new_file_atomic(target: &Path, bytes: &[u8]) -> Result<(), String> {
    if target.exists() {
        return Err(format!("{} already exists", target.display()));
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create parent directory: {err}"))?;
    }

    let temp_path = target.with_extension(format!(
        "{}.tmp",
        Uuid::new_v4().simple()
    ));
    fs::write(&temp_path, bytes)
        .map_err(|err| format!("Failed to write temporary file: {err}"))?;
    fs::rename(&temp_path, target)
        .map_err(|err| format!("Failed to finalize file write: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;
    use wealthfolio_core::sync::{
        event_file_name, snapshot_file_name, FolderSyncEventFileV1, FolderSyncMetadataV1,
        FolderSyncSnapshotManifestV1, FOLDER_SYNC_VERSION_V1,
    };

    use super::{FolderSyncEventFileRef, FolderSyncFsService};
    use wealthfolio_core::sync::{SyncEntity, SyncOperation};

    fn metadata() -> FolderSyncMetadataV1 {
        FolderSyncMetadataV1 {
            version: FOLDER_SYNC_VERSION_V1,
            created_at: "2026-03-07T14:00:00.000Z".to_string(),
            created_by_device_id: "device-a".to_string(),
        }
    }

    fn event(device_id: &str, event_id: &str) -> FolderSyncEventFileV1 {
        FolderSyncEventFileV1 {
            version: FOLDER_SYNC_VERSION_V1,
            event_id: event_id.to_string(),
            device_id: device_id.to_string(),
            entity: SyncEntity::Account,
            entity_id: format!("acc-{event_id}"),
            op: SyncOperation::Update,
            client_timestamp: "2026-03-07T14:10:00.000Z".to_string(),
            payload: serde_json::json!({ "id": format!("acc-{event_id}") }),
            schema_version: Some(1),
            app_version: Some("3.0.0".to_string()),
        }
    }

    fn snapshot_manifest(device_id: &str, snapshot_id: &str) -> FolderSyncSnapshotManifestV1 {
        FolderSyncSnapshotManifestV1 {
            version: FOLDER_SYNC_VERSION_V1,
            snapshot_id: snapshot_id.to_string(),
            device_id: device_id.to_string(),
            created_at: "2026-03-07T14:20:00.000Z".to_string(),
            tables: vec!["accounts".to_string(), "assets".to_string()],
            latest_event_id: Some("evt-2".to_string()),
        }
    }

    #[test]
    fn initialize_folder_creates_expected_structure() {
        let root = tempdir().expect("tempdir");
        let service = FolderSyncFsService::new(root.path().join("PanoramaSync"));

        service
            .initialize_folder("device-a", &metadata())
            .expect("initialize folder");

        assert!(service.root().join("folder.json").exists());
        assert!(service.root().join("events/device-a").is_dir());
        assert!(service.root().join("snapshots/device-a").is_dir());
    }

    #[test]
    fn write_event_file_creates_immutable_event_file() {
        let root = tempdir().expect("tempdir");
        let service = FolderSyncFsService::new(root.path().join("PanoramaSync"));
        service
            .initialize_folder("device-a", &metadata())
            .expect("initialize folder");

        let event = event("device-a", "evt-1");
        let path = service.write_event_file(&event).expect("write event file");

        assert_eq!(
            path.file_name().and_then(|value| value.to_str()),
            Some(event_file_name("evt-1").as_str())
        );
        assert!(path.exists());

        let overwrite = service.write_event_file(&event);
        assert!(overwrite.is_err(), "event file should be immutable");
    }

    #[test]
    fn list_remote_event_files_only_returns_other_devices_sorted_by_device_and_name() {
        let root = tempdir().expect("tempdir");
        let service = FolderSyncFsService::new(root.path().join("PanoramaSync"));
        service
            .initialize_folder("device-a", &metadata())
            .expect("initialize folder");
        service
            .initialize_folder(
                "device-b",
                &FolderSyncMetadataV1 {
                    created_by_device_id: "device-b".to_string(),
                    ..metadata()
                },
            )
            .expect("initialize device-b");
        service
            .initialize_folder(
                "device-c",
                &FolderSyncMetadataV1 {
                    created_by_device_id: "device-c".to_string(),
                    ..metadata()
                },
            )
            .expect("initialize device-c");

        service
            .write_event_file(&event("device-b", "evt-2"))
            .expect("write remote event 1");
        service
            .write_event_file(&event("device-b", "evt-1"))
            .expect("write remote event 2");
        service
            .write_event_file(&event("device-c", "evt-3"))
            .expect("write remote event 3");
        service
            .write_event_file(&event("device-a", "evt-local"))
            .expect("write local event");

        let actual = service
            .list_remote_event_files("device-a")
            .expect("list remote event files");

        assert_eq!(
            actual,
            vec![
                FolderSyncEventFileRef {
                    device_id: "device-b".to_string(),
                    event_id: "evt-1".to_string(),
                    path: service.root().join("events/device-b/evt-1.json"),
                },
                FolderSyncEventFileRef {
                    device_id: "device-b".to_string(),
                    event_id: "evt-2".to_string(),
                    path: service.root().join("events/device-b/evt-2.json"),
                },
                FolderSyncEventFileRef {
                    device_id: "device-c".to_string(),
                    event_id: "evt-3".to_string(),
                    path: service.root().join("events/device-c/evt-3.json"),
                },
            ]
        );
    }

    #[test]
    fn write_snapshot_creates_db_and_manifest_and_lists_them() {
        let root = tempdir().expect("tempdir");
        let service = FolderSyncFsService::new(root.path().join("PanoramaSync"));
        service
            .initialize_folder("device-a", &metadata())
            .expect("initialize folder");

        let manifest = snapshot_manifest("device-a", "snapshot-1");
        let snapshot = service
            .write_snapshot(&manifest, b"SQLite format 3\0demo")
            .expect("write snapshot");

        assert_eq!(
            snapshot.db_path.file_name().and_then(|value| value.to_str()),
            Some(snapshot_file_name("snapshot-1").as_str())
        );
        assert!(snapshot.db_path.exists());
        assert!(snapshot.manifest_path.exists());

        let snapshots = service.list_snapshots().expect("list snapshots");
        assert_eq!(snapshots, vec![snapshot]);
    }

    #[test]
    fn write_snapshot_refuses_to_overwrite_existing_files() {
        let root = tempdir().expect("tempdir");
        let service = FolderSyncFsService::new(root.path().join("PanoramaSync"));
        service
            .initialize_folder("device-a", &metadata())
            .expect("initialize folder");

        let manifest = snapshot_manifest("device-a", "snapshot-1");
        service
            .write_snapshot(&manifest, b"SQLite format 3\0demo")
            .expect("write snapshot");

        let err = service
            .write_snapshot(&manifest, b"SQLite format 3\0demo")
            .expect_err("snapshot overwrite should fail");
        assert!(
            err.contains("already exists"),
            "expected immutable overwrite error, got {err}"
        );
    }

    #[test]
    fn write_event_and_snapshot_files_are_real_files() {
        let root = tempdir().expect("tempdir");
        let service = FolderSyncFsService::new(root.path().join("PanoramaSync"));
        service
            .initialize_folder("device-a", &metadata())
            .expect("initialize folder");

        let event_path = service
            .write_event_file(&event("device-a", "evt-1"))
            .expect("write event");
        let snapshot = service
            .write_snapshot(&snapshot_manifest("device-a", "snapshot-1"), b"SQLite format 3\0demo")
            .expect("write snapshot");

        assert!(fs::metadata(event_path).expect("event metadata").is_file());
        assert!(fs::metadata(snapshot.db_path).expect("db metadata").is_file());
        assert!(fs::metadata(snapshot.manifest_path).expect("manifest metadata").is_file());
    }
}
