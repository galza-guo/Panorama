use std::sync::Arc;

use crate::context::ServiceContext;
use tauri::State;
use wealthfolio_core::portfolio::target_allocation::{
    TargetAllocationPlanData, TargetAllocationView,
};

#[tauri::command]
pub async fn get_target_allocation(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<TargetAllocationView, String> {
    let base_currency = state.get_base_currency();
    state
        .target_allocation_service()
        .get_target_allocation(&base_currency)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_target_allocation(
    state: State<'_, Arc<ServiceContext>>,
    plan: TargetAllocationPlanData,
) -> Result<TargetAllocationView, String> {
    let base_currency = state.get_base_currency();
    state
        .target_allocation_service()
        .save_target_allocation(plan, &base_currency)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_target_allocation_account_default(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
    folder_node_id: Option<String>,
) -> Result<TargetAllocationView, String> {
    let base_currency = state.get_base_currency();
    state
        .target_allocation_service()
        .set_account_default(&account_id, folder_node_id, &base_currency)
        .await
        .map_err(|e| e.to_string())
}
