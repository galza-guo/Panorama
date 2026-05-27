//! Repository traits for local external account connectors.

use async_trait::async_trait;

use crate::Result;

use super::connectors_model::{
    ExternalAccountLink, ExternalConnection, NewExternalAccountLink, NewExternalConnection,
};

#[async_trait]
pub trait ExternalConnectionRepositoryTrait: Send + Sync {
    fn list_connections(&self) -> Result<Vec<ExternalConnection>>;

    fn get_connection(&self, connection_id: &str) -> Result<Option<ExternalConnection>>;

    async fn create_connection(
        &self,
        connection: NewExternalConnection,
    ) -> Result<ExternalConnection>;

    async fn update_connection(&self, connection: ExternalConnection)
        -> Result<ExternalConnection>;

    async fn delete_connection(&self, connection_id: &str) -> Result<usize>;
}

#[async_trait]
pub trait ExternalAccountLinkRepositoryTrait: Send + Sync {
    fn list_account_links(&self) -> Result<Vec<ExternalAccountLink>>;

    fn list_account_links_for_connection(
        &self,
        connection_id: &str,
    ) -> Result<Vec<ExternalAccountLink>>;

    fn list_account_links_for_local_account(
        &self,
        local_account_id: &str,
    ) -> Result<Vec<ExternalAccountLink>>;

    fn get_account_link(&self, link_id: &str) -> Result<Option<ExternalAccountLink>>;

    fn get_account_link_by_remote_account(
        &self,
        connection_id: &str,
        remote_account_id: &str,
    ) -> Result<Option<ExternalAccountLink>>;

    async fn create_account_link(
        &self,
        link: NewExternalAccountLink,
    ) -> Result<ExternalAccountLink>;

    async fn update_account_link(&self, link: ExternalAccountLink) -> Result<ExternalAccountLink>;

    async fn delete_account_link(&self, link_id: &str) -> Result<usize>;
}
