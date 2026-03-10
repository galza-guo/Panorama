use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

use wealthfolio_core::buckets::{
    Bucket, BucketAccountDefault, BucketAssetAssignment, BucketHoldingOverride,
    BucketRepositoryTrait, NewBucket, NewBucketAccountDefault, NewBucketAssetAssignment,
    NewBucketHoldingOverride, UNASSIGNED_BUCKET_ID,
};
use wealthfolio_core::Result;

use super::model::{
    BucketAccountDefaultDB, BucketAssetAssignmentDB, BucketDB, BucketHoldingOverrideDB,
    NewBucketAccountDefaultDB, NewBucketAssetAssignmentDB, NewBucketDB,
    NewBucketHoldingOverrideDB,
};
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{
    bucket_account_defaults, bucket_asset_assignments, bucket_holding_overrides, buckets,
};

pub struct BucketsRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl BucketsRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl BucketRepositoryTrait for BucketsRepository {
    fn list_buckets(&self) -> Result<Vec<Bucket>> {
        let mut conn = get_connection(&self.pool)?;
        let rows = buckets::table
            .order((buckets::sort_order.asc(), buckets::name.asc()))
            .select(BucketDB::as_select())
            .load::<BucketDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(rows.into_iter().map(Bucket::from).collect())
    }

    fn get_bucket(&self, id: &str) -> Result<Option<Bucket>> {
        let mut conn = get_connection(&self.pool)?;
        let row = buckets::table
            .find(id)
            .select(BucketDB::as_select())
            .first::<BucketDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;
        Ok(row.map(Bucket::from))
    }

    async fn create_bucket(&self, bucket: NewBucket) -> Result<Bucket> {
        self.writer
            .exec_tx(move |tx| -> Result<Bucket> {
                let mut row: NewBucketDB = bucket.into();
                let id = row.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
                row.id = Some(id.clone());

                diesel::insert_into(buckets::table)
                    .values(&row)
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;

                let saved = buckets::table
                    .find(&id)
                    .select(BucketDB::as_select())
                    .first::<BucketDB>(tx.conn())
                    .map_err(StorageError::from)?;

                tx.insert(&saved)?;
                Ok(Bucket::from(saved))
            })
            .await
    }

    async fn update_bucket(&self, bucket: Bucket) -> Result<Bucket> {
        let id = bucket.id.clone();
        self.writer
            .exec_tx(move |tx| -> Result<Bucket> {
                let row = BucketDB {
                    id: bucket.id,
                    name: bucket.name,
                    color: bucket.color,
                    target_percent: bucket.target_percent.map(|amount| amount.to_string()),
                    sort_order: bucket.sort_order,
                    is_system: bucket.is_system,
                    created_at: bucket.created_at.format("%Y-%m-%dT%H:%M:%S%.fZ").to_string(),
                    updated_at: chrono::Utc::now().to_rfc3339(),
                };

                diesel::update(buckets::table.find(&id))
                    .set(&row)
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;

                let saved = buckets::table
                    .find(&id)
                    .select(BucketDB::as_select())
                    .first::<BucketDB>(tx.conn())
                    .map_err(StorageError::from)?;

                tx.update(&saved)?;
                Ok(Bucket::from(saved))
            })
            .await
    }

    async fn delete_bucket(&self, id: &str) -> Result<usize> {
        let bucket_id = id.to_string();
        self.writer
            .exec_tx(move |tx| -> Result<usize> {
                let Some(bucket_row) = buckets::table
                    .find(&bucket_id)
                    .select(BucketDB::as_select())
                    .first::<BucketDB>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?
                else {
                    return Ok(0);
                };

                let now = chrono::Utc::now().to_rfc3339();

                let account_default_rows = bucket_account_defaults::table
                    .filter(bucket_account_defaults::bucket_id.eq(&bucket_id))
                    .select(BucketAccountDefaultDB::as_select())
                    .load::<BucketAccountDefaultDB>(tx.conn())
                    .map_err(StorageError::from)?;
                for mut row in account_default_rows {
                    row.bucket_id = UNASSIGNED_BUCKET_ID.to_string();
                    row.updated_at = now.clone();
                    diesel::update(bucket_account_defaults::table.find(&row.id))
                        .set((
                            bucket_account_defaults::bucket_id.eq(&row.bucket_id),
                            bucket_account_defaults::updated_at.eq(&row.updated_at),
                        ))
                        .execute(tx.conn())
                        .map_err(StorageError::from)?;
                    tx.update(&row)?;
                }

                let holding_override_rows = bucket_holding_overrides::table
                    .filter(bucket_holding_overrides::bucket_id.eq(&bucket_id))
                    .select(BucketHoldingOverrideDB::as_select())
                    .load::<BucketHoldingOverrideDB>(tx.conn())
                    .map_err(StorageError::from)?;
                for mut row in holding_override_rows {
                    row.bucket_id = UNASSIGNED_BUCKET_ID.to_string();
                    row.updated_at = now.clone();
                    diesel::update(bucket_holding_overrides::table.find(&row.id))
                        .set((
                            bucket_holding_overrides::bucket_id.eq(&row.bucket_id),
                            bucket_holding_overrides::updated_at.eq(&row.updated_at),
                        ))
                        .execute(tx.conn())
                        .map_err(StorageError::from)?;
                    tx.update(&row)?;
                }

                let asset_assignment_rows = bucket_asset_assignments::table
                    .filter(bucket_asset_assignments::bucket_id.eq(&bucket_id))
                    .select(BucketAssetAssignmentDB::as_select())
                    .load::<BucketAssetAssignmentDB>(tx.conn())
                    .map_err(StorageError::from)?;
                for mut row in asset_assignment_rows {
                    row.bucket_id = UNASSIGNED_BUCKET_ID.to_string();
                    row.updated_at = now.clone();
                    diesel::update(bucket_asset_assignments::table.find(&row.id))
                        .set((
                            bucket_asset_assignments::bucket_id.eq(&row.bucket_id),
                            bucket_asset_assignments::updated_at.eq(&row.updated_at),
                        ))
                        .execute(tx.conn())
                        .map_err(StorageError::from)?;
                    tx.update(&row)?;
                }

                let deleted = diesel::delete(buckets::table.find(&bucket_id))
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;

                if deleted > 0 {
                    tx.delete_model(&bucket_row);
                }

                Ok(deleted)
            })
            .await
    }

    fn list_account_defaults(&self) -> Result<Vec<BucketAccountDefault>> {
        let mut conn = get_connection(&self.pool)?;
        let rows = bucket_account_defaults::table
            .order(bucket_account_defaults::account_id.asc())
            .select(BucketAccountDefaultDB::as_select())
            .load::<BucketAccountDefaultDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(rows.into_iter().map(BucketAccountDefault::from).collect())
    }

    async fn upsert_account_default(
        &self,
        assignment: NewBucketAccountDefault,
    ) -> Result<BucketAccountDefault> {
        self.writer
            .exec_tx(move |tx| -> Result<BucketAccountDefault> {
                let mut row: NewBucketAccountDefaultDB = assignment.into();
                let existing = bucket_account_defaults::table
                    .filter(bucket_account_defaults::account_id.eq(&row.account_id))
                    .select(BucketAccountDefaultDB::as_select())
                    .first::<BucketAccountDefaultDB>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?;
                let was_update = existing.is_some();

                row.id = Some(
                    existing
                        .as_ref()
                        .map(|saved| saved.id.clone())
                        .or(row.id.clone())
                        .unwrap_or_else(|| Uuid::new_v4().to_string()),
                );

                diesel::insert_into(bucket_account_defaults::table)
                    .values(&row)
                    .on_conflict(bucket_account_defaults::account_id)
                    .do_update()
                    .set((
                        bucket_account_defaults::bucket_id.eq(&row.bucket_id),
                        bucket_account_defaults::updated_at.eq(&row.updated_at),
                    ))
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;

                let saved = bucket_account_defaults::table
                    .filter(bucket_account_defaults::account_id.eq(&row.account_id))
                    .select(BucketAccountDefaultDB::as_select())
                    .first::<BucketAccountDefaultDB>(tx.conn())
                    .map_err(StorageError::from)?;

                if was_update {
                    tx.update(&saved)?;
                } else {
                    tx.insert(&saved)?;
                }

                Ok(BucketAccountDefault::from(saved))
            })
            .await
    }

    async fn delete_account_default(&self, account_id: &str) -> Result<usize> {
        let account_id = account_id.to_string();
        self.writer
            .exec_tx(move |tx| -> Result<usize> {
                let existing = bucket_account_defaults::table
                    .filter(bucket_account_defaults::account_id.eq(&account_id))
                    .select(BucketAccountDefaultDB::as_select())
                    .first::<BucketAccountDefaultDB>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?;

                let deleted = diesel::delete(
                    bucket_account_defaults::table
                        .filter(bucket_account_defaults::account_id.eq(&account_id)),
                )
                .execute(tx.conn())
                .map_err(StorageError::from)?;

                if let Some(row) = existing {
                    tx.delete_model(&row);
                }

                Ok(deleted)
            })
            .await
    }

    fn list_holding_overrides(&self) -> Result<Vec<BucketHoldingOverride>> {
        let mut conn = get_connection(&self.pool)?;
        let rows = bucket_holding_overrides::table
            .order((
                bucket_holding_overrides::account_id.asc(),
                bucket_holding_overrides::asset_id.asc(),
            ))
            .select(BucketHoldingOverrideDB::as_select())
            .load::<BucketHoldingOverrideDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(rows.into_iter().map(BucketHoldingOverride::from).collect())
    }

    async fn upsert_holding_override(
        &self,
        assignment: NewBucketHoldingOverride,
    ) -> Result<BucketHoldingOverride> {
        self.writer
            .exec_tx(move |tx| -> Result<BucketHoldingOverride> {
                let mut row: NewBucketHoldingOverrideDB = assignment.into();
                let existing = bucket_holding_overrides::table
                    .filter(bucket_holding_overrides::account_id.eq(&row.account_id))
                    .filter(bucket_holding_overrides::asset_id.eq(&row.asset_id))
                    .select(BucketHoldingOverrideDB::as_select())
                    .first::<BucketHoldingOverrideDB>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?;
                let was_update = existing.is_some();

                row.id = Some(
                    existing
                        .as_ref()
                        .map(|saved| saved.id.clone())
                        .or(row.id.clone())
                        .unwrap_or_else(|| Uuid::new_v4().to_string()),
                );

                diesel::insert_into(bucket_holding_overrides::table)
                    .values(&row)
                    .on_conflict((
                        bucket_holding_overrides::account_id,
                        bucket_holding_overrides::asset_id,
                    ))
                    .do_update()
                    .set((
                        bucket_holding_overrides::bucket_id.eq(&row.bucket_id),
                        bucket_holding_overrides::updated_at.eq(&row.updated_at),
                    ))
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;

                let saved = bucket_holding_overrides::table
                    .filter(bucket_holding_overrides::account_id.eq(&row.account_id))
                    .filter(bucket_holding_overrides::asset_id.eq(&row.asset_id))
                    .select(BucketHoldingOverrideDB::as_select())
                    .first::<BucketHoldingOverrideDB>(tx.conn())
                    .map_err(StorageError::from)?;

                if was_update {
                    tx.update(&saved)?;
                } else {
                    tx.insert(&saved)?;
                }

                Ok(BucketHoldingOverride::from(saved))
            })
            .await
    }

    async fn delete_holding_override(&self, account_id: &str, asset_id: &str) -> Result<usize> {
        let account_id = account_id.to_string();
        let asset_id = asset_id.to_string();
        self.writer
            .exec_tx(move |tx| -> Result<usize> {
                let existing = bucket_holding_overrides::table
                    .filter(bucket_holding_overrides::account_id.eq(&account_id))
                    .filter(bucket_holding_overrides::asset_id.eq(&asset_id))
                    .select(BucketHoldingOverrideDB::as_select())
                    .first::<BucketHoldingOverrideDB>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?;

                let deleted = diesel::delete(
                    bucket_holding_overrides::table
                        .filter(bucket_holding_overrides::account_id.eq(&account_id))
                        .filter(bucket_holding_overrides::asset_id.eq(&asset_id)),
                )
                .execute(tx.conn())
                .map_err(StorageError::from)?;

                if let Some(row) = existing {
                    tx.delete_model(&row);
                }

                Ok(deleted)
            })
            .await
    }

    fn list_asset_assignments(&self) -> Result<Vec<BucketAssetAssignment>> {
        let mut conn = get_connection(&self.pool)?;
        let rows = bucket_asset_assignments::table
            .order(bucket_asset_assignments::asset_id.asc())
            .select(BucketAssetAssignmentDB::as_select())
            .load::<BucketAssetAssignmentDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(rows.into_iter().map(BucketAssetAssignment::from).collect())
    }

    async fn upsert_asset_assignment(
        &self,
        assignment: NewBucketAssetAssignment,
    ) -> Result<BucketAssetAssignment> {
        self.writer
            .exec_tx(move |tx| -> Result<BucketAssetAssignment> {
                let mut row: NewBucketAssetAssignmentDB = assignment.into();
                let existing = bucket_asset_assignments::table
                    .filter(bucket_asset_assignments::asset_id.eq(&row.asset_id))
                    .select(BucketAssetAssignmentDB::as_select())
                    .first::<BucketAssetAssignmentDB>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?;
                let was_update = existing.is_some();

                row.id = Some(
                    existing
                        .as_ref()
                        .map(|saved| saved.id.clone())
                        .or(row.id.clone())
                        .unwrap_or_else(|| Uuid::new_v4().to_string()),
                );

                diesel::insert_into(bucket_asset_assignments::table)
                    .values(&row)
                    .on_conflict(bucket_asset_assignments::asset_id)
                    .do_update()
                    .set((
                        bucket_asset_assignments::bucket_id.eq(&row.bucket_id),
                        bucket_asset_assignments::updated_at.eq(&row.updated_at),
                    ))
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;

                let saved = bucket_asset_assignments::table
                    .filter(bucket_asset_assignments::asset_id.eq(&row.asset_id))
                    .select(BucketAssetAssignmentDB::as_select())
                    .first::<BucketAssetAssignmentDB>(tx.conn())
                    .map_err(StorageError::from)?;

                if was_update {
                    tx.update(&saved)?;
                } else {
                    tx.insert(&saved)?;
                }

                Ok(BucketAssetAssignment::from(saved))
            })
            .await
    }

    async fn delete_asset_assignment(&self, asset_id: &str) -> Result<usize> {
        let asset_id = asset_id.to_string();
        self.writer
            .exec_tx(move |tx| -> Result<usize> {
                let existing = bucket_asset_assignments::table
                    .filter(bucket_asset_assignments::asset_id.eq(&asset_id))
                    .select(BucketAssetAssignmentDB::as_select())
                    .first::<BucketAssetAssignmentDB>(tx.conn())
                    .optional()
                    .map_err(StorageError::from)?;

                let deleted = diesel::delete(
                    bucket_asset_assignments::table
                        .filter(bucket_asset_assignments::asset_id.eq(&asset_id)),
                )
                .execute(tx.conn())
                .map_err(StorageError::from)?;

                if let Some(row) = existing {
                    tx.delete_model(&row);
                }

                Ok(deleted)
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    use crate::db::{create_pool, get_connection, init, run_migrations, write_actor::spawn_writer};

    fn setup_repository() -> (
        BucketsRepository,
        Arc<Pool<ConnectionManager<SqliteConnection>>>,
    ) {
        std::env::set_var("CONNECT_API_URL", "http://test.local");

        let app_data = tempdir()
            .expect("tempdir")
            .keep()
            .to_string_lossy()
            .to_string();
        let db_path = init(&app_data).expect("init db");
        run_migrations(&db_path).expect("migrate db");
        let pool = create_pool(&db_path).expect("create pool");
        let writer = spawn_writer(pool.as_ref().clone());
        (BucketsRepository::new(pool.clone(), writer), pool)
    }

    fn insert_account(pool: &Arc<Pool<ConnectionManager<SqliteConnection>>>, account_id: &str) {
        let mut conn = get_connection(pool).expect("conn");
        let sql = format!(
            "INSERT INTO accounts (id, name, account_type, `group`, currency, is_default, is_active, created_at, updated_at, platform_id, account_number, meta, provider, provider_account_id, is_archived, tracking_mode) VALUES ('{}', 'Bucket Account', 'cash', NULL, 'USD', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL, NULL, 0, 'portfolio')",
            account_id.replace('\'', "''")
        );
        diesel::sql_query(sql)
            .execute(&mut conn)
            .expect("insert account");
    }

    fn insert_asset(pool: &Arc<Pool<ConnectionManager<SqliteConnection>>>, asset_id: &str) {
        let mut conn = get_connection(pool).expect("conn");
        let sql = format!(
            "INSERT INTO assets (id, kind, name, display_code, notes, metadata, is_active, quote_mode, quote_ccy, instrument_type, instrument_symbol, instrument_exchange_mic, provider_config, created_at, updated_at) VALUES ('{}', 'INVESTMENT', 'Bucket Asset', 'BKT', NULL, NULL, 1, 'MANUAL', 'USD', NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            asset_id.replace('\'', "''")
        );
        diesel::sql_query(sql)
            .execute(&mut conn)
            .expect("insert asset");
    }

    async fn create_bucket(repo: &BucketsRepository, name: &str, sort_order: i32) -> Bucket {
        repo.create_bucket(NewBucket {
            id: None,
            name: name.to_string(),
            color: "#94a3b8".to_string(),
            target_percent: None,
            sort_order,
            is_system: false,
        })
        .await
        .expect("create bucket")
    }

    #[tokio::test]
    async fn lists_seeded_unassigned_bucket() {
        let (repo, _) = setup_repository();

        let buckets = repo.list_buckets().expect("list buckets");

        assert!(buckets.iter().any(|bucket| {
            bucket.id == UNASSIGNED_BUCKET_ID && bucket.name == "Unassigned" && bucket.is_system
        }));
    }

    #[tokio::test]
    async fn creates_and_updates_bucket() {
        let (repo, _) = setup_repository();

        let created = create_bucket(&repo, "Growth", 10).await;
        assert_eq!(created.name, "Growth");

        let updated = repo
            .update_bucket(Bucket {
                name: "Long-term Growth".to_string(),
                color: "#2f855a".to_string(),
                target_percent: Some(rust_decimal::Decimal::new(6500, 2)),
                sort_order: 30,
                ..created
            })
            .await
            .expect("update bucket");

        assert_eq!(updated.name, "Long-term Growth");
        assert_eq!(updated.color, "#2f855a");
        assert_eq!(
            updated.target_percent,
            Some(rust_decimal::Decimal::new(6500, 2))
        );
        assert_eq!(updated.sort_order, 30);
    }

    #[tokio::test]
    async fn upserts_account_default_by_account_id() {
        let (repo, pool) = setup_repository();
        insert_account(&pool, "account-default-1");

        let stable = create_bucket(&repo, "Stable", 10).await;
        let growth = create_bucket(&repo, "Growth", 20).await;

        let first = repo
            .upsert_account_default(NewBucketAccountDefault {
                id: None,
                account_id: "account-default-1".to_string(),
                bucket_id: stable.id.clone(),
            })
            .await
            .expect("assign account default");
        let second = repo
            .upsert_account_default(NewBucketAccountDefault {
                id: None,
                account_id: "account-default-1".to_string(),
                bucket_id: growth.id.clone(),
            })
            .await
            .expect("reassign account default");

        assert_eq!(first.id, second.id);
        assert_eq!(second.bucket_id, growth.id);
        assert_eq!(repo.list_account_defaults().expect("list defaults").len(), 1);
    }

    #[tokio::test]
    async fn upserts_holding_override_by_account_and_asset() {
        let (repo, pool) = setup_repository();
        insert_account(&pool, "holding-account-1");
        insert_asset(&pool, "holding-asset-1");

        let stable = create_bucket(&repo, "Stable", 10).await;
        let growth = create_bucket(&repo, "Growth", 20).await;

        let first = repo
            .upsert_holding_override(NewBucketHoldingOverride {
                id: None,
                account_id: "holding-account-1".to_string(),
                asset_id: "holding-asset-1".to_string(),
                bucket_id: stable.id.clone(),
            })
            .await
            .expect("assign holding override");
        let second = repo
            .upsert_holding_override(NewBucketHoldingOverride {
                id: None,
                account_id: "holding-account-1".to_string(),
                asset_id: "holding-asset-1".to_string(),
                bucket_id: growth.id.clone(),
            })
            .await
            .expect("reassign holding override");

        assert_eq!(first.id, second.id);
        assert_eq!(second.bucket_id, growth.id);
        assert_eq!(repo.list_holding_overrides().expect("list overrides").len(), 1);
    }

    #[tokio::test]
    async fn upserts_standalone_asset_assignment_by_asset_id() {
        let (repo, pool) = setup_repository();
        insert_asset(&pool, "asset-assignment-1");

        let stable = create_bucket(&repo, "Stable", 10).await;
        let reserve = create_bucket(&repo, "Reserve", 20).await;

        let first = repo
            .upsert_asset_assignment(NewBucketAssetAssignment {
                id: None,
                asset_id: "asset-assignment-1".to_string(),
                bucket_id: stable.id.clone(),
            })
            .await
            .expect("assign standalone asset");
        let second = repo
            .upsert_asset_assignment(NewBucketAssetAssignment {
                id: None,
                asset_id: "asset-assignment-1".to_string(),
                bucket_id: reserve.id.clone(),
            })
            .await
            .expect("reassign standalone asset");

        assert_eq!(first.id, second.id);
        assert_eq!(second.bucket_id, reserve.id);
        assert_eq!(repo.list_asset_assignments().expect("list assets").len(), 1);
    }

    #[tokio::test]
    async fn deleting_bucket_reassigns_dependents_to_unassigned() {
        let (repo, pool) = setup_repository();
        insert_account(&pool, "delete-account-1");
        insert_asset(&pool, "delete-asset-1");
        insert_asset(&pool, "delete-asset-2");

        let bucket = create_bucket(&repo, "Delete Me", 10).await;

        repo.upsert_account_default(NewBucketAccountDefault {
            id: None,
            account_id: "delete-account-1".to_string(),
            bucket_id: bucket.id.clone(),
        })
        .await
        .expect("account default");
        repo.upsert_holding_override(NewBucketHoldingOverride {
            id: None,
            account_id: "delete-account-1".to_string(),
            asset_id: "delete-asset-1".to_string(),
            bucket_id: bucket.id.clone(),
        })
        .await
        .expect("holding override");
        repo.upsert_asset_assignment(NewBucketAssetAssignment {
            id: None,
            asset_id: "delete-asset-2".to_string(),
            bucket_id: bucket.id.clone(),
        })
        .await
        .expect("asset assignment");

        let deleted = repo.delete_bucket(&bucket.id).await.expect("delete bucket");
        assert_eq!(deleted, 1);
        assert!(repo.get_bucket(&bucket.id).expect("get bucket").is_none());

        let account_defaults = repo.list_account_defaults().expect("list defaults");
        let holding_overrides = repo.list_holding_overrides().expect("list overrides");
        let asset_assignments = repo.list_asset_assignments().expect("list asset assignments");

        assert_eq!(account_defaults[0].bucket_id, UNASSIGNED_BUCKET_ID);
        assert_eq!(holding_overrides[0].bucket_id, UNASSIGNED_BUCKET_ID);
        assert_eq!(asset_assignments[0].bucket_id, UNASSIGNED_BUCKET_ID);
    }
}
