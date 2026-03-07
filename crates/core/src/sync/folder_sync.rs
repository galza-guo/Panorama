//! Versioned contracts for folder-based sync transport.

use serde::{Deserialize, Serialize};

use super::{SyncEntity, SyncOperation};

pub const FOLDER_SYNC_VERSION_V1: i32 = 1;
pub const FOLDER_SYNC_METADATA_FILE: &str = "folder.json";
pub const FOLDER_SYNC_SHARED_SETTING_KEYS: [&str; 1] = ["base_currency"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncMetadataV1 {
    pub version: i32,
    pub created_at: String,
    pub created_by_device_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncEventFileV1 {
    pub version: i32,
    pub event_id: String,
    pub device_id: String,
    pub entity: SyncEntity,
    pub entity_id: String,
    pub op: SyncOperation,
    pub client_timestamp: String,
    pub payload: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSyncSnapshotManifestV1 {
    pub version: i32,
    pub snapshot_id: String,
    pub device_id: String,
    pub created_at: String,
    pub tables: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_event_id: Option<String>,
}

pub fn event_file_name(event_id: &str) -> String {
    format!("{}.json", event_id)
}

pub fn snapshot_file_name(snapshot_id: &str) -> String {
    format!("{}.db", snapshot_id)
}

pub fn is_shared_setting_key(key: &str) -> bool {
    FOLDER_SYNC_SHARED_SETTING_KEYS.contains(&key)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        event_file_name, is_shared_setting_key, snapshot_file_name, FolderSyncEventFileV1,
        FolderSyncMetadataV1, FOLDER_SYNC_METADATA_FILE, FOLDER_SYNC_VERSION_V1,
    };
    use crate::sync::{SyncEntity, SyncOperation};

    #[test]
    fn parses_folder_metadata_from_json() {
        let parsed: FolderSyncMetadataV1 = serde_json::from_str(
            r#"{
                "version": 1,
                "createdAt": "2026-03-07T13:00:00.000Z",
                "createdByDeviceId": "device-a"
            }"#,
        )
        .expect("parse folder metadata");

        assert_eq!(parsed.version, FOLDER_SYNC_VERSION_V1);
        assert_eq!(parsed.created_at, "2026-03-07T13:00:00.000Z");
        assert_eq!(parsed.created_by_device_id, "device-a");
        assert_eq!(FOLDER_SYNC_METADATA_FILE, "folder.json");
    }

    #[test]
    fn event_file_name_uses_json_extension() {
        assert_eq!(event_file_name("evt-123"), "evt-123.json");
    }

    #[test]
    fn snapshot_file_name_uses_db_extension() {
        assert_eq!(snapshot_file_name("snapshot-123"), "snapshot-123.db");
    }

    #[test]
    fn event_serialization_shape_matches_contract() {
        let event = FolderSyncEventFileV1 {
            version: FOLDER_SYNC_VERSION_V1,
            event_id: "evt-123".to_string(),
            device_id: "device-a".to_string(),
            entity: SyncEntity::Account,
            entity_id: "acc-123".to_string(),
            op: SyncOperation::Update,
            client_timestamp: "2026-03-07T13:10:00.000Z".to_string(),
            payload: json!({ "id": "acc-123", "name": "Cash" }),
            schema_version: Some(1),
            app_version: Some("3.0.0".to_string()),
        };

        let actual = serde_json::to_value(event).expect("serialize event");
        assert_eq!(
            actual,
            json!({
                "version": 1,
                "eventId": "evt-123",
                "deviceId": "device-a",
                "entity": "account",
                "entityId": "acc-123",
                "op": "update",
                "clientTimestamp": "2026-03-07T13:10:00.000Z",
                "payload": { "id": "acc-123", "name": "Cash" },
                "schemaVersion": 1,
                "appVersion": "3.0.0"
            })
        );
    }

    #[test]
    fn shared_setting_allowlist_only_exposes_shared_values() {
        assert!(is_shared_setting_key("base_currency"));
        assert!(!is_shared_setting_key("instance_id"));
        assert!(!is_shared_setting_key("theme"));
        assert!(!is_shared_setting_key("font"));
        assert!(!is_shared_setting_key("menu_bar_visible"));
        assert!(!is_shared_setting_key("sync_enabled"));
    }
}
