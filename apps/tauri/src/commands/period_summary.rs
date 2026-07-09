use std::sync::Arc;

use chrono::NaiveDate;
use panorama_core::portfolio::period_summary::{
    MoneyMovementItem as CoreMoneyMovementItem, PeriodSummary as CorePeriodSummary,
    PeriodSummaryPeriod, ValueMovementItem as CoreValueMovementItem,
};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::context::ServiceContext;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodSummaryResponse {
    pub summary_key: String,
    pub requested_start_date: String,
    pub requested_end_date: String,
    pub actual_start_date: Option<String>,
    pub actual_end_date: Option<String>,
    pub period: String,
    pub currency: String,
    pub start_net_worth: String,
    pub end_net_worth: String,
    pub total_change: String,
    pub money_movement: MoneyMovementSummaryResponse,
    pub value_movement: ValueMovementSummaryResponse,
    pub residual: PeriodSummaryResidualResponse,
    pub warnings: Vec<PeriodSummaryWarningResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoneyMovementSummaryResponse {
    pub inflows_total: String,
    pub outflows_total: String,
    pub net: String,
    pub top_inflows: Vec<MoneyMovementItemResponse>,
    pub top_outflows: Vec<MoneyMovementItemResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoneyMovementItemResponse {
    pub activity_id: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub date: String,
    pub activity_type: String,
    pub amount_base: String,
    pub amount_original: String,
    pub original_currency: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValueMovementSummaryResponse {
    pub gains_total: String,
    pub losses_total: String,
    pub net: String,
    pub top_gains: Vec<ValueMovementItemResponse>,
    pub top_losses: Vec<ValueMovementItemResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValueMovementItemResponse {
    pub holding_id: String,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub name: String,
    pub symbol: Option<String>,
    pub amount_base: String,
    pub percent_change: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodSummaryResidualResponse {
    pub amount: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodSummaryWarningResponse {
    pub code: String,
    pub message: String,
    pub account_id: Option<String>,
    pub holding_id: Option<String>,
}

#[tauri::command]
pub async fn get_period_summary(
    start_date: String,
    end_date: String,
    period: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<PeriodSummaryResponse, String> {
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|error| format!("Invalid start date: {}", error))?;
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|error| format!("Invalid end date: {}", error))?;
    let period = parse_period(&period)?;

    let summary = state
        .period_summary_service()
        .get_period_summary(start, end, period)
        .await
        .map_err(|error| format!("Failed to get period summary: {}", error))?;

    Ok(map_period_summary(summary))
}

fn parse_period(period: &str) -> Result<PeriodSummaryPeriod, String> {
    match period {
        "weekly" => Ok(PeriodSummaryPeriod::Weekly),
        "monthly" => Ok(PeriodSummaryPeriod::Monthly),
        "custom" => Ok(PeriodSummaryPeriod::Custom),
        other => Err(format!("Unsupported period: {}", other)),
    }
}

fn map_period_summary(summary: CorePeriodSummary) -> PeriodSummaryResponse {
    PeriodSummaryResponse {
        summary_key: summary.summary_key,
        requested_start_date: summary.requested_start_date.to_string(),
        requested_end_date: summary.requested_end_date.to_string(),
        actual_start_date: summary.actual_start_date.map(|date| date.to_string()),
        actual_end_date: summary.actual_end_date.map(|date| date.to_string()),
        period: summary.period.as_str().to_string(),
        currency: summary.currency,
        start_net_worth: summary.start_net_worth.to_string(),
        end_net_worth: summary.end_net_worth.to_string(),
        total_change: summary.total_change.to_string(),
        money_movement: MoneyMovementSummaryResponse {
            inflows_total: summary.money_movement.inflows_total.to_string(),
            outflows_total: summary.money_movement.outflows_total.to_string(),
            net: summary.money_movement.net.to_string(),
            top_inflows: summary
                .money_movement
                .top_inflows
                .into_iter()
                .map(map_money_item)
                .collect(),
            top_outflows: summary
                .money_movement
                .top_outflows
                .into_iter()
                .map(map_money_item)
                .collect(),
        },
        value_movement: ValueMovementSummaryResponse {
            gains_total: summary.value_movement.gains_total.to_string(),
            losses_total: summary.value_movement.losses_total.to_string(),
            net: summary.value_movement.net.to_string(),
            top_gains: summary
                .value_movement
                .top_gains
                .into_iter()
                .map(map_value_item)
                .collect(),
            top_losses: summary
                .value_movement
                .top_losses
                .into_iter()
                .map(map_value_item)
                .collect(),
        },
        residual: PeriodSummaryResidualResponse {
            amount: summary.residual.amount.to_string(),
            reason: summary.residual.reason,
        },
        warnings: summary
            .warnings
            .into_iter()
            .map(|warning| PeriodSummaryWarningResponse {
                code: warning.code,
                message: warning.message,
                account_id: warning.account_id,
                holding_id: warning.holding_id,
            })
            .collect(),
    }
}

fn map_money_item(item: CoreMoneyMovementItem) -> MoneyMovementItemResponse {
    MoneyMovementItemResponse {
        activity_id: item.activity_id,
        account_id: item.account_id,
        account_name: item.account_name,
        date: item.date.to_string(),
        activity_type: item.activity_type,
        amount_base: item.amount_base.to_string(),
        amount_original: item.amount_original.to_string(),
        original_currency: item.original_currency,
        note: item.note,
    }
}

fn map_value_item(item: CoreValueMovementItem) -> ValueMovementItemResponse {
    ValueMovementItemResponse {
        holding_id: item.holding_id,
        account_id: item.account_id,
        account_name: item.account_name,
        name: item.name,
        symbol: item.symbol,
        amount_base: item.amount_base.to_string(),
        percent_change: item.percent_change.map(|value| value.to_string()),
        reason: format!("{:?}", item.reason).to_lowercase(),
    }
}
