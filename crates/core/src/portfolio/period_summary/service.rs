use super::model::{
    MoneyMovementItem, MoneyMovementSummary, PeriodSummary, PeriodSummaryPeriod,
    PeriodSummaryResidual, PeriodSummaryWarning, ValueMovementItem, ValueMovementReason,
    ValueMovementSummary,
};
use crate::accounts::AccountServiceTrait;
use crate::activities::{
    Activity, ActivityServiceTrait, ACTIVITY_TYPE_CREDIT, ACTIVITY_TYPE_DEPOSIT,
    ACTIVITY_TYPE_TRANSFER_IN, ACTIVITY_TYPE_TRANSFER_OUT, ACTIVITY_TYPE_WITHDRAWAL,
};
use crate::assets::{Asset, AssetKind, AssetServiceTrait};
use crate::errors::{Error, Result, ValidationError};
use crate::fx::FxServiceTrait;
use crate::portfolio::net_worth::NetWorthHistoryPoint;
use crate::portfolio::performance::{classify_flow_for_scope, FlowType, PerformanceScope};
use crate::portfolio::snapshot::SnapshotRepositoryTrait;
use crate::quotes::{Quote, QuoteServiceTrait};
use async_trait::async_trait;
use chrono::NaiveDate;
use rust_decimal::Decimal;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

pub struct PeriodSummaryService {
    base_currency: Arc<RwLock<String>>,
    account_service: Arc<dyn AccountServiceTrait>,
    activity_service: Arc<dyn ActivityServiceTrait>,
    asset_service: Arc<dyn AssetServiceTrait>,
    snapshot_repository: Arc<dyn SnapshotRepositoryTrait>,
    quote_service: Arc<dyn QuoteServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
    net_worth_service: Arc<dyn crate::portfolio::net_worth::NetWorthServiceTrait>,
}

impl PeriodSummaryService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        base_currency: Arc<RwLock<String>>,
        account_service: Arc<dyn AccountServiceTrait>,
        activity_service: Arc<dyn ActivityServiceTrait>,
        asset_service: Arc<dyn AssetServiceTrait>,
        snapshot_repository: Arc<dyn SnapshotRepositoryTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
        net_worth_service: Arc<dyn crate::portfolio::net_worth::NetWorthServiceTrait>,
    ) -> Self {
        Self {
            base_currency,
            account_service,
            activity_service,
            asset_service,
            snapshot_repository,
            quote_service,
            fx_service,
            net_worth_service,
        }
    }

    async fn build_holding_values(
        &self,
        account_ids: &[String],
        account_names: &HashMap<String, String>,
        date: NaiveDate,
        base_currency: &str,
    ) -> Result<(
        HashMap<HoldingKey, HoldingPeriodValue>,
        Vec<PeriodSummaryWarning>,
    )> {
        let snapshots = self
            .snapshot_repository
            .get_latest_snapshots_before_date(account_ids, date)?;
        let asset_ids = snapshots
            .values()
            .flat_map(|snapshot| snapshot.positions.keys().cloned())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let assets = self
            .asset_service
            .get_assets_by_asset_ids(&asset_ids)
            .await?;
        let assets_by_id = assets
            .into_iter()
            .map(|asset| (asset.id.clone(), asset))
            .collect::<HashMap<_, _>>();

        let mut values = HashMap::new();
        let mut warnings = Vec::new();

        for snapshot in snapshots.values() {
            for position in snapshot.positions.values() {
                if position.quantity.is_zero() {
                    continue;
                }

                let Some(asset) = assets_by_id.get(&position.asset_id) else {
                    warnings.push(PeriodSummaryWarning {
                        code: "missing_asset".to_string(),
                        message: format!(
                            "Could not find asset metadata for holding {}.",
                            position.asset_id
                        ),
                        account_id: Some(snapshot.account_id.clone()),
                        holding_id: Some(position.asset_id.clone()),
                    });
                    continue;
                };

                let quote = match self.latest_quote_as_of(&position.asset_id, date) {
                    Ok(Some(quote)) => quote,
                    Ok(None) => {
                        warnings.push(PeriodSummaryWarning {
                            code: "missing_quote".to_string(),
                            message: format!(
                                "Could not find a quote for holding {} on or before {}.",
                                position.asset_id, date
                            ),
                            account_id: Some(snapshot.account_id.clone()),
                            holding_id: Some(position.asset_id.clone()),
                        });
                        continue;
                    }
                    Err(error) => {
                        warnings.push(PeriodSummaryWarning {
                            code: "quote_lookup_failed".to_string(),
                            message: format!(
                                "Could not load quotes for holding {}: {}",
                                position.asset_id, error
                            ),
                            account_id: Some(snapshot.account_id.clone()),
                            holding_id: Some(position.asset_id.clone()),
                        });
                        continue;
                    }
                };

                let value_local = position.quantity * quote.close;
                let value_base = match self.fx_service.convert_currency_for_date(
                    value_local,
                    &quote.currency,
                    base_currency,
                    date,
                ) {
                    Ok(value) => value,
                    Err(error) => {
                        warnings.push(PeriodSummaryWarning {
                            code: "missing_fx".to_string(),
                            message: format!(
                                "Could not convert holding {} from {} to {}: {}",
                                position.asset_id, quote.currency, base_currency, error
                            ),
                            account_id: Some(snapshot.account_id.clone()),
                            holding_id: Some(position.asset_id.clone()),
                        });
                        continue;
                    }
                };

                values.insert(
                    HoldingKey {
                        account_id: Some(snapshot.account_id.clone()),
                        holding_id: position.asset_id.clone(),
                    },
                    HoldingPeriodValue {
                        name: holding_name(asset),
                        symbol: asset.display_code.clone(),
                        account_name: account_names.get(&snapshot.account_id).cloned(),
                        quantity: position.quantity,
                        value_base,
                        is_liability: asset.kind == AssetKind::Liability,
                    },
                );
            }
        }

        Ok((values, warnings))
    }

    fn latest_quote_as_of(&self, asset_id: &str, date: NaiveDate) -> Result<Option<Quote>> {
        let quotes = self.quote_service.get_historical_quotes(asset_id)?;
        Ok(quotes
            .into_iter()
            .filter(|quote| quote.timestamp.date_naive() <= date)
            .max_by_key(|quote| quote.timestamp.date_naive()))
    }
}

#[async_trait]
pub trait PeriodSummaryServiceTrait: Send + Sync {
    async fn get_period_summary(
        &self,
        start_date: NaiveDate,
        end_date: NaiveDate,
        period: PeriodSummaryPeriod,
    ) -> Result<PeriodSummary>;
}

#[async_trait]
impl PeriodSummaryServiceTrait for PeriodSummaryService {
    async fn get_period_summary(
        &self,
        start_date: NaiveDate,
        end_date: NaiveDate,
        period: PeriodSummaryPeriod,
    ) -> Result<PeriodSummary> {
        if start_date > end_date {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Period summary start date must be on or before end date.".to_string(),
            )));
        }

        let base_currency = self
            .base_currency
            .read()
            .map(|currency| currency.clone())
            .ok()
            .filter(|currency| !currency.trim().is_empty())
            .unwrap_or_else(|| "USD".to_string());
        let accounts = self.account_service.get_non_archived_accounts()?;
        let account_ids = accounts
            .iter()
            .map(|account| account.id.clone())
            .collect::<Vec<_>>();
        let account_names = accounts
            .into_iter()
            .map(|account| (account.id, account.name))
            .collect::<HashMap<_, _>>();
        let mut history = self
            .net_worth_service
            .get_net_worth_history(start_date, end_date)?;
        history.sort_by_key(|point| point.date);

        if history.len() < 2 {
            return Ok(build_period_summary_from_parts(
                start_date,
                end_date,
                period,
                &base_currency,
                &history,
                &[],
                &account_names,
                HashMap::new(),
                HashMap::new(),
                self.fx_service.as_ref(),
            ));
        }

        let actual_start_date = history.first().expect("history length checked").date;
        let actual_end_date = history.last().expect("history length checked").date;
        let activities = if account_ids.is_empty() {
            Vec::new()
        } else {
            self.activity_service
                .get_activities_by_account_ids(&account_ids)?
        };
        let (start_values, mut holding_warnings) = self
            .build_holding_values(
                &account_ids,
                &account_names,
                actual_start_date,
                &base_currency,
            )
            .await?;
        let (end_values, mut end_holding_warnings) = self
            .build_holding_values(
                &account_ids,
                &account_names,
                actual_end_date,
                &base_currency,
            )
            .await?;
        holding_warnings.append(&mut end_holding_warnings);

        let mut summary = build_period_summary_from_parts(
            start_date,
            end_date,
            period,
            &base_currency,
            &history,
            &activities,
            &account_names,
            start_values,
            end_values,
            self.fx_service.as_ref(),
        );
        summary.warnings.extend(holding_warnings);
        Ok(summary)
    }
}

fn holding_name(asset: &Asset) -> String {
    asset
        .name
        .clone()
        .or_else(|| asset.display_code.clone())
        .unwrap_or_else(|| asset.id.clone())
}

#[allow(dead_code)]
fn build_period_summary_from_parts(
    requested_start_date: NaiveDate,
    requested_end_date: NaiveDate,
    period: PeriodSummaryPeriod,
    base_currency: &str,
    history: &[NetWorthHistoryPoint],
    activities: &[Activity],
    account_names: &HashMap<String, String>,
    start_values: HashMap<HoldingKey, HoldingPeriodValue>,
    end_values: HashMap<HoldingKey, HoldingPeriodValue>,
    fx: &dyn FxServiceTrait,
) -> PeriodSummary {
    if history.len() < 2 {
        return PeriodSummary {
            summary_key: summary_key(
                &period,
                requested_start_date,
                requested_end_date,
                base_currency,
            ),
            requested_start_date,
            requested_end_date,
            actual_start_date: None,
            actual_end_date: None,
            period,
            currency: base_currency.to_string(),
            start_net_worth: Decimal::ZERO,
            end_net_worth: Decimal::ZERO,
            total_change: Decimal::ZERO,
            money_movement: empty_money_movement(),
            value_movement: empty_value_movement(),
            residual: PeriodSummaryResidual {
                amount: Decimal::ZERO,
                reason: None,
            },
            warnings: vec![PeriodSummaryWarning {
                code: "insufficient_net_worth_history".to_string(),
                message:
                    "At least two net worth history points are needed to build a period summary."
                        .to_string(),
                account_id: None,
                holding_id: None,
            }],
        };
    }

    let first = history.first().expect("history length checked");
    let last = history.last().expect("history length checked");
    let actual_start_date = first.date;
    let actual_end_date = last.date;

    let period_activities = activities
        .iter()
        .filter(|activity| {
            activity.is_posted()
                && activity.effective_date() > actual_start_date
                && activity.effective_date() <= actual_end_date
        })
        .cloned()
        .collect::<Vec<_>>();

    let (money_movement, mut warnings) =
        build_money_movement(&period_activities, account_names, base_currency, fx);
    let mut value_movement = build_value_movement_from_values(start_values, end_values);
    let portfolio_cash_fx_movement =
        (last.portfolio_value - first.portfolio_value) - money_movement.net - value_movement.net;
    add_value_movement_item(
        &mut value_movement,
        ValueMovementItem {
            holding_id: "__cash_and_fx__".to_string(),
            account_id: None,
            account_name: None,
            name: "Cash and FX".to_string(),
            symbol: Some("Cash".to_string()),
            amount_base: portfolio_cash_fx_movement,
            percent_change: None,
            reason: ValueMovementReason::Fx,
        },
    );
    add_value_movement_item(
        &mut value_movement,
        ValueMovementItem {
            holding_id: "__alternative_assets__".to_string(),
            account_id: None,
            account_name: None,
            name: "Alternative assets".to_string(),
            symbol: None,
            amount_base: last.alternative_assets_value - first.alternative_assets_value,
            percent_change: percent_change(
                first.alternative_assets_value,
                last.alternative_assets_value - first.alternative_assets_value,
            ),
            reason: ValueMovementReason::Valuation,
        },
    );
    add_value_movement_item(
        &mut value_movement,
        ValueMovementItem {
            holding_id: "__liabilities__".to_string(),
            account_id: None,
            account_name: None,
            name: "Liabilities".to_string(),
            symbol: None,
            amount_base: first.total_liabilities - last.total_liabilities,
            percent_change: percent_change(
                first.total_liabilities,
                first.total_liabilities - last.total_liabilities,
            ),
            reason: ValueMovementReason::Liability,
        },
    );
    let total_change = last.net_worth - first.net_worth;
    let residual_amount = total_change - money_movement.net - value_movement.net;

    PeriodSummary {
        summary_key: summary_key(&period, actual_start_date, actual_end_date, base_currency),
        requested_start_date,
        requested_end_date,
        actual_start_date: Some(actual_start_date),
        actual_end_date: Some(actual_end_date),
        period,
        currency: base_currency.to_string(),
        start_net_worth: first.net_worth,
        end_net_worth: last.net_worth,
        total_change,
        money_movement,
        value_movement,
        residual: PeriodSummaryResidual {
            amount: residual_amount,
            reason: if residual_amount.is_zero() {
                None
            } else {
                Some("Unclassified change from holdings, cash, FX, or data gaps.".to_string())
            },
        },
        warnings: {
            if !residual_amount.is_zero() {
                warnings.push(PeriodSummaryWarning {
                    code: "summary_residual".to_string(),
                    message: "Some net worth movement could not be assigned to a specific activity or holding."
                        .to_string(),
                    account_id: None,
                    holding_id: None,
                });
            }
            warnings
        },
    }
}

#[allow(dead_code)]
fn summary_key(
    period: &PeriodSummaryPeriod,
    start_date: NaiveDate,
    end_date: NaiveDate,
    currency: &str,
) -> String {
    format!(
        "{}:{}:{}:{}",
        period.as_str(),
        start_date,
        end_date,
        currency
    )
}

#[allow(dead_code)]
fn empty_money_movement() -> MoneyMovementSummary {
    MoneyMovementSummary {
        inflows_total: Decimal::ZERO,
        outflows_total: Decimal::ZERO,
        net: Decimal::ZERO,
        top_inflows: Vec::new(),
        top_outflows: Vec::new(),
    }
}

#[allow(dead_code)]
fn empty_value_movement() -> ValueMovementSummary {
    ValueMovementSummary {
        gains_total: Decimal::ZERO,
        losses_total: Decimal::ZERO,
        net: Decimal::ZERO,
        top_gains: Vec::new(),
        top_losses: Vec::new(),
    }
}

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
        let is_liability = display_value.is_liability;
        let movement = match (start_value, end_value) {
            (Some(start), Some(end)) if is_liability => start.value_base - end.value_base,
            (Some(start), Some(end)) if start.quantity == end.quantity => {
                end.value_base - start.value_base
            }
            (Some(start), Some(end)) => {
                let Some(start_unit_value) = unit_value(start) else {
                    continue;
                };
                let Some(end_unit_value) = unit_value(end) else {
                    continue;
                };
                min_decimal(start.quantity.abs(), end.quantity.abs())
                    * (end_unit_value - start_unit_value)
            }
            (Some(start), None) if is_liability => start.value_base,
            (None, Some(end)) if is_liability => -end.value_base,
            _ => Decimal::ZERO,
        };

        if movement.is_zero() {
            continue;
        }

        let reason = if is_liability {
            ValueMovementReason::Liability
        } else {
            ValueMovementReason::Price
        };

        let percent_change = percent_change(start_amount, movement);

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

        add_value_movement_raw(
            &mut gains,
            &mut losses,
            &mut gains_total,
            &mut losses_total,
            item,
        );
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

fn unit_value(value: &HoldingPeriodValue) -> Option<Decimal> {
    if value.quantity.is_zero() {
        return None;
    }
    Some(value.value_base / value.quantity.abs())
}

fn min_decimal(a: Decimal, b: Decimal) -> Decimal {
    if a <= b {
        a
    } else {
        b
    }
}

fn percent_change(start_amount: Decimal, movement: Decimal) -> Option<Decimal> {
    if start_amount.is_zero() {
        None
    } else {
        Some(movement / start_amount.abs())
    }
}

fn add_value_movement_item(summary: &mut ValueMovementSummary, item: ValueMovementItem) {
    add_value_movement_raw(
        &mut summary.top_gains,
        &mut summary.top_losses,
        &mut summary.gains_total,
        &mut summary.losses_total,
        item,
    );
    summary.net = summary.gains_total - summary.losses_total;
    sort_value_by_abs_desc(&mut summary.top_gains);
    sort_value_by_abs_desc(&mut summary.top_losses);
    summary.top_gains.truncate(5);
    summary.top_losses.truncate(5);
}

fn add_value_movement_raw(
    gains: &mut Vec<ValueMovementItem>,
    losses: &mut Vec<ValueMovementItem>,
    gains_total: &mut Decimal,
    losses_total: &mut Decimal,
    item: ValueMovementItem,
) {
    if item.amount_base.is_zero() {
        return;
    }

    if item.amount_base.is_sign_positive() {
        *gains_total += item.amount_base;
        gains.push(item);
    } else {
        *losses_total += item.amount_base.abs();
        losses.push(item);
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
    use crate::portfolio::net_worth::NetWorthHistoryPoint;
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

    fn net_worth_point(date: NaiveDate, net_worth: Decimal) -> NetWorthHistoryPoint {
        NetWorthHistoryPoint {
            date,
            portfolio_value: net_worth,
            alternative_assets_value: Decimal::ZERO,
            total_liabilities: Decimal::ZERO,
            total_assets: net_worth,
            net_worth,
            net_contribution: Decimal::ZERO,
            currency: "USD".to_string(),
        }
    }

    fn net_worth_components(
        date: NaiveDate,
        portfolio_value: Decimal,
        alternative_assets_value: Decimal,
        total_liabilities: Decimal,
    ) -> NetWorthHistoryPoint {
        NetWorthHistoryPoint {
            date,
            portfolio_value,
            alternative_assets_value,
            total_liabilities,
            total_assets: portfolio_value + alternative_assets_value,
            net_worth: portfolio_value + alternative_assets_value - total_liabilities,
            net_contribution: Decimal::ZERO,
            currency: "USD".to_string(),
        }
    }

    #[test]
    fn money_deposit_with_note_becomes_top_inflow() {
        let mut deposit = activity("a1", "account-1", ACTIVITY_TYPE_DEPOSIT, dec!(5000));
        deposit.notes = Some("Salary".to_string());
        let account_names = HashMap::from([("account-1".to_string(), "Checking".to_string())]);

        let (summary, warnings) = build_money_movement(
            &[deposit],
            &account_names,
            "USD",
            &MockFxService::identity(),
        );

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

    fn holding_value(name: &str, quantity: Decimal, value_base: Decimal) -> HoldingPeriodValue {
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
    fn value_changed_quantity_only_counts_market_movement_on_common_units() {
        let start = HashMap::from([(
            holding_key("aapl"),
            holding_value("AAPL", dec!(2), dec!(1000)),
        )]);
        let end = HashMap::from([(
            holding_key("aapl"),
            holding_value("AAPL", dec!(3), dec!(1800)),
        )]);

        let summary = build_value_movement_from_values(start, end);

        assert_eq!(summary.gains_total, dec!(200));
        assert_eq!(summary.top_gains[0].reason, ValueMovementReason::Price);
    }

    #[test]
    fn value_new_purchase_is_not_counted_as_market_gain() {
        let end = HashMap::from([(
            holding_key("aapl"),
            holding_value("AAPL", dec!(10), dec!(1000)),
        )]);

        let summary = build_value_movement_from_values(HashMap::new(), end);

        assert_eq!(summary.gains_total, Decimal::ZERO);
        assert_eq!(summary.losses_total, Decimal::ZERO);
        assert_eq!(summary.net, Decimal::ZERO);
    }

    #[test]
    fn value_quantity_increase_only_counts_price_movement_on_existing_units() {
        let start = HashMap::from([(
            holding_key("aapl"),
            holding_value("AAPL", dec!(10), dec!(1000)),
        )]);
        let end = HashMap::from([(
            holding_key("aapl"),
            holding_value("AAPL", dec!(20), dec!(3000)),
        )]);

        let summary = build_value_movement_from_values(start, end);

        assert_eq!(summary.gains_total, dec!(500));
        assert_eq!(summary.net, dec!(500));
        assert_eq!(summary.top_gains[0].reason, ValueMovementReason::Price);
    }

    #[test]
    fn value_ranking_keeps_top_five_each_side_by_absolute_amount() {
        let mut start = HashMap::new();
        let mut end = HashMap::new();

        for index in 1..=6 {
            let id = format!("gain-{index}");
            start.insert(
                holding_key(&id),
                holding_value(&id, Decimal::ONE, dec!(100)),
            );
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

    #[test]
    fn summary_with_less_than_two_net_worth_points_returns_warning() {
        let summary = build_period_summary_from_parts(
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            PeriodSummaryPeriod::Monthly,
            "USD",
            &[net_worth_point(
                NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
                dec!(1000),
            )],
            &[],
            &HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            &MockFxService::identity(),
        );

        assert_eq!(summary.actual_start_date, None);
        assert_eq!(summary.total_change, Decimal::ZERO);
        assert_eq!(summary.warnings.len(), 1);
        assert_eq!(summary.warnings[0].code, "insufficient_net_worth_history");
    }

    #[test]
    fn summary_salary_only_period_reconciles_through_money_movement() {
        let mut salary = activity("salary", "checking", ACTIVITY_TYPE_DEPOSIT, dec!(5000));
        salary.notes = Some("Salary".to_string());
        let account_names = HashMap::from([("checking".to_string(), "Checking".to_string())]);
        let history = vec![
            net_worth_point(NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(), dec!(1000)),
            net_worth_point(NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(), dec!(6000)),
        ];

        let summary = build_period_summary_from_parts(
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            PeriodSummaryPeriod::Monthly,
            "USD",
            &history,
            &[salary],
            &account_names,
            HashMap::new(),
            HashMap::new(),
            &MockFxService::identity(),
        );

        assert_eq!(summary.total_change, dec!(5000));
        assert_eq!(summary.money_movement.net, dec!(5000));
        assert_eq!(summary.value_movement.net, Decimal::ZERO);
        assert_eq!(summary.residual.amount, Decimal::ZERO);
        assert_eq!(
            summary.money_movement.top_inflows[0].note.as_deref(),
            Some("Salary")
        );
    }

    #[test]
    fn summary_price_only_period_reconciles_through_value_movement() {
        let history = vec![
            net_worth_point(NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(), dec!(1000)),
            net_worth_point(NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(), dec!(1800)),
        ];
        let start = HashMap::from([(
            holding_key("nvda"),
            holding_value("NVDA", dec!(2), dec!(1000)),
        )]);
        let end = HashMap::from([(
            holding_key("nvda"),
            holding_value("NVDA", dec!(2), dec!(1800)),
        )]);

        let summary = build_period_summary_from_parts(
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            PeriodSummaryPeriod::Monthly,
            "USD",
            &history,
            &[],
            &HashMap::new(),
            start,
            end,
            &MockFxService::identity(),
        );

        assert_eq!(summary.total_change, dec!(800));
        assert_eq!(summary.money_movement.net, Decimal::ZERO);
        assert_eq!(summary.value_movement.net, dec!(800));
        assert_eq!(summary.residual.amount, Decimal::ZERO);
    }

    #[test]
    fn summary_residual_equals_inconsistent_unexplained_total_change() {
        let history = vec![
            NetWorthHistoryPoint {
                date: NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
                portfolio_value: dec!(1000),
                alternative_assets_value: Decimal::ZERO,
                total_liabilities: Decimal::ZERO,
                total_assets: dec!(1000),
                net_worth: dec!(1000),
                net_contribution: Decimal::ZERO,
                currency: "USD".to_string(),
            },
            NetWorthHistoryPoint {
                date: NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
                portfolio_value: dec!(1000),
                alternative_assets_value: Decimal::ZERO,
                total_liabilities: Decimal::ZERO,
                total_assets: dec!(1000),
                net_worth: dec!(1500),
                net_contribution: Decimal::ZERO,
                currency: "USD".to_string(),
            },
        ];

        let summary = build_period_summary_from_parts(
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            PeriodSummaryPeriod::Monthly,
            "USD",
            &history,
            &[],
            &HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            &MockFxService::identity(),
        );

        assert_eq!(summary.total_change, dec!(500));
        assert_eq!(summary.residual.amount, dec!(500));
        assert_eq!(
            summary.money_movement.net + summary.value_movement.net + summary.residual.amount,
            summary.total_change
        );
    }

    #[test]
    fn summary_classifies_alternative_asset_and_liability_component_changes() {
        let history = vec![
            net_worth_components(
                NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
                Decimal::ZERO,
                dec!(100000),
                dec!(20000),
            ),
            net_worth_components(
                NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
                Decimal::ZERO,
                dec!(110000),
                dec!(15000),
            ),
        ];

        let summary = build_period_summary_from_parts(
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            PeriodSummaryPeriod::Monthly,
            "USD",
            &history,
            &[],
            &HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            &MockFxService::identity(),
        );

        assert_eq!(summary.total_change, dec!(15000));
        assert_eq!(summary.value_movement.net, dec!(15000));
        assert_eq!(summary.residual.amount, Decimal::ZERO);
        assert!(summary
            .value_movement
            .top_gains
            .iter()
            .any(|item| item.reason == ValueMovementReason::Valuation
                && item.amount_base == dec!(10000)));
        assert!(summary
            .value_movement
            .top_gains
            .iter()
            .any(|item| item.reason == ValueMovementReason::Liability
                && item.amount_base == dec!(5000)));
    }

    #[test]
    fn summary_classifies_portfolio_cash_and_fx_reconciliation() {
        let history = vec![
            net_worth_components(
                NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
                dec!(7000),
                Decimal::ZERO,
                Decimal::ZERO,
            ),
            net_worth_components(
                NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
                dec!(7200),
                Decimal::ZERO,
                Decimal::ZERO,
            ),
        ];

        let summary = build_period_summary_from_parts(
            NaiveDate::from_ymd_opt(2026, 6, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 30).unwrap(),
            PeriodSummaryPeriod::Monthly,
            "USD",
            &history,
            &[],
            &HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            &MockFxService::identity(),
        );

        assert_eq!(summary.total_change, dec!(200));
        assert_eq!(summary.value_movement.net, dec!(200));
        assert_eq!(summary.residual.amount, Decimal::ZERO);
        assert_eq!(
            summary.value_movement.top_gains[0].reason,
            ValueMovementReason::Fx
        );
    }
}
