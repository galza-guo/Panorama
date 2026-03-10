DROP INDEX IF EXISTS ix_bucket_asset_assignments_bucket;
DROP INDEX IF EXISTS ix_bucket_asset_assignments_asset;
DROP TABLE IF EXISTS bucket_asset_assignments;

DROP INDEX IF EXISTS ix_bucket_holding_overrides_bucket;
DROP INDEX IF EXISTS ix_bucket_holding_overrides_account_asset;
DROP TABLE IF EXISTS bucket_holding_overrides;

DROP INDEX IF EXISTS ix_bucket_account_defaults_bucket;
DROP INDEX IF EXISTS ix_bucket_account_defaults_account;
DROP TABLE IF EXISTS bucket_account_defaults;

DROP INDEX IF EXISTS ix_buckets_sort_order;
DROP TABLE IF EXISTS buckets;
