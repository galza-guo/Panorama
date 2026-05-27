use async_trait::async_trait;

use crate::errors::Result;

use super::{TargetAllocationPlanData, TargetAllocationView};

#[async_trait]
pub trait TargetAllocationRepositoryTrait: Send + Sync {
    fn get_plan_data(&self) -> Result<TargetAllocationPlanData>;
    async fn save_plan_data(&self, plan: TargetAllocationPlanData) -> Result<()>;
    async fn set_account_default(
        &self,
        account_id: &str,
        folder_node_id: Option<String>,
    ) -> Result<()>;
}

#[async_trait]
pub trait TargetAllocationServiceTrait: Send + Sync {
    async fn get_target_allocation(&self, base_currency: &str) -> Result<TargetAllocationView>;
    async fn save_target_allocation(
        &self,
        plan: TargetAllocationPlanData,
        base_currency: &str,
    ) -> Result<TargetAllocationView>;
    async fn set_account_default(
        &self,
        account_id: &str,
        folder_node_id: Option<String>,
        base_currency: &str,
    ) -> Result<TargetAllocationView>;
}
