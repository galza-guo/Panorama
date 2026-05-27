//! Webull HK account snapshot mapping.

use std::str::FromStr;

use rust_decimal::Decimal;
use wealthfolio_core::assets::{AssetKind, AssetSpec, InstrumentType};
use wealthfolio_core::{Error, Result};

pub use super::models::{
    WebullAccountBalanceResponse, WebullAccountListResponse, WebullAccountPositionsResponse,
};
use super::models::{WebullAccountListItem, WebullRawPosition};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebullHkRemoteAccountSummary {
    pub remote_account_id: String,
    pub account_number_masked: Option<String>,
    pub account_type: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WebullHkCashBalance {
    pub currency: String,
    pub amount: Decimal,
}

#[derive(Debug, Clone)]
pub struct WebullHkSnapshotPosition {
    pub position_id: Option<String>,
    pub instrument_id: Option<String>,
    pub symbol: String,
    pub name: Option<String>,
    pub instrument_type: Option<String>,
    pub currency: String,
    pub quantity: Decimal,
    pub average_cost: Decimal,
    pub total_cost_basis: Decimal,
    pub last_price: Option<Decimal>,
    pub market_value: Option<Decimal>,
    pub asset_spec: AssetSpec,
}

#[derive(Debug, Clone)]
pub struct WebullHkAccountSnapshot {
    pub remote_account_id: String,
    pub account_currency: String,
    pub total_asset: Option<Decimal>,
    pub total_market_value: Option<Decimal>,
    pub total_cash_balance: Option<Decimal>,
    pub cash_balances: Vec<WebullHkCashBalance>,
    pub positions: Vec<WebullHkSnapshotPosition>,
}

pub fn map_account_list(response: WebullAccountListResponse) -> Vec<WebullHkRemoteAccountSummary> {
    response
        .into_items()
        .into_iter()
        .map(map_account_summary)
        .collect()
}

pub fn map_account_snapshot(
    balance: WebullAccountBalanceResponse,
    positions: WebullAccountPositionsResponse,
) -> Result<WebullHkAccountSnapshot> {
    let account_currency = normalize_currency(
        balance
            .total_asset_currency
            .as_deref()
            .filter(|currency| !currency.trim().is_empty())
            .unwrap_or("HKD"),
    );
    let cash_balances = map_cash_balances(&balance, &account_currency)?;
    let positions = map_positions(positions, &account_currency)?;

    Ok(WebullHkAccountSnapshot {
        remote_account_id: balance.account_id,
        account_currency,
        total_asset: parse_optional_decimal(balance.total_asset.as_deref(), "total_asset")?,
        total_market_value: parse_optional_decimal(
            balance.total_market_value.as_deref(),
            "total_market_value",
        )?,
        total_cash_balance: parse_optional_decimal(
            balance.total_cash_balance.as_deref(),
            "total_cash_balance",
        )?,
        cash_balances,
        positions,
    })
}

fn map_account_summary(item: WebullAccountListItem) -> WebullHkRemoteAccountSummary {
    WebullHkRemoteAccountSummary {
        remote_account_id: item.account_id,
        account_number_masked: item.account_number.as_deref().and_then(mask_account_number),
        account_type: item.account_type,
        user_id: item.user_id,
    }
}

fn mask_account_number(account_number: &str) -> Option<String> {
    let trimmed = account_number.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains('*') {
        return Some(trimmed.to_string());
    }
    let suffix = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();
    Some(suffix)
}

fn map_cash_balances(
    balance: &WebullAccountBalanceResponse,
    account_currency: &str,
) -> Result<Vec<WebullHkCashBalance>> {
    let mut cash_balances = Vec::new();

    for currency_asset in &balance.account_currency_assets {
        if currency_asset.currency.trim().is_empty() {
            continue;
        }
        let amount = parse_optional_decimal(
            currency_asset.cash_balance.as_deref(),
            "account_currency_assets.cash_balance",
        )?
        .unwrap_or(Decimal::ZERO);

        if amount.is_zero() {
            continue;
        }

        cash_balances.push(WebullHkCashBalance {
            currency: normalize_currency(&currency_asset.currency),
            amount,
        });
    }

    if cash_balances.is_empty() {
        if let Some(total_cash_balance) =
            parse_optional_decimal(balance.total_cash_balance.as_deref(), "total_cash_balance")?
        {
            if !total_cash_balance.is_zero() {
                cash_balances.push(WebullHkCashBalance {
                    currency: account_currency.to_string(),
                    amount: total_cash_balance,
                });
            }
        }
    }

    cash_balances.sort_by(|lhs, rhs| lhs.currency.cmp(&rhs.currency));
    Ok(cash_balances)
}

fn map_positions(
    response: WebullAccountPositionsResponse,
    account_currency: &str,
) -> Result<Vec<WebullHkSnapshotPosition>> {
    let mut mapped_positions = Vec::new();

    for position in response.into_positions() {
        if position.items.is_empty() && position.positions.is_empty() {
            if let Some(mapped) = map_position(&position, account_currency)? {
                mapped_positions.push(mapped);
            }
            continue;
        }

        for child in position.items.iter().chain(position.positions.iter()) {
            let merged = merge_position_parent(&position, child);
            if let Some(mapped) = map_position(&merged, account_currency)? {
                mapped_positions.push(mapped);
            }
        }
    }

    Ok(mapped_positions)
}

fn merge_position_parent(
    parent: &WebullRawPosition,
    child: &WebullRawPosition,
) -> WebullRawPosition {
    let mut merged = child.clone();
    if merged.position_id.is_none() {
        merged.position_id = parent.position_id.clone();
    }
    if merged.instrument_id.is_none() {
        merged.instrument_id = parent.instrument_id.clone();
    }
    if merged.instrument_type.is_none() {
        merged.instrument_type = parent.instrument_type.clone();
    }
    if merged.short_name.is_none() {
        merged.short_name = parent.short_name.clone();
    }
    if merged.currency.is_none() {
        merged.currency = parent.currency.clone();
    }
    if merged.unit_cost.is_none() {
        merged.unit_cost = parent.unit_cost.clone();
    }
    if merged.total_cost.is_none() {
        merged.total_cost = parent.total_cost.clone();
    }
    merged
}

fn map_position(
    position: &WebullRawPosition,
    account_currency: &str,
) -> Result<Option<WebullHkSnapshotPosition>> {
    let symbol = match position
        .symbol
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(symbol) => normalize_symbol(symbol),
        None => return Ok(None),
    };
    let quantity =
        parse_optional_decimal(position.qty.as_deref(), "positions.qty")?.unwrap_or(Decimal::ZERO);
    if quantity.is_zero() {
        return Ok(None);
    }

    let currency = position
        .currency
        .as_deref()
        .map(normalize_currency)
        .filter(|currency| !currency.is_empty())
        .unwrap_or_else(|| account_currency.to_string());
    let average_cost =
        parse_optional_decimal(position.unit_cost.as_deref(), "positions.unit_cost")?
            .unwrap_or(Decimal::ZERO);
    let total_cost_basis =
        match parse_optional_decimal(position.total_cost.as_deref(), "positions.total_cost")? {
            Some(total_cost) => total_cost,
            None => quantity * average_cost,
        };
    let instrument_type = map_instrument_type(position.instrument_type.as_deref());
    let exchange_mic = infer_exchange_mic(&symbol, &currency, position.instrument_type.as_deref());
    let asset_spec = AssetSpec {
        id: None,
        display_code: Some(symbol.clone()),
        instrument_symbol: Some(symbol.clone()),
        instrument_exchange_mic: exchange_mic,
        instrument_type: Some(instrument_type),
        quote_ccy: currency.clone(),
        quote_ccy_hint: Some(currency.clone()),
        kind: AssetKind::Investment,
        quote_mode: None,
        name: position.short_name.clone(),
    };

    Ok(Some(WebullHkSnapshotPosition {
        position_id: position.position_id.clone(),
        instrument_id: position.instrument_id.clone(),
        symbol,
        name: position.short_name.clone(),
        instrument_type: position.instrument_type.clone(),
        currency,
        quantity,
        average_cost,
        total_cost_basis,
        last_price: parse_optional_decimal(position.last_price.as_deref(), "positions.last_price")?,
        market_value: parse_optional_decimal(
            position.market_value.as_deref(),
            "positions.market_value",
        )?,
        asset_spec,
    }))
}

fn parse_optional_decimal(value: Option<&str>, field: &str) -> Result<Option<Decimal>> {
    let value = match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => value,
        None => return Ok(None),
    };

    Decimal::from_str(value)
        .map(Some)
        .map_err(|e| Error::Unexpected(format!("Invalid Webull HK decimal in {field}: {e}")))
}

fn normalize_symbol(symbol: &str) -> String {
    symbol.trim().to_uppercase()
}

fn normalize_currency(currency: &str) -> String {
    currency.trim().to_uppercase()
}

fn map_instrument_type(instrument_type: Option<&str>) -> InstrumentType {
    let normalized = instrument_type.unwrap_or_default().to_uppercase();
    if normalized.contains("OPTION") {
        InstrumentType::Option
    } else if normalized.contains("CRYPTO") {
        InstrumentType::Crypto
    } else if normalized.contains("FUND") {
        InstrumentType::Fund
    } else if normalized == "FX" || normalized.contains("FOREX") {
        InstrumentType::Fx
    } else {
        InstrumentType::Equity
    }
}

fn infer_exchange_mic(
    symbol: &str,
    currency: &str,
    instrument_type: Option<&str>,
) -> Option<String> {
    let normalized_type = instrument_type.unwrap_or_default().to_uppercase();
    if normalized_type.contains("HK")
        || (currency == "HKD" && symbol.chars().all(|c| c.is_ascii_digit()))
    {
        Some("XHKG".to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;
    use serde_json::json;

    use super::{
        map_account_list, map_account_snapshot, WebullAccountBalanceResponse,
        WebullAccountListResponse, WebullAccountPositionsResponse,
    };

    #[test]
    fn maps_account_list_to_remote_account_summaries() {
        let response: WebullAccountListResponse = serde_json::from_value(json!([
            {
                "account_id": "WEBULL-1",
                "account_number": "12345678",
                "account_type": "CASH",
                "user_id": "USER-1"
            },
            {
                "account_id": "WEBULL-2",
                "account_number": "87654321",
                "account_type": "MARGIN",
                "user_id": "USER-1"
            }
        ]))
        .unwrap();

        let summaries = map_account_list(response);

        assert_eq!(summaries.len(), 2);
        assert_eq!(summaries[0].remote_account_id, "WEBULL-1");
        assert_eq!(summaries[0].account_number_masked, Some("5678".into()));
        assert_eq!(summaries[0].account_type, Some("CASH".into()));
        assert_eq!(summaries[1].remote_account_id, "WEBULL-2");
    }

    #[test]
    fn maps_balance_currencies_to_cash_balances() {
        let balance: WebullAccountBalanceResponse = serde_json::from_value(json!({
            "account_id": "WEBULL-1",
            "total_asset_currency": "HKD",
            "total_asset": "1247724759.5266750000",
            "total_market_value": "89038914.5212380000",
            "total_cash_balance": "1158685845.0054370000",
            "account_currency_assets": [
                {
                    "currency": "HKD",
                    "cash_balance": "305600889.300000",
                    "net_liquidation_value": "458809435.440000",
                    "positions_market_value": "153208546.140000"
                },
                {
                    "currency": "USD",
                    "cash_balance": "7520.25",
                    "net_liquidation_value": "10120.25",
                    "positions_market_value": "2600.00"
                }
            ]
        }))
        .unwrap();
        let positions: WebullAccountPositionsResponse =
            serde_json::from_value(json!({ "holdings": [] })).unwrap();

        let snapshot = map_account_snapshot(balance, positions).unwrap();

        assert_eq!(snapshot.remote_account_id, "WEBULL-1");
        assert_eq!(snapshot.account_currency, "HKD");
        assert_eq!(snapshot.cash_balances.len(), 2);
        assert_eq!(snapshot.cash_balances[0].currency, "HKD");
        assert_eq!(
            snapshot.cash_balances[0].amount,
            "305600889.300000".parse::<Decimal>().unwrap()
        );
        assert_eq!(snapshot.cash_balances[1].currency, "USD");
    }

    #[test]
    fn maps_positions_to_holdings_positions() {
        let balance: WebullAccountBalanceResponse = serde_json::from_value(json!({
            "account_id": "WEBULL-1",
            "total_asset_currency": "HKD",
            "total_cash_balance": "0",
            "account_currency_assets": []
        }))
        .unwrap();
        let positions: WebullAccountPositionsResponse = serde_json::from_value(json!({
            "holdings": [
                {
                    "instrument_id": "913252773",
                    "symbol": "00001",
                    "instrument_type": "STOCK",
                    "short_name": "CKH HOLDINGS",
                    "currency": "HKD",
                    "unit_cost": "9.5460000000",
                    "qty": "11000.0",
                    "total_cost": "105006.00000000000000000000",
                    "last_price": "52.250",
                    "market_value": "574750.0000000000000"
                }
            ]
        }))
        .unwrap();

        let snapshot = map_account_snapshot(balance, positions).unwrap();

        assert_eq!(snapshot.positions.len(), 1);
        let position = &snapshot.positions[0];
        assert_eq!(position.instrument_id.as_deref(), Some("913252773"));
        assert_eq!(position.symbol, "00001");
        assert_eq!(position.name.as_deref(), Some("CKH HOLDINGS"));
        assert_eq!(position.currency, "HKD");
        assert_eq!(position.quantity, "11000.0".parse::<Decimal>().unwrap());
        assert_eq!(
            position.average_cost,
            "9.5460000000".parse::<Decimal>().unwrap()
        );
        assert_eq!(
            position.total_cost_basis,
            "105006.00000000000000000000".parse::<Decimal>().unwrap()
        );
        assert_eq!(
            position.asset_spec.instrument_exchange_mic.as_deref(),
            Some("XHKG")
        );
    }

    #[test]
    fn numeric_strings_parse_without_float_rounding() {
        let balance: WebullAccountBalanceResponse = serde_json::from_value(json!({
            "account_id": "WEBULL-1",
            "total_asset_currency": "HKD",
            "total_asset": "0.123456789012345678",
            "total_market_value": "0",
            "total_cash_balance": "0",
            "account_currency_assets": [
                {
                    "currency": "HKD",
                    "cash_balance": "0.123456789012345678"
                }
            ]
        }))
        .unwrap();
        let positions: WebullAccountPositionsResponse =
            serde_json::from_value(json!({ "holdings": [] })).unwrap();

        let snapshot = map_account_snapshot(balance, positions).unwrap();

        assert_eq!(
            snapshot.total_asset.unwrap().to_string(),
            "0.123456789012345678"
        );
        assert_eq!(
            snapshot.cash_balances[0].amount.to_string(),
            "0.123456789012345678"
        );
    }
}
