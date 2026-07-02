use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde_json::Value;
use std::str::FromStr;

use super::AssetKind;

#[derive(Debug, Clone, PartialEq)]
pub struct TimeDepositValue {
    pub principal: Decimal,
    pub expected_maturity_value: Decimal,
    pub current_value: Decimal,
    pub maturity_date: NaiveDate,
    pub is_closed: bool,
}

pub fn is_time_deposit_metadata(metadata: &Value, kind: &AssetKind) -> bool {
    if *kind == AssetKind::TimeDeposit {
        return true;
    }

    let category = metadata
        .get("panorama_category")
        .and_then(Value::as_str)
        .map(|value| value.eq_ignore_ascii_case("time_deposit"))
        .unwrap_or(false);

    let subtype = metadata
        .get("sub_type")
        .and_then(Value::as_str)
        .map(|value| value.eq_ignore_ascii_case("time_deposit"))
        .unwrap_or(false);

    let has_term_dates = date_from_json_value(metadata.get("start_date")).is_some()
        && date_from_json_value(metadata.get("maturity_date")).is_some();
    let has_principal = decimal_from_json_value(metadata.get("principal")).is_some()
        || decimal_from_json_value(metadata.get("purchase_price")).is_some();
    let has_return_signal = decimal_from_json_value(metadata.get("quoted_annual_rate")).is_some()
        || decimal_from_json_value(metadata.get("guaranteed_maturity_value")).is_some()
        || decimal_from_json_value(metadata.get("current_value_override")).is_some();

    category || subtype || (has_term_dates && has_principal && has_return_signal)
}

pub fn is_closed_time_deposit(metadata: Option<&Value>, kind: &AssetKind) -> bool {
    let Some(metadata) = metadata else {
        return false;
    };

    is_time_deposit_metadata(metadata, kind)
        && metadata
            .get("status")
            .and_then(Value::as_str)
            .map(|status| status.eq_ignore_ascii_case("closed"))
            .unwrap_or(false)
}

pub fn linked_account_id(metadata: Option<&Value>) -> Option<String> {
    metadata
        .and_then(|value| value.get("linked_account_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub fn derive_time_deposit_value(metadata: &Value, as_of: NaiveDate) -> Option<TimeDepositValue> {
    let principal = decimal_from_json_value(metadata.get("principal"))
        .or_else(|| decimal_from_json_value(metadata.get("purchase_price")))?;
    let start_date = date_from_json_value(metadata.get("start_date"))
        .or_else(|| date_from_json_value(metadata.get("purchase_date")))?;
    let maturity_date = date_from_json_value(metadata.get("maturity_date"))?;
    let is_closed = metadata
        .get("status")
        .and_then(Value::as_str)
        .map(|status| status.eq_ignore_ascii_case("closed"))
        .unwrap_or(false);

    let expected_maturity_value =
        if let Some(value) = decimal_from_json_value(metadata.get("guaranteed_maturity_value")) {
            value
        } else {
            let quoted_rate_pct = decimal_from_json_value(metadata.get("quoted_annual_rate"))?;
            let total_days = (maturity_date - start_date).num_days().max(0);
            if total_days == 0 {
                principal
            } else {
                principal
                    * (Decimal::ONE
                        + (quoted_rate_pct / Decimal::new(100, 0))
                            * (Decimal::from(total_days) / Decimal::from(365)))
            }
        };

    let current_value = if metadata
        .get("valuation_mode")
        .and_then(Value::as_str)
        .map(|mode| mode.eq_ignore_ascii_case("manual"))
        .unwrap_or(false)
    {
        decimal_from_json_value(metadata.get("current_value_override"))?
    } else {
        let total_days = (maturity_date - start_date).num_days().max(0);
        if total_days == 0 {
            expected_maturity_value
        } else {
            let elapsed_days = (as_of - start_date).num_days().clamp(0, total_days);
            if elapsed_days >= total_days {
                expected_maturity_value
            } else {
                principal
                    + (expected_maturity_value - principal) * Decimal::from(elapsed_days)
                        / Decimal::from(total_days)
            }
        }
    };

    Some(TimeDepositValue {
        principal,
        expected_maturity_value,
        current_value,
        maturity_date,
        is_closed,
    })
}

fn decimal_from_json_value(value: Option<&Value>) -> Option<Decimal> {
    match value? {
        Value::Number(number) => Decimal::from_str(&number.to_string()).ok(),
        Value::String(text) if !text.trim().is_empty() => Decimal::from_str(text.trim()).ok(),
        _ => None,
    }
}

fn date_from_json_value(value: Option<&Value>) -> Option<NaiveDate> {
    value
        .and_then(Value::as_str)
        .and_then(|text| NaiveDate::parse_from_str(text.trim(), "%Y-%m-%d").ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use serde_json::json;

    fn date(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn detects_time_deposit_metadata_and_linked_account() {
        let metadata = json!({
            "panorama_category": "time_deposit",
            "linked_account_id": "acc-hkd"
        });

        assert!(is_time_deposit_metadata(&metadata, &AssetKind::Other));
        assert_eq!(
            linked_account_id(Some(&metadata)),
            Some("acc-hkd".to_string())
        );
    }

    #[test]
    fn derives_time_deposit_value_from_rate() {
        let metadata = json!({
            "panorama_category": "time_deposit",
            "principal": "100000",
            "start_date": "2026-07-02",
            "maturity_date": "2026-10-02",
            "quoted_annual_rate": "3.2"
        });

        let value = derive_time_deposit_value(&metadata, date("2026-08-02")).unwrap();

        assert_eq!(value.principal, dec!(100000));
        assert!(value.current_value > dec!(100000));
        assert!(value.expected_maturity_value > value.current_value);
        assert_eq!(value.maturity_date, date("2026-10-02"));
        assert!(!value.is_closed);
    }

    #[test]
    fn uses_manual_override_and_detects_closed_status() {
        let metadata = json!({
            "panorama_category": "time_deposit",
            "principal": "100000",
            "start_date": "2026-07-02",
            "maturity_date": "2026-10-02",
            "guaranteed_maturity_value": "100800",
            "valuation_mode": "manual",
            "current_value_override": "100123.45",
            "status": "closed"
        });

        let value = derive_time_deposit_value(&metadata, date("2026-08-02")).unwrap();

        assert_eq!(value.current_value, dec!(100123.45));
        assert_eq!(value.expected_maturity_value, dec!(100800));
        assert!(value.is_closed);
        assert!(is_closed_time_deposit(Some(&metadata), &AssetKind::Other));
    }
}
