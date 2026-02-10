use std::collections::{HashMap, HashSet};

use log::warn;
use rust_decimal::Decimal;

use crate::errors::Result;
use crate::fx::currency::normalize_currency_code;
use crate::fx::fx_model::NewExchangeRate;
use crate::fx::fx_traits::FxServiceTrait;
use crate::fx::open_exchange_rates_client::compute_cross_rate;
use crate::market_data::market_data_model::DataSource;

fn normalize_currency(value: &str) -> Option<String> {
    let normalized = normalize_currency_code(value.trim()).to_uppercase();
    let is_iso_currency =
        normalized.len() == 3 && normalized.chars().all(|ch| ch.is_ascii_alphabetic());
    if is_iso_currency {
        Some(normalized)
    } else {
        None
    }
}

pub fn build_managed_currency_set<I, J>(
    base_currency: &str,
    account_currencies: I,
    asset_currencies: J,
) -> HashSet<String>
where
    I: IntoIterator<Item = String>,
    J: IntoIterator<Item = String>,
{
    let mut currencies = HashSet::new();
    let Some(normalized_base) = normalize_currency(base_currency) else {
        return currencies;
    };

    for currency in account_currencies.into_iter().chain(asset_currencies) {
        if let Some(normalized) = normalize_currency(&currency) {
            if normalized != normalized_base {
                currencies.insert(normalized);
            }
        }
    }

    currencies
}

pub async fn ensure_registered_pairs(
    fx_service: &dyn FxServiceTrait,
    base_currency: &str,
    managed_currencies: &HashSet<String>,
) -> Result<()> {
    for currency in managed_currencies {
        if let Err(err) = fx_service
            .register_currency_pair(currency, base_currency)
            .await
        {
            warn!(
                "Failed to auto-register exchange pair {}/{}: {}",
                currency, base_currency, err
            );
        }
    }

    Ok(())
}

pub async fn upsert_open_exchange_rates(
    fx_service: &dyn FxServiceTrait,
    base_currency: &str,
    managed_currencies: &HashSet<String>,
    latest_rates: &HashMap<String, Decimal>,
) -> usize {
    let mut updated_count = 0usize;

    for currency in managed_currencies {
        let rate = match compute_cross_rate(latest_rates, currency, base_currency) {
            Ok(value) => value,
            Err(err) => {
                warn!(
                    "Skipping Open Exchange Rates update for {}/{}: {}",
                    currency, base_currency, err
                );
                continue;
            }
        };

        let new_rate = NewExchangeRate {
            from_currency: currency.clone(),
            to_currency: base_currency.to_string(),
            rate,
            source: DataSource::OpenExchangeRates,
        };

        match fx_service.add_exchange_rate(new_rate).await {
            Ok(_) => {
                updated_count += 1;
            }
            Err(err) => {
                warn!(
                    "Failed to persist Open Exchange Rates quote for {}/{}: {}",
                    currency, base_currency, err
                );
            }
        }
    }

    updated_count
}
