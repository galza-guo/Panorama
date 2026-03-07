CREATE TABLE folder_sync_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    shared_folder_path TEXT NOT NULL,
    device_id TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    initialized_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE folder_sync_imported_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    source_device_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    imported_at TEXT NOT NULL
);

CREATE INDEX ix_folder_sync_imported_events_source_device
    ON folder_sync_imported_events(source_device_id, imported_at);

CREATE TABLE folder_sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    event_id TEXT,
    source_device_id TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX ix_folder_sync_history_created_at
    ON folder_sync_history(created_at);

CREATE TABLE folder_sync_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sync_state TEXT NOT NULL DEFAULT 'idle',
    last_checked_at TEXT,
    last_successful_sync_at TEXT,
    last_local_export_at TEXT,
    last_remote_apply_at TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL
);

INSERT INTO folder_sync_status (id, sync_state, updated_at)
VALUES (1, 'idle', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(id) DO NOTHING;
