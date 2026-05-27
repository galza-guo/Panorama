//! Repository for local external connector metadata and account links.

use async_trait::async_trait;
use chrono::Utc;
use diesel::prelude::*;
use std::sync::Arc;
use uuid::Uuid;
use wealthfolio_core::connectors::{
    ExternalAccountLink, ExternalAccountLinkRepositoryTrait, ExternalConnection,
    ExternalConnectionRepositoryTrait, NewExternalAccountLink, NewExternalConnection,
};
use wealthfolio_core::Result;

use super::model::{serialize_capabilities, ExternalAccountLinkDB, ExternalConnectionDB};
use super::schema::{external_account_links, external_connections};
use crate::db::{get_connection, DbPool, WriteHandle};
use crate::errors::StorageError;

pub struct ConnectorRepository {
    pool: Arc<DbPool>,
    writer: WriteHandle,
}

impl ConnectorRepository {
    pub fn new(pool: Arc<DbPool>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }

    fn load_connection_by_id(
        conn: &mut diesel::sqlite::SqliteConnection,
        connection_id: &str,
    ) -> Result<Option<ExternalConnection>> {
        external_connections::table
            .select(ExternalConnectionDB::as_select())
            .find(connection_id)
            .first::<ExternalConnectionDB>(conn)
            .optional()
            .map_err(StorageError::from)?
            .map(TryInto::try_into)
            .transpose()
    }

    fn load_link_by_id(
        conn: &mut diesel::sqlite::SqliteConnection,
        link_id: &str,
    ) -> Result<Option<ExternalAccountLink>> {
        external_account_links::table
            .select(ExternalAccountLinkDB::as_select())
            .find(link_id)
            .first::<ExternalAccountLinkDB>(conn)
            .optional()
            .map_err(StorageError::from)?
            .map(TryInto::try_into)
            .transpose()
    }
}

#[async_trait]
impl ExternalConnectionRepositoryTrait for ConnectorRepository {
    fn list_connections(&self) -> Result<Vec<ExternalConnection>> {
        let mut conn = get_connection(&self.pool)?;
        external_connections::table
            .select(ExternalConnectionDB::as_select())
            .order(external_connections::created_at.asc())
            .load::<ExternalConnectionDB>(&mut conn)
            .map_err(StorageError::from)?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    fn get_connection(&self, connection_id: &str) -> Result<Option<ExternalConnection>> {
        let mut conn = get_connection(&self.pool)?;
        Self::load_connection_by_id(&mut conn, connection_id)
    }

    async fn create_connection(
        &self,
        connection: NewExternalConnection,
    ) -> Result<ExternalConnection> {
        let now = Utc::now().naive_utc();
        let db = ExternalConnectionDB {
            id: connection.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            provider: connection.provider.as_db_str().to_string(),
            display_name: connection.display_name,
            environment: connection.environment.as_db_str().to_string(),
            owner_name: connection.owner_name,
            status: connection.status.as_db_str().to_string(),
            capabilities_json: serialize_capabilities(&connection.capabilities)?,
            metadata_json: connection.metadata_json,
            created_at: now,
            updated_at: now,
        };

        self.writer
            .exec(move |conn| {
                diesel::insert_into(external_connections::table)
                    .values(&db)
                    .execute(conn)
                    .map_err(StorageError::from)?;
                db.try_into()
            })
            .await
    }

    async fn update_connection(
        &self,
        connection: ExternalConnection,
    ) -> Result<ExternalConnection> {
        let mut db = ExternalConnectionDB::try_from(connection)?;
        db.updated_at = Utc::now().naive_utc();

        self.writer
            .exec(move |conn| {
                diesel::update(external_connections::table.find(&db.id))
                    .set(&db)
                    .execute(conn)
                    .map_err(StorageError::from)?;
                db.try_into()
            })
            .await
    }

    async fn delete_connection(&self, connection_id: &str) -> Result<usize> {
        let id = connection_id.to_string();
        self.writer
            .exec(move |conn| {
                diesel::delete(external_connections::table.find(&id))
                    .execute(conn)
                    .map_err(StorageError::from)
                    .map_err(Into::into)
            })
            .await
    }
}

#[async_trait]
impl ExternalAccountLinkRepositoryTrait for ConnectorRepository {
    fn list_account_links(&self) -> Result<Vec<ExternalAccountLink>> {
        let mut conn = get_connection(&self.pool)?;
        external_account_links::table
            .select(ExternalAccountLinkDB::as_select())
            .order(external_account_links::created_at.asc())
            .load::<ExternalAccountLinkDB>(&mut conn)
            .map_err(StorageError::from)?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    fn list_account_links_for_connection(
        &self,
        connection_id: &str,
    ) -> Result<Vec<ExternalAccountLink>> {
        let mut conn = get_connection(&self.pool)?;
        external_account_links::table
            .filter(external_account_links::connection_id.eq(connection_id))
            .select(ExternalAccountLinkDB::as_select())
            .order(external_account_links::created_at.asc())
            .load::<ExternalAccountLinkDB>(&mut conn)
            .map_err(StorageError::from)?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    fn list_account_links_for_local_account(
        &self,
        local_account_id: &str,
    ) -> Result<Vec<ExternalAccountLink>> {
        let mut conn = get_connection(&self.pool)?;
        external_account_links::table
            .filter(external_account_links::local_account_id.eq(local_account_id))
            .select(ExternalAccountLinkDB::as_select())
            .order(external_account_links::created_at.asc())
            .load::<ExternalAccountLinkDB>(&mut conn)
            .map_err(StorageError::from)?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    fn get_account_link(&self, link_id: &str) -> Result<Option<ExternalAccountLink>> {
        let mut conn = get_connection(&self.pool)?;
        Self::load_link_by_id(&mut conn, link_id)
    }

    fn get_account_link_by_remote_account(
        &self,
        connection_id: &str,
        remote_account_id: &str,
    ) -> Result<Option<ExternalAccountLink>> {
        let mut conn = get_connection(&self.pool)?;
        external_account_links::table
            .filter(external_account_links::connection_id.eq(connection_id))
            .filter(external_account_links::remote_account_id.eq(remote_account_id))
            .filter(external_account_links::status.eq("ACTIVE"))
            .select(ExternalAccountLinkDB::as_select())
            .first::<ExternalAccountLinkDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?
            .map(TryInto::try_into)
            .transpose()
    }

    async fn create_account_link(
        &self,
        link: NewExternalAccountLink,
    ) -> Result<ExternalAccountLink> {
        let now = Utc::now().naive_utc();
        let db = ExternalAccountLinkDB {
            id: link.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            connection_id: link.connection_id,
            provider: link.provider.as_db_str().to_string(),
            remote_account_id: link.remote_account_id,
            local_account_id: link.local_account_id,
            remote_account_number_masked: link.remote_account_number_masked,
            remote_account_type: link.remote_account_type,
            linked_at: now,
            source_from_date: link.source_from_date,
            sync_mode: link.sync_mode.as_db_str().to_string(),
            status: link.status.as_db_str().to_string(),
            metadata_json: link.metadata_json,
            created_at: now,
            updated_at: now,
        };

        self.writer
            .exec(move |conn| {
                diesel::insert_into(external_account_links::table)
                    .values(&db)
                    .execute(conn)
                    .map_err(StorageError::from)?;
                db.try_into()
            })
            .await
    }

    async fn update_account_link(&self, link: ExternalAccountLink) -> Result<ExternalAccountLink> {
        let mut db = ExternalAccountLinkDB::try_from(link)?;
        db.updated_at = Utc::now().naive_utc();

        self.writer
            .exec(move |conn| {
                diesel::update(external_account_links::table.find(&db.id))
                    .set(&db)
                    .execute(conn)
                    .map_err(StorageError::from)?;
                db.try_into()
            })
            .await
    }

    async fn delete_account_link(&self, link_id: &str) -> Result<usize> {
        let id = link_id.to_string();
        self.writer
            .exec(move |conn| {
                diesel::delete(external_account_links::table.find(&id))
                    .execute(conn)
                    .map_err(StorageError::from)
                    .map_err(Into::into)
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono::NaiveDate;
    use diesel::r2d2::{self, Pool};
    use diesel::sqlite::SqliteConnection;
    use diesel::RunQueryDsl;
    use tempfile::tempdir;
    use wealthfolio_core::connectors::{
        ConnectorCapability, ConnectorEnvironment, ConnectorProvider,
        ExternalAccountLinkRepositoryTrait, ExternalAccountLinkStatus,
        ExternalConnectionRepositoryTrait, ExternalConnectionStatus, NewExternalAccountLink,
        NewExternalConnection,
    };

    use super::ConnectorRepository;
    use crate::db::{create_pool, get_connection, init, run_migrations, write_actor::spawn_writer};

    fn setup_repo() -> (
        ConnectorRepository,
        Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    ) {
        let app_data = tempdir()
            .expect("tempdir")
            .keep()
            .to_string_lossy()
            .to_string();
        let db_path = init(&app_data).expect("init db");
        run_migrations(&db_path).expect("migrate db");
        let pool = create_pool(&db_path).expect("create pool");
        let writer = spawn_writer(pool.as_ref().clone());
        let repo = ConnectorRepository::new(pool.clone(), writer);
        (repo, pool)
    }

    fn insert_test_account(
        pool: &Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        account_id: &str,
    ) {
        let mut conn = get_connection(pool).expect("conn");
        diesel::sql_query(format!(
            "INSERT INTO accounts (id, name, account_type, currency, is_default, is_active, created_at, updated_at, is_archived, tracking_mode) \
             VALUES ('{}', 'Webull HK', 'BROKERAGE', 'HKD', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 'HOLDINGS')",
            account_id
        ))
        .execute(&mut conn)
        .expect("insert account");
    }

    fn new_connection(id: &str) -> NewExternalConnection {
        NewExternalConnection {
            id: Some(id.to_string()),
            provider: ConnectorProvider::WebullHk,
            display_name: "Webull HK - Sandbox".to_string(),
            environment: ConnectorEnvironment::Sandbox,
            owner_name: Some("Alex".to_string()),
            status: ExternalConnectionStatus::Active,
            capabilities: vec![
                ConnectorCapability::PortfolioSnapshotSync,
                ConnectorCapability::OrderHistoryImport,
            ],
            metadata_json: None,
        }
    }

    fn new_link(
        connection_id: &str,
        remote_account_id: &str,
        local_account_id: &str,
    ) -> NewExternalAccountLink {
        NewExternalAccountLink {
            id: None,
            connection_id: connection_id.to_string(),
            provider: ConnectorProvider::WebullHk,
            remote_account_id: remote_account_id.to_string(),
            local_account_id: local_account_id.to_string(),
            remote_account_number_masked: Some("****1234".to_string()),
            remote_account_type: Some("CASH".to_string()),
            source_from_date: NaiveDate::from_ymd_opt(2026, 5, 27).unwrap(),
            sync_mode: Default::default(),
            status: Default::default(),
            metadata_json: None,
        }
    }

    #[tokio::test]
    async fn creates_lists_and_updates_connections() {
        let (repo, _pool) = setup_repo();

        let created = repo
            .create_connection(new_connection("conn-1"))
            .await
            .expect("create connection");

        assert_eq!(created.id, "conn-1");
        assert_eq!(created.provider, ConnectorProvider::WebullHk);
        assert_eq!(created.capabilities.len(), 2);

        let listed = repo.list_connections().expect("list connections");
        assert_eq!(listed.len(), 1);

        let mut updated = created;
        updated.status = ExternalConnectionStatus::Paused;
        repo.update_connection(updated)
            .await
            .expect("update connection");

        let loaded = repo
            .get_connection("conn-1")
            .expect("get connection")
            .expect("connection exists");
        assert_eq!(loaded.status, ExternalConnectionStatus::Paused);
    }

    #[tokio::test]
    async fn creates_and_finds_account_links() {
        let (repo, pool) = setup_repo();
        insert_test_account(&pool, "account-1");
        repo.create_connection(new_connection("conn-1"))
            .await
            .expect("create connection");

        let created = repo
            .create_account_link(new_link("conn-1", "remote-1", "account-1"))
            .await
            .expect("create link");

        assert_eq!(created.status, ExternalAccountLinkStatus::Active);
        assert_eq!(created.source_from_date.to_string(), "2026-05-27");

        let by_connection = repo
            .list_account_links_for_connection("conn-1")
            .expect("links by connection");
        assert_eq!(by_connection.len(), 1);

        let by_local = repo
            .list_account_links_for_local_account("account-1")
            .expect("links by account");
        assert_eq!(by_local.len(), 1);

        let by_remote = repo
            .get_account_link_by_remote_account("conn-1", "remote-1")
            .expect("link by remote")
            .expect("remote link exists");
        assert_eq!(by_remote.local_account_id, "account-1");
    }

    #[tokio::test]
    async fn prevents_duplicate_active_remote_account_links() {
        let (repo, pool) = setup_repo();
        insert_test_account(&pool, "account-1");
        insert_test_account(&pool, "account-2");
        repo.create_connection(new_connection("conn-1"))
            .await
            .expect("create connection");

        repo.create_account_link(new_link("conn-1", "remote-1", "account-1"))
            .await
            .expect("create first link");

        let duplicate = repo
            .create_account_link(new_link("conn-1", "remote-1", "account-2"))
            .await;

        assert!(duplicate.is_err());
    }
}
