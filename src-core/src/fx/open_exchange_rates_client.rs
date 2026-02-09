use std::collections::HashMap;

use reqwest::StatusCode;
use rust_decimal::Decimal;
use serde::Deserialize;

use crate::errors::{Error, Result, ValidationError};
use crate::fx::currency::normalize_currency_code;
use crate::market_data::MarketDataError;

const OXR_LATEST_URL: &str = "https://openexchangerates.org/api/latest.json";

#[derive(Debug, Deserialize)]
struct OpenExchangeRatesLatestResponse {
    base: String,
    rates: HashMap<String, f64>,
}

#[derive(Debug, Deserialize)]
struct OpenExchangeRatesErrorResponse {
    description: Option<String>,
    message: Option<String>,
}

pub async fn validate_api_key(api_key: &str) -> Result<()> {
    fetch_latest_rates(api_key).await.map(|_| ())
}

pub async fn fetch_latest_rates(api_key: &str) -> Result<HashMap<String, Decimal>> {
    let trimmed_key = api_key.trim();
    if trimmed_key.is_empty() {
        return Err(Error::Validation(ValidationError::InvalidInput(
            "Open Exchange Rates API key is required".to_string(),
        )));
    }

    let response = reqwest::Client::new()
        .get(OXR_LATEST_URL)
        .query(&[("app_id", trimmed_key)])
        .send()
        .await
        .map_err(MarketDataError::NetworkError)?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(MarketDataError::NetworkError)?;

    if !status.is_success() {
        let parsed_error = serde_json::from_str::<OpenExchangeRatesErrorResponse>(&body).ok();
        let message = parsed_error
            .and_then(|err| err.description.or(err.message))
            .filter(|msg| !msg.trim().is_empty())
            .unwrap_or_else(|| {
                format!("Open Exchange Rates request failed with status {}", status)
            });

        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(Error::MarketData(MarketDataError::Unauthorized(message)));
        }

        return Err(Error::MarketData(MarketDataError::ProviderError(message)));
    }

    let payload = serde_json::from_str::<OpenExchangeRatesLatestResponse>(&body)
        .map_err(|err| MarketDataError::ParsingError(err.to_string()))?;

    let mut normalized_rates = HashMap::new();
    for (currency, rate) in payload.rates {
        let decimal_rate = Decimal::from_f64_retain(rate).ok_or_else(|| {
            Error::MarketData(MarketDataError::InvalidData(format!(
                "Invalid exchange rate for {}",
                currency
            )))
        })?;
        normalized_rates.insert(currency.to_uppercase(), decimal_rate);
    }

    normalized_rates.insert(payload.base.trim().to_uppercase(), Decimal::ONE);

    Ok(normalized_rates)
}

pub fn compute_cross_rate(
    rates: &HashMap<String, Decimal>,
    from_currency: &str,
    to_currency: &str,
) -> Result<Decimal> {
    let from = normalize_currency_code(from_currency).to_uppercase();
    let to = normalize_currency_code(to_currency).to_uppercase();

    if from == to {
        return Ok(Decimal::ONE);
    }

    let from_rate = rates.get(&from).ok_or_else(|| {
        Error::Validation(ValidationError::InvalidInput(format!(
            "Open Exchange Rates is missing rate for currency {}",
            from
        )))
    })?;

    if from_rate.is_zero() {
        return Err(Error::Validation(ValidationError::InvalidInput(format!(
            "Open Exchange Rates returned zero rate for currency {}",
            from
        ))));
    }

    let to_rate = rates.get(&to).ok_or_else(|| {
        Error::Validation(ValidationError::InvalidInput(format!(
            "Open Exchange Rates is missing rate for currency {}",
            to
        )))
    })?;

    Ok((*to_rate / *from_rate).round_dp(12))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use rust_decimal_macros::dec;

    use super::compute_cross_rate;

    #[test]
    fn computes_cross_rate_from_base_relative_quotes() {
        let mut rates = HashMap::new();
        rates.insert("USD".to_string(), dec!(1.0));
        rates.insert("HKD".to_string(), dec!(7.8));
        rates.insert("CNY".to_string(), dec!(7.2));

        let hkd_to_cny = compute_cross_rate(&rates, "HKD", "CNY").unwrap();
        assert_eq!(hkd_to_cny.round_dp(6), dec!(0.923077));
    }

    #[test]
    fn returns_one_for_same_currency() {
        let rates = HashMap::new();
        let usd_to_usd = compute_cross_rate(&rates, "USD", "USD").unwrap();
        assert_eq!(usd_to_usd, dec!(1.0));
    }
}
