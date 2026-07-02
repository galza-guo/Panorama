use super::model::{
    MoneyMovementItem, MoneyMovementSummary, PeriodSummaryWarning, ValueMovementItem,
    ValueMovementReason, ValueMovementSummary,
};
use crate::activities::{
    Activity, ACTIVITY_TYPE_CREDIT, ACTIVITY_TYPE_DEPOSIT, ACTIVITY_TYPE_TRANSFER_IN,
    ACTIVITY_TYPE_TRANSFER_OUT, ACTIVITY_TYPE_WITHDRAWAL,
};
use crate::fx::FxServiceTrait;
use crate::portfolio::performance::{classify_flow_for_scope, FlowType, PerformanceScope};
use rust_decimal::Decimal;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

pub struct PeriodSummaryService;

pub trait PeriodSummaryServiceTrait: Send + Sync {}

#[allow(dead_code)]
fn build_money_movement(
    activities: &[Activity],
    account_names: &HashMap<String, String>,
    base_currency: &str,
    fx: &dyn FxServiceTrait,
) -> (MoneyMovementSummary, Vec<PeriodSummaryWarning>) {
    let mut inflows = Vec::new();
    let mut outflows = Vec::new();
    let mut inflows_total = Decimal::ZERO;
    let mut outflows_total = Decimal::ZERO;
    let mut warnings = Vec::new();

    for activity in activities {
        if classify_flow_for_scope(activity, PerformanceScope::Portfolio) != FlowType::External {
            continue;
        }

        let direction = match activity.effective_type() {
            ACTIVITY_TYPE_DEPOSIT | ACTIVITY_TYPE_TRANSFER_IN | ACTIVITY_TYPE_CREDIT => {
                Decimal::ONE
            }
            ACTIVITY_TYPE_WITHDRAWAL | ACTIVITY_TYPE_TRANSFER_OUT => -Decimal::ONE,
            _ => continue,
        };

        let original_amount = activity.amt().abs();
        let date = activity.effective_date();
        let amount_base = match fx.convert_currency_for_date(
            original_amount,
            &activity.currency,
            base_currency,
            date,
        ) {
            Ok(amount) => amount,
            Err(error) => {
                warnings.push(PeriodSummaryWarning {
                    code: "missing_fx".to_string(),
                    message: format!(
                        "Could not convert {} activity {} from {} to {}: {}",
                        activity.effective_type(),
                        activity.id,
                        activity.currency,
                        base_currency,
                        error
                    ),
                    account_id: Some(activity.account_id.clone()),
                    holding_id: activity.asset_id.clone(),
                });
                continue;
            }
        };

        let signed_base = amount_base * direction;
        let signed_original = original_amount * direction;
        let item = MoneyMovementItem {
            activity_id: activity.id.clone(),
            account_id: activity.account_id.clone(),
            account_name: account_names.get(&activity.account_id).cloned(),
            date,
            activity_type: activity.effective_type().to_string(),
            amount_base: signed_base,
            amount_original: signed_original,
            original_currency: activity.currency.clone(),
            note: activity.notes.clone(),
        };

        if signed_base.is_sign_positive() || signed_base.is_zero() && direction.is_sign_positive() {
            inflows_total += signed_base;
            inflows.push(item);
        } else {
            outflows_total += signed_base.abs();
            outflows.push(item);
        }
    }

    sort_by_abs_desc(&mut inflows);
    sort_by_abs_desc(&mut outflows);
    inflows.truncate(3);
    outflows.truncate(3);

    (
        MoneyMovementSummary {
            inflows_total,
            outflows_total,
            net: inflows_total - outflows_total,
            top_inflows: inflows,
            top_outflows: outflows,
        },
        warnings,
    )
}

#[allow(dead_code)]
fn sort_by_abs_desc(items: &mut [MoneyMovementItem]) {
    items.sort_by(|a, b| {
        b.amount_base
            .abs()
            .partial_cmp(&a.amount_base.abs())
            .unwrap_or(Ordering::Equal)
    });
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct HoldingKey {
    account_id: Option<String>,
    holding_id: String,
}

#[derive(Debug, Clone)]
struct HoldingPeriodValue {
    name: String,
    symbol: Option<String>,
    account_name: Option<String>,
    quantity: Decimal,
    value_base: Decimal,
    is_liability: bool,
}

#[allow(dead_code)]
fn build_value_movement_from_values(
    start: HashMap<HoldingKey, HoldingPeriodValue>,
    end: HashMap<HoldingKey, HoldingPeriodValue>,
) -> ValueMovementSummary {
    let mut gains = Vec::new();
    let mut losses = Vec::new();
    let mut gains_total = Decimal::ZERO;
    let mut losses_total = Decimal::ZERO;

    let keys: HashSet<HoldingKey> = start.keys().chain(end.keys()).cloned().collect();

    for key in keys {
        let start_value = start.get(&key);
        let end_value = end.get(&key);
        let Some(display_value) = end_value.or(start_value) else {
            continue;
        };

        let start_amount = start_value
            .map(|value| value.value_base)
            .unwrap_or(Decimal::ZERO);
        let end_amount = end_value
            .map(|value| value.value_base)
            .unwrap_or(Decimal::ZERO);

        let quantity_changed = match (start_value, end_value) {
            (Some(start), Some(end)) => start.quantity != end.quantity,
            _ => true,
        };

        let is_liability = display_value.is_liability;
        let movement = if is_liability {
            start_amount - end_amount
        } else {
            end_amount - start_amount
        };

        if movement.is_zero() {
            continue;
        }

        let reason = if is_liability {
            ValueMovementReason::Liability
        } else if quantity_changed {
            ValueMovementReason::Residual
        } else {
            ValueMovementReason::Price
        };

        let percent_change = if start_amount.is_zero() {
            None
        } else {
            Some(movement / start_amount.abs())
        };

        let item = ValueMovementItem {
            holding_id: key.holding_id,
            account_id: key.account_id,
            account_name: display_value.account_name.clone(),
            name: display_value.name.clone(),
            symbol: display_value.symbol.clone(),
            amount_base: movement,
            percent_change,
            reason,
        };

        if movement.is_sign_positive() {
            gains_total += movement;
            gains.push(item);
        } else {
            losses_total += movement.abs();
            losses.push(item);
        }
    }

    sort_value_by_abs_desc(&mut gains);
    sort_value_by_abs_desc(&mut losses);
    gains.truncate(5);
    losses.truncate(5);

    ValueMovementSummary {
        gains_total,
        losses_total,
        net: gains_total - losses_total,
        top_gains: gains,
        top_losses: losses,
    }
}

#[allow(dead_code)]
fn sort_value_by_abs_desc(items: &mut [ValueMovementItem]) {
    items.sort_by(|a, b| {
        b.amount_base
            .abs()
            .partial_cmp(&a.amount_base.abs())
            .unwrap_or(Ordering::Equal)
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::activities::{
        Activity, ActivityStatus, ACTIVITY_SUBTYPE_BONUS, ACTIVITY_TYPE_CREDIT,
        ACTIVITY_TYPE_DEPOSIT, ACTIVITY_TYPE_TRANSFER_IN, ACTIVITY_TYPE_TRANSFER_OUT,
        ACTIVITY_TYPE_WITHDRAWAL,
    };
    use crate::errors::{Error, Result};
    use crate::fx::{ExchangeRate, FxServiceTrait, NewExchangeRate};
    use async_trait::async_trait;
    use chrono::{NaiveDate, TimeZone, Utc};
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use serde_json::json;
    use std::collections::{HashMap, HashSet};

    struct MockFxService {
        failing_currencies: HashSet<String>,
    }

    impl MockFxService {
        fn identity() -> Self {
            Self {
                failing_currencies: HashSet::new(),
            }
        }

        fn failing_for(currency: &str) -> Self {
            Self {
                failing_currencies: HashSet::from([currency.to_string()]),
            }
        }
    }

    #[async_trait]
    impl FxServiceTrait for MockFxService {
        fn initialize(&self) -> Result<()> {
            Ok(())
        }

        fn get_historical_rates(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _days: i64,
        ) -> Result<Vec<ExchangeRate>> {
            Ok(Vec::new())
        }

        fn get_latest_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<Decimal> {
            Ok(Decimal::ONE)
        }

        fn get_exchange_rate_for_date(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _date: NaiveDate,
        ) -> Result<Decimal> {
            Ok(Decimal::ONE)
        }

        fn convert_currency(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
        ) -> Result<Decimal> {
            self.convert_currency_for_date(
                amount,
                from_currency,
                to_currency,
                NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            )
        }

        fn convert_currency_for_date(
            &self,
            amount: Decimal,
            from_currency: &str,
            _to_currency: &str,
            _date: NaiveDate,
        ) -> Result<Decimal> {
            if self.failing_currencies.contains(from_currency) {
                return Err(Error::CurrencyConversionFailed(format!(
                    "missing FX for {}",
                    from_currency
                )));
            }
            Ok(amount)
        }

        fn get_latest_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
            Ok(Vec::new())
        }

        async fn add_exchange_rate(&self, _new_rate: NewExchangeRate) -> Result<ExchangeRate> {
            unimplemented!("not needed for period summary tests")
        }

        async fn update_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _rate: Decimal,
        ) -> Result<ExchangeRate> {
            unimplemented!("not needed for period summary tests")
        }

        async fn delete_exchange_rate(&self, _rate_id: &str) -> Result<()> {
            unimplemented!("not needed for period summary tests")
        }

        async fn register_currency_pair(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<()> {
            Ok(())
        }

        async fn register_currency_pair_manual(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<()> {
            Ok(())
        }

        async fn ensure_fx_pairs(&self, _pairs: Vec<(String, String)>) -> Result<()> {
            Ok(())
        }
    }

    fn activity(id: &str, account_id: &str, activity_type: &str, amount: Decimal) -> Activity {
        Activity {
            id: id.to_string(),
            account_id: account_id.to_string(),
            asset_id: None,
            activity_type: activity_type.to_string(),
            activity_type_override: None,
            source_type: None,
            subtype: None,
            status: ActivityStatus::Posted,
            activity_date: Utc.with_ymd_and_hms(2026, 6, 15, 12, 0, 0).unwrap(),
            settlement_date: None,
            quantity: None,
            unit_price: None,
            amount: Some(amount),
            fee: None,
            currency: "USD".to_string(),
            fx_rate: None,
            notes: None,
            metadata: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
            idempotency_key: None,
            import_run_id: None,
            is_user_modified: false,
            needs_review: false,
            created_at: Utc.with_ymd_and_hms(2026, 6, 15, 12, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2026, 6, 15, 12, 0, 0).unwrap(),
        }
    }

    #[test]
    fn money_deposit_with_note_becomes_top_inflow() {
        let mut deposit = activity("a1", "account-1", ACTIVITY_TYPE_DEPOSIT, dec!(5000));
        deposit.notes = Some("Salary".to_string());
        let account_names = HashMap::from([("account-1".to_string(), "Checking".to_string())]);

        let (summary, warnings) =
            build_money_movement(&[deposit], &account_names, "USD", &MockFxService::identity());

        assert!(warnings.is_empty());
        assert_eq!(summary.inflows_total, dec!(5000));
        assert_eq!(summary.outflows_total, Decimal::ZERO);
        assert_eq!(summary.net, dec!(5000));
        assert_eq!(summary.top_inflows[0].note.as_deref(), Some("Salary"));
        assert_eq!(
            summary.top_inflows[0].account_name.as_deref(),
            Some("Checking")
        );
    }

    #[test]
    fn money_withdrawal_with_note_becomes_top_outflow() {
        let mut withdrawal = activity("a1", "account-1", ACTIVITY_TYPE_WITHDRAWAL, dec!(1200));
        withdrawal.notes = Some("Rent".to_string());

        let (summary, warnings) = build_money_movement(
            &[withdrawal],
            &HashMap::new(),
            "USD",
            &MockFxService::identity(),
        );

        assert!(warnings.is_empty());
        assert_eq!(summary.inflows_total, Decimal::ZERO);
        assert_eq!(summary.outflows_total, dec!(1200));
        assert_eq!(summary.net, dec!(-1200));
        assert_eq!(summary.top_outflows[0].note.as_deref(), Some("Rent"));
        assert_eq!(summary.top_outflows[0].amount_base, dec!(-1200));
    }

    #[test]
    fn money_internal_transfer_is_ignored_but_external_transfer_out_is_included() {
        let internal = activity("a1", "account-1", ACTIVITY_TYPE_TRANSFER_IN, dec!(1000));
        let mut external = activity("a2", "account-1", ACTIVITY_TYPE_TRANSFER_OUT, dec!(700));
        external.metadata = Some(json!({ "flow": { "is_external": true } }));

        let (summary, warnings) = build_money_movement(
            &[internal, external],
            &HashMap::new(),
            "USD",
            &MockFxService::identity(),
        );

        assert!(warnings.is_empty());
        assert_eq!(summary.inflows_total, Decimal::ZERO);
        assert_eq!(summary.outflows_total, dec!(700));
        assert_eq!(summary.top_outflows.len(), 1);
        assert_eq!(summary.top_outflows[0].activity_id, "a2");
    }

    #[test]
    fn money_bonus_credit_is_included_as_inflow() {
        let mut bonus = activity("a1", "account-1", ACTIVITY_TYPE_CREDIT, dec!(100));
        bonus.subtype = Some(ACTIVITY_SUBTYPE_BONUS.to_string());

        let (summary, warnings) =
            build_money_movement(&[bonus], &HashMap::new(), "USD", &MockFxService::identity());

        assert!(warnings.is_empty());
        assert_eq!(summary.inflows_total, dec!(100));
        assert_eq!(summary.net, dec!(100));
    }

    #[test]
    fn money_missing_fx_returns_warning_and_excludes_flow() {
        let mut deposit = activity("a1", "account-1", ACTIVITY_TYPE_DEPOSIT, dec!(5000));
        deposit.currency = "HKD".to_string();

        let (summary, warnings) = build_money_movement(
            &[deposit],
            &HashMap::new(),
            "USD",
            &MockFxService::failing_for("HKD"),
        );

        assert_eq!(summary.inflows_total, Decimal::ZERO);
        assert_eq!(summary.net, Decimal::ZERO);
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].code, "missing_fx");
        assert_eq!(warnings[0].account_id.as_deref(), Some("account-1"));
    }

    fn holding_value(
        name: &str,
        quantity: Decimal,
        value_base: Decimal,
    ) -> HoldingPeriodValue {
        HoldingPeriodValue {
            name: name.to_string(),
            symbol: Some(name.to_uppercase()),
            account_name: Some("Brokerage".to_string()),
            quantity,
            value_base,
            is_liability: false,
        }
    }

    fn holding_key(id: &str) -> HoldingKey {
        HoldingKey {
            account_id: Some("account-1".to_string()),
            holding_id: id.to_string(),
        }
    }

    #[test]
    fn value_unchanged_quantity_and_higher_value_becomes_gain() {
        let start = HashMap::from([(
            holding_key("nvda"),
            holding_value("NVDA", dec!(2), dec!(1000)),
        )]);
        let end = HashMap::from([(
            holding_key("nvda"),
            holding_value("NVDA", dec!(2), dec!(1800)),
        )]);

        let summary = build_value_movement_from_values(start, end);

        assert_eq!(summary.gains_total, dec!(800));
        assert_eq!(summary.losses_total, Decimal::ZERO);
        assert_eq!(summary.net, dec!(800));
        assert_eq!(summary.top_gains[0].holding_id, "nvda");
        assert_eq!(summary.top_gains[0].reason, ValueMovementReason::Price);
    }

    #[test]
    fn value_unchanged_quantity_and_lower_value_becomes_loss() {
        let start = HashMap::from([(
            holding_key("btc"),
            holding_value("BTC", dec!(1), dec!(5000)),
        )]);
        let end = HashMap::from([(
            holding_key("btc"),
            holding_value("BTC", dec!(1), dec!(1000)),
        )]);

        let summary = build_value_movement_from_values(start, end);

        assert_eq!(summary.gains_total, Decimal::ZERO);
        assert_eq!(summary.losses_total, dec!(4000));
        assert_eq!(summary.net, dec!(-4000));
        assert_eq!(summary.top_losses[0].amount_base, dec!(-4000));
    }

    #[test]
    fn value_larger_liability_balance_becomes_loss() {
        let mut start_value = holding_value("Card debt", Decimal::ONE, dec!(1200));
        start_value.is_liability = true;
        let mut end_value = holding_value("Card debt", Decimal::ONE, dec!(1600));
        end_value.is_liability = true;

        let summary = build_value_movement_from_values(
            HashMap::from([(holding_key("liability"), start_value)]),
            HashMap::from([(holding_key("liability"), end_value)]),
        );

        assert_eq!(summary.losses_total, dec!(400));
        assert_eq!(summary.net, dec!(-400));
        assert_eq!(summary.top_losses[0].reason, ValueMovementReason::Liability);
    }

    #[test]
    fn value_smaller_liability_balance_becomes_gain() {
        let mut start_value = holding_value("Card debt", Decimal::ONE, dec!(1600));
        start_value.is_liability = true;
        let mut end_value = holding_value("Card debt", Decimal::ONE, dec!(1200));
        end_value.is_liability = true;

        let summary = build_value_movement_from_values(
            HashMap::from([(holding_key("liability"), start_value)]),
            HashMap::from([(holding_key("liability"), end_value)]),
        );

        assert_eq!(summary.gains_total, dec!(400));
        assert_eq!(summary.net, dec!(400));
        assert_eq!(summary.top_gains[0].reason, ValueMovementReason::Liability);
    }

    #[test]
    fn value_changed_quantity_is_classified_as_residual() {
        let start = HashMap::from([(
            holding_key("aapl"),
            holding_value("AAPL", dec!(2), dec!(1000)),
        )]);
        let end = HashMap::from([(
            holding_key("aapl"),
            holding_value("AAPL", dec!(3), dec!(1400)),
        )]);

        let summary = build_value_movement_from_values(start, end);

        assert_eq!(summary.gains_total, dec!(400));
        assert_eq!(summary.top_gains[0].reason, ValueMovementReason::Residual);
    }

    #[test]
    fn value_ranking_keeps_top_five_each_side_by_absolute_amount() {
        let mut start = HashMap::new();
        let mut end = HashMap::new();

        for index in 1..=6 {
            let id = format!("gain-{index}");
            start.insert(holding_key(&id), holding_value(&id, Decimal::ONE, dec!(100)));
            end.insert(
                holding_key(&id),
                holding_value(&id, Decimal::ONE, Decimal::from(index * 100)),
            );
        }

        for index in 1..=6 {
            let id = format!("loss-{index}");
            start.insert(
                holding_key(&id),
                holding_value(&id, Decimal::ONE, Decimal::from(index * 100)),
            );
            end.insert(holding_key(&id), holding_value(&id, Decimal::ONE, dec!(0)));
        }

        let summary = build_value_movement_from_values(start, end);

        assert_eq!(summary.top_gains.len(), 5);
        assert_eq!(summary.top_losses.len(), 5);
        assert_eq!(summary.top_gains[0].holding_id, "gain-6");
        assert_eq!(summary.top_losses[0].holding_id, "loss-6");
    }
}
