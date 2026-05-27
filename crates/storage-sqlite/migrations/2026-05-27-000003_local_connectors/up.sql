CREATE TABLE external_connections (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    display_name TEXT NOT NULL,
    environment TEXT NOT NULL,
    owner_name TEXT,
    status TEXT NOT NULL,
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_external_connections_provider
    ON external_connections(provider);

CREATE TABLE external_account_links (
    id TEXT PRIMARY KEY NOT NULL,
    connection_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    remote_account_id TEXT NOT NULL,
    local_account_id TEXT NOT NULL,
    remote_account_number_masked TEXT,
    remote_account_type TEXT,
    linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_from_date DATE NOT NULL,
    sync_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata_json TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES external_connections(id) ON DELETE CASCADE,
    FOREIGN KEY (local_account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_external_account_links_connection
    ON external_account_links(connection_id);

CREATE INDEX idx_external_account_links_local_account
    ON external_account_links(local_account_id);

CREATE UNIQUE INDEX idx_external_account_links_active_remote
    ON external_account_links(connection_id, remote_account_id)
    WHERE status = 'ACTIVE';
