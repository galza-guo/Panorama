-- Buckets Module
-- Standalone user-defined bucket definitions and assignment mappings.

CREATE TABLE buckets (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#94a3b8',
    target_percent TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ix_buckets_sort_order ON buckets(sort_order);

CREATE TABLE bucket_account_defaults (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    bucket_id TEXT NOT NULL DEFAULT 'unassigned',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE SET DEFAULT
);

CREATE UNIQUE INDEX ix_bucket_account_defaults_account
    ON bucket_account_defaults(account_id);
CREATE INDEX ix_bucket_account_defaults_bucket
    ON bucket_account_defaults(bucket_id);

CREATE TABLE bucket_holding_overrides (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    bucket_id TEXT NOT NULL DEFAULT 'unassigned',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE SET DEFAULT
);

CREATE UNIQUE INDEX ix_bucket_holding_overrides_account_asset
    ON bucket_holding_overrides(account_id, asset_id);
CREATE INDEX ix_bucket_holding_overrides_bucket
    ON bucket_holding_overrides(bucket_id);

CREATE TABLE bucket_asset_assignments (
    id TEXT NOT NULL PRIMARY KEY,
    asset_id TEXT NOT NULL,
    bucket_id TEXT NOT NULL DEFAULT 'unassigned',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY (bucket_id) REFERENCES buckets(id) ON DELETE SET DEFAULT
);

CREATE UNIQUE INDEX ix_bucket_asset_assignments_asset
    ON bucket_asset_assignments(asset_id);
CREATE INDEX ix_bucket_asset_assignments_bucket
    ON bucket_asset_assignments(bucket_id);

INSERT INTO buckets (id, name, color, target_percent, sort_order, is_system)
VALUES ('unassigned', 'Unassigned', '#94a3b8', NULL, 0, 1);
