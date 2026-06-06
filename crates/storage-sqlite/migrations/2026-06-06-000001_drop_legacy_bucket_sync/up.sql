DELETE FROM sync_outbox
WHERE entity IN ('bucket', 'bucket_account_default', 'bucket_asset_assignment');

DELETE FROM sync_applied_events
WHERE entity IN ('bucket', 'bucket_account_default', 'bucket_asset_assignment');

DELETE FROM sync_entity_metadata
WHERE entity IN ('bucket', 'bucket_account_default', 'bucket_asset_assignment');

DELETE FROM sync_table_state
WHERE table_name IN (
  'buckets',
  'bucket_account_defaults',
  'bucket_asset_assignments',
  'bucket_holding_overrides'
);

DROP TABLE IF EXISTS bucket_holding_overrides;
DROP TABLE IF EXISTS bucket_asset_assignments;
DROP TABLE IF EXISTS bucket_account_defaults;
DROP TABLE IF EXISTS buckets;
