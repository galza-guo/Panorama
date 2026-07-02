use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PeriodSummaryPeriod {
    Weekly,
    Monthly,
    Custom,
}

impl PeriodSummaryPeriod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
            Self::Custom => "custom",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PeriodSummary {
    pub summary_key: String,
    pub requested_start_date: NaiveDate,
    pub requested_end_date: NaiveDate,
    pub actual_start_date: Option<NaiveDate>,
    pub actual_end_date: Option<NaiveDate>,
    pub period: PeriodSummaryPeriod,
    pub currency: String,
    pub start_net_worth: Decimal,
    pub end_net_worth: Decimal,
    pub total_change: Decimal,
    pub money_movement: MoneyMovementSummary,
    pub value_movement: ValueMovementSummary,
    pub residual: PeriodSummaryResidual,
    pub warnings: Vec<PeriodSummaryWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoneyMovementSummary {
    pub inflows_total: Decimal,
    pub outflows_total: Decimal,
    pub net: Decimal,
    pub top_inflows: Vec<MoneyMovementItem>,
    pub top_outflows: Vec<MoneyMovementItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoneyMovementItem {
    pub activity_id: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub date: NaiveDate,
    pub activity_type: String,
    pub amount_base: Decimal,
    pub amount_original: Decimal,
    pub original_currency: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ValueMovementSummary {
    pub gains_total: Decimal,
    pub losses_total: Decimal,
    pub net: Decimal,
    pub top_gains: Vec<ValueMovementItem>,
    pub top_losses: Vec<ValueMovementItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ValueMovementItem {
    pub holding_id: String,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub name: String,
    pub symbol: Option<String>,
    pub amount_base: Decimal,
    pub percent_change: Option<Decimal>,
    pub reason: ValueMovementReason,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ValueMovementReason {
    Price,
    Valuation,
    Fx,
    Income,
    Liability,
    Residual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PeriodSummaryResidual {
    pub amount: Decimal,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PeriodSummaryWarning {
    pub code: String,
    pub message: String,
    pub account_id: Option<String>,
    pub holding_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use rust_decimal_macros::dec;

    #[test]
    fn period_summary_residual_closes_the_bridge() {
        let summary = PeriodSummary {
            summary_key: "monthly:2026-06-01:2026-06-30:USD".to_string(),
            requested_start_date: NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            requested_end_date: NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            actual_start_date: Some(NaiveDate::from_ymd_opt(2026, 6, 1).unwrap()),
            actual_end_date: Some(NaiveDate::from_ymd_opt(2026, 6, 30).unwrap()),
            period: PeriodSummaryPeriod::Monthly,
            currency: "USD".to_string(),
            start_net_worth: dec!(100000),
            end_net_worth: dec!(98500),
            total_change: dec!(-1500),
            money_movement: MoneyMovementSummary {
                inflows_total: dec!(5000),
                outflows_total: dec!(3200),
                net: dec!(1800),
                top_inflows: Vec::new(),
                top_outflows: Vec::new(),
            },
            value_movement: ValueMovementSummary {
                gains_total: dec!(1100),
                losses_total: dec!(4400),
                net: dec!(-3300),
                top_gains: Vec::new(),
                top_losses: Vec::new(),
            },
            residual: PeriodSummaryResidual {
                amount: dec!(0),
                reason: None,
            },
            warnings: Vec::new(),
        };

        assert_eq!(
            summary.money_movement.net + summary.value_movement.net + summary.residual.amount,
            summary.total_change
        );
    }
}
