use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use panorama_core::portfolio::period_summary::{PeriodSummary, PeriodSummaryPeriod};

use super::shared::parse_date;

#[derive(serde::Deserialize)]
struct PeriodSummaryQuery {
    #[serde(rename = "startDate")]
    start_date: String,
    #[serde(rename = "endDate")]
    end_date: String,
    period: String,
}

async fn get_period_summary(
    State(state): State<Arc<AppState>>,
    Query(q): Query<PeriodSummaryQuery>,
) -> ApiResult<Json<PeriodSummary>> {
    let start = parse_date(&q.start_date, "startDate")?;
    let end = parse_date(&q.end_date, "endDate")?;
    let period = parse_period(&q.period)?;
    let summary = state
        .period_summary_service
        .get_period_summary(start, end, period)
        .await?;

    Ok(Json(summary))
}

fn parse_period(period: &str) -> ApiResult<PeriodSummaryPeriod> {
    match period {
        "weekly" => Ok(PeriodSummaryPeriod::Weekly),
        "monthly" => Ok(PeriodSummaryPeriod::Monthly),
        "custom" => Ok(PeriodSummaryPeriod::Custom),
        other => Err(crate::error::ApiError::BadRequest(format!(
            "Unsupported period: {}",
            other
        ))),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/period-summary", get(get_period_summary))
}
