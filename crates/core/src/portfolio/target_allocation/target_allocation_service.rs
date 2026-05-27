use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use rust_decimal::Decimal;

use crate::accounts::AccountServiceTrait;
use crate::assets::{AlternativeAssetServiceTrait, AssetKind};
use crate::errors::Result;
use crate::fx::FxServiceTrait;
use crate::portfolio::holdings::{Holding, HoldingType, HoldingsServiceTrait};

use super::{
    TargetAllocationCalculator, TargetAllocationDashboard, TargetAllocationHoldingInput,
    TargetAllocationInput, TargetAllocationPlanData, TargetAllocationRepositoryTrait,
    TargetAllocationServiceTrait, TargetAllocationSubjectType, TargetAllocationView,
};

pub struct TargetAllocationService {
    repository: Arc<dyn TargetAllocationRepositoryTrait>,
    account_service: Arc<dyn AccountServiceTrait>,
    holdings_service: Arc<dyn HoldingsServiceTrait>,
    alternative_asset_service: Arc<dyn AlternativeAssetServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

impl TargetAllocationService {
    pub fn new(
        repository: Arc<dyn TargetAllocationRepositoryTrait>,
        account_service: Arc<dyn AccountServiceTrait>,
        holdings_service: Arc<dyn HoldingsServiceTrait>,
        alternative_asset_service: Arc<dyn AlternativeAssetServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        Self {
            repository,
            account_service,
            holdings_service,
            alternative_asset_service,
            fx_service,
        }
    }

    async fn build_view(&self, base_currency: &str) -> Result<TargetAllocationView> {
        let plan = self.repository.get_plan_data()?;
        let holdings = self.get_allocation_holdings(base_currency).await?;
        let dashboard = self.calculate_dashboard(base_currency, &plan, holdings.clone())?;

        Ok(TargetAllocationView {
            plan,
            dashboard,
            available_holdings: holdings,
        })
    }

    fn calculate_dashboard(
        &self,
        base_currency: &str,
        plan: &TargetAllocationPlanData,
        holdings: Vec<TargetAllocationHoldingInput>,
    ) -> Result<TargetAllocationDashboard> {
        TargetAllocationCalculator::calculate(TargetAllocationInput {
            currency: base_currency.to_string(),
            nodes: plan.nodes.clone(),
            account_defaults: plan.account_defaults.clone(),
            attributions: plan.attributions.clone(),
            exclusions: plan.exclusions.clone(),
            holdings,
        })
    }

    async fn get_allocation_holdings(
        &self,
        base_currency: &str,
    ) -> Result<Vec<TargetAllocationHoldingInput>> {
        let accounts = self.account_service.get_non_archived_accounts()?;
        let account_names: HashMap<String, String> = accounts
            .iter()
            .map(|account| (account.id.clone(), account.name.clone()))
            .collect();

        let mut holdings = Vec::new();
        for account in accounts {
            let account_holdings = self
                .holdings_service
                .get_holdings(&account.id, base_currency)
                .await?;
            for holding in account_holdings {
                if holding.market_value.base <= Decimal::ZERO {
                    continue;
                }
                if holding.asset_kind.as_ref() == Some(&AssetKind::Liability) {
                    continue;
                }
                if let Some(input) =
                    holding_to_target_input(&holding, account_names.get(&account.id).cloned())
                {
                    holdings.push(input);
                }
            }
        }

        for holding in self.alternative_asset_service.get_alternative_holdings()? {
            if holding.kind == AssetKind::Liability || holding.market_value <= Decimal::ZERO {
                continue;
            }

            let valuation_date = holding.valuation_date.date_naive();
            let value_base = self.fx_service.convert_currency_for_date(
                holding.market_value,
                &holding.currency,
                base_currency,
                valuation_date,
            )?;

            holdings.push(TargetAllocationHoldingInput {
                subject_key: format!("asset:{}", holding.id),
                subject_type: TargetAllocationSubjectType::StandaloneAsset,
                account_id: None,
                account_name: None,
                asset_id: Some(holding.id),
                currency: holding.currency,
                symbol: holding.symbol,
                name: Some(holding.name),
                value_base,
            });
        }

        Ok(holdings)
    }
}

#[async_trait]
impl TargetAllocationServiceTrait for TargetAllocationService {
    async fn get_target_allocation(&self, base_currency: &str) -> Result<TargetAllocationView> {
        self.build_view(base_currency).await
    }

    async fn save_target_allocation(
        &self,
        mut plan: TargetAllocationPlanData,
        base_currency: &str,
    ) -> Result<TargetAllocationView> {
        plan.has_plan = true;
        self.repository.save_plan_data(plan).await?;
        self.build_view(base_currency).await
    }

    async fn set_account_default(
        &self,
        account_id: &str,
        folder_node_id: Option<String>,
        base_currency: &str,
    ) -> Result<TargetAllocationView> {
        self.repository
            .set_account_default(account_id, folder_node_id)
            .await?;
        self.build_view(base_currency).await
    }
}

fn holding_to_target_input(
    holding: &Holding,
    account_name: Option<String>,
) -> Option<TargetAllocationHoldingInput> {
    match holding.holding_type {
        HoldingType::Cash => Some(TargetAllocationHoldingInput {
            subject_key: format!("cash:{}:{}", holding.account_id, holding.local_currency),
            subject_type: TargetAllocationSubjectType::Cash,
            account_id: Some(holding.account_id.clone()),
            account_name,
            asset_id: None,
            currency: holding.local_currency.clone(),
            symbol: holding.local_currency.clone(),
            name: Some(format!("{} Cash", holding.local_currency)),
            value_base: holding.market_value.base,
        }),
        HoldingType::Security | HoldingType::AlternativeAsset => {
            let instrument = holding.instrument.as_ref()?;
            Some(TargetAllocationHoldingInput {
                subject_key: format!("position:{}:{}", holding.account_id, instrument.id),
                subject_type: TargetAllocationSubjectType::Position,
                account_id: Some(holding.account_id.clone()),
                account_name,
                asset_id: Some(instrument.id.clone()),
                currency: holding.local_currency.clone(),
                symbol: instrument.symbol.clone(),
                name: instrument.name.clone(),
                value_base: holding.market_value.base,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use rust_decimal_macros::dec;

    use crate::portfolio::holdings::MonetaryValue;

    use super::*;

    #[test]
    fn cash_holding_without_instrument_is_included() {
        let holding = Holding {
            id: "CASH-account-1-HKD".to_string(),
            account_id: "account-1".to_string(),
            holding_type: HoldingType::Cash,
            instrument: None,
            asset_kind: None,
            quantity: dec!(1000),
            open_date: None,
            lots: None,
            local_currency: "HKD".to_string(),
            base_currency: "HKD".to_string(),
            fx_rate: None,
            market_value: MonetaryValue {
                local: dec!(1000),
                base: dec!(1000),
            },
            cost_basis: None,
            price: Some(dec!(1)),
            purchase_price: None,
            unrealized_gain: None,
            unrealized_gain_pct: None,
            realized_gain: None,
            realized_gain_pct: None,
            total_gain: None,
            total_gain_pct: None,
            day_change: None,
            day_change_pct: None,
            prev_close_value: None,
            weight: Decimal::ZERO,
            as_of_date: NaiveDate::from_ymd_opt(2026, 5, 27).unwrap(),
            metadata: None,
        };

        let input = holding_to_target_input(&holding, Some("Account A".to_string()))
            .expect("cash should be included");

        assert_eq!(input.subject_key, "cash:account-1:HKD");
        assert_eq!(input.subject_type, TargetAllocationSubjectType::Cash);
        assert_eq!(input.symbol, "HKD");
        assert_eq!(input.value_base, dec!(1000));
    }
}
