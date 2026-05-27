CREATE TABLE target_allocation_plan (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE target_allocation_nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT NULL REFERENCES target_allocation_nodes(id) ON DELETE CASCADE,
  node_kind TEXT NOT NULL CHECK (node_kind IN ('FOLDER', 'ASSET')),
  name TEXT NOT NULL,
  target_percent TEXT NULL,
  asset_id TEXT NULL,
  cash_currency TEXT NULL,
  color TEXT NULL,
  icon TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (node_kind = 'FOLDER' AND asset_id IS NULL AND cash_currency IS NULL)
    OR
    (node_kind = 'ASSET' AND (asset_id IS NOT NULL OR cash_currency IS NOT NULL))
  )
);

CREATE INDEX idx_target_allocation_nodes_parent
  ON target_allocation_nodes(parent_id, sort_order);

CREATE TABLE target_allocation_account_defaults (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  folder_node_id TEXT NOT NULL REFERENCES target_allocation_nodes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE target_allocation_attributions (
  subject_key TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('POSITION', 'CASH', 'STANDALONE_ASSET')),
  folder_node_id TEXT NOT NULL REFERENCES target_allocation_nodes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE target_allocation_exclusions (
  subject_key TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('POSITION', 'CASH', 'STANDALONE_ASSET')),
  created_at TEXT NOT NULL
);
