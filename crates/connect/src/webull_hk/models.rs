//! Webull HK response and request models.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
pub struct CheckTokenRequest {
    pub token: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TokenStatus {
    Pending,
    Normal,
    Invalid,
    Expired,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub token: String,
    pub expires: i64,
    pub status: TokenStatus,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum WebullAccountListResponse {
    Items(Vec<WebullAccountListItem>),
    Envelope(WebullAccountListEnvelope),
}

impl WebullAccountListResponse {
    pub fn into_items(self) -> Vec<WebullAccountListItem> {
        match self {
            Self::Items(items) => items,
            Self::Envelope(envelope) => envelope.accounts,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WebullAccountListEnvelope {
    #[serde(default, alias = "data", alias = "items", alias = "accounts")]
    pub accounts: Vec<WebullAccountListItem>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WebullAccountListItem {
    pub account_id: String,
    pub account_number: Option<String>,
    pub account_type: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WebullAccountBalanceResponse {
    pub account_id: String,
    pub total_asset_currency: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub total_asset: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub total_market_value: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub total_cash_balance: Option<String>,
    #[serde(default)]
    pub margin_utilization_rate: Option<String>,
    #[serde(default)]
    pub account_currency_assets: Vec<WebullAccountCurrencyAsset>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WebullAccountCurrencyAsset {
    pub currency: String,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub net_liquidation_value: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub positions_market_value: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub cash_balance: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub margin_power: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub cash_power: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub pending_incoming: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub cash_frozen: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub available_withdrawal: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub interests_unpaid: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum WebullAccountPositionsResponse {
    Items(Vec<WebullRawPosition>),
    Envelope(WebullPositionsEnvelope),
}

impl WebullAccountPositionsResponse {
    pub fn into_positions(self) -> Vec<WebullRawPosition> {
        match self {
            Self::Items(items) => items,
            Self::Envelope(envelope) => envelope.holdings,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WebullPositionsEnvelope {
    #[serde(default, alias = "data", alias = "items", alias = "positions")]
    pub holdings: Vec<WebullRawPosition>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WebullRawPosition {
    #[serde(default, alias = "id")]
    pub position_id: Option<String>,
    pub instrument_id: Option<String>,
    pub symbol: Option<String>,
    #[serde(default, alias = "category")]
    pub instrument_type: Option<String>,
    #[serde(default, alias = "name")]
    pub short_name: Option<String>,
    pub currency: Option<String>,
    #[serde(
        default,
        alias = "cost_price",
        alias = "average_cost",
        deserialize_with = "deserialize_optional_string"
    )]
    pub unit_cost: Option<String>,
    #[serde(
        default,
        alias = "quantity",
        deserialize_with = "deserialize_optional_string"
    )]
    pub qty: Option<String>,
    #[serde(
        default,
        alias = "cost_basis",
        deserialize_with = "deserialize_optional_string"
    )]
    pub total_cost: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub last_price: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub market_value: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub unrealized_profit_loss: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub unrealized_profit_loss_rate: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    pub holding_proportion: Option<String>,
    #[serde(default)]
    pub account_tax_type: Option<String>,
    #[serde(default)]
    pub items: Vec<WebullRawPosition>,
    #[serde(default)]
    pub positions: Vec<WebullRawPosition>,
}

#[derive(Debug, Clone, Default)]
pub struct WebullStockInstrumentQuery {
    pub symbols: Vec<String>,
    pub category: Option<String>,
    pub status: Option<String>,
    pub last_instrument_id: Option<String>,
    pub page_size: Option<u32>,
}

impl WebullStockInstrumentQuery {
    pub fn to_query_params(&self) -> Vec<(String, String)> {
        let mut params = Vec::new();
        let symbols = self
            .symbols
            .iter()
            .map(|symbol| symbol.trim())
            .filter(|symbol| !symbol.is_empty())
            .collect::<Vec<_>>();
        if !symbols.is_empty() {
            params.push(("symbols".to_string(), symbols.join(",")));
        }
        if let Some(category) = non_empty_value(self.category.as_deref()) {
            params.push(("category".to_string(), category.to_string()));
        }
        if let Some(status) = non_empty_value(self.status.as_deref()) {
            params.push(("status".to_string(), status.to_string()));
        }
        if let Some(last_instrument_id) = non_empty_value(self.last_instrument_id.as_deref()) {
            params.push((
                "last_instrument_id".to_string(),
                last_instrument_id.to_string(),
            ));
        }
        if let Some(page_size) = self.page_size {
            params.push(("page_size".to_string(), page_size.to_string()));
        }
        params
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum WebullStockInstrumentListResponse {
    Items(Vec<WebullStockInstrument>),
    Envelope(WebullStockInstrumentEnvelope),
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WebullStockInstrumentEnvelope {
    #[serde(default, alias = "data", alias = "items", alias = "instruments")]
    pub instruments: Vec<WebullStockInstrument>,
    #[serde(default)]
    pub has_next: Option<bool>,
    #[serde(default)]
    pub last_instrument_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct WebullStockInstrument {
    pub instrument_id: Option<String>,
    pub symbol: Option<String>,
    #[serde(default, alias = "category")]
    pub instrument_type: Option<String>,
    pub name: Option<String>,
    #[serde(default, alias = "short_name")]
    pub short_name: Option<String>,
    pub currency: Option<String>,
    #[serde(default)]
    pub market: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

fn deserialize_optional_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(value.and_then(|value| match value {
        Value::Null => None,
        Value::String(value) => Some(value),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        other => Some(other.to_string()),
    }))
}

fn non_empty_value(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::WebullStockInstrumentQuery;

    #[test]
    fn stock_instrument_query_joins_symbols_for_signed_get_requests() {
        let query = WebullStockInstrumentQuery {
            symbols: vec!["00001".to_string(), "AAPL".to_string()],
            category: Some("HK_STOCK".to_string()),
            status: Some("TRADABLE".to_string()),
            last_instrument_id: Some("913252773".to_string()),
            page_size: Some(100),
        };

        assert_eq!(
            query.to_query_params(),
            vec![
                ("symbols".to_string(), "00001,AAPL".to_string()),
                ("category".to_string(), "HK_STOCK".to_string()),
                ("status".to_string(), "TRADABLE".to_string()),
                ("last_instrument_id".to_string(), "913252773".to_string()),
                ("page_size".to_string(), "100".to_string()),
            ]
        );
    }
}
