//! Alternative Assets service implementation.
//!
//! This service manages the lifecycle of alternative assets including
//! properties, vehicles, collectibles, precious metals, and liabilities.
//!
//! Alternative assets use a simplified model:
//! - No dedicated accounts (avoids account clutter)
//! - No activities (avoids activity clutter)
//! - Just asset record + valuation quotes

use std::{collections::HashMap, io::Cursor, str::FromStr, sync::Arc};

use async_trait::async_trait;
use calamine::{open_workbook_auto_from_rs, Data, Reader};
use chrono::{NaiveDate, TimeZone, Utc};
use log::{debug, warn};
use regex::Regex;
use rust_decimal::{prelude::ToPrimitive, Decimal};
use serde_json::{json, Value};
use uuid::Uuid;

use super::alternative_assets_model::{
    AlternativeHolding, CreateAlternativeAssetRequest, CreateAlternativeAssetResponse,
    LinkLiabilityRequest, LinkLiabilityResponse, UpdateAssetDetailsRequest,
    UpdateAssetDetailsResponse, UpdateValuationRequest, UpdateValuationResponse,
};
use super::alternative_assets_traits::{
    AlternativeAssetRepositoryTrait, AlternativeAssetServiceTrait,
};
use super::{Asset, AssetKind, AssetRepositoryTrait, NewAsset, QuoteMode};
use crate::errors::{Error, Result, ValidationError};
use crate::events::{DomainEvent, DomainEventSink, NoOpDomainEventSink};
use crate::quotes::{DataSource, Quote, QuoteServiceTrait};
use crate::utils::time_utils::valuation_date_today;

const MPFA_MONTHLY_UNIT_PRICE_PAGE_URL: &str =
    "https://www.mpfa.org.hk/en/info-centre/fund-information/monthly-fund-price/monthly-unit-prices-of-mpf-constituent-funds";
const MPFA_BASE_URL: &str = "https://www.mpfa.org.hk";
const MPFA_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Panorama/1.0 MPF Sync";

#[derive(Debug, Default, Clone)]
struct MpfUnitPriceSnapshot {
    valuation_date: Option<NaiveDate>,
    unit_prices_by_normalized_name: HashMap<String, Decimal>,
}

#[derive(Debug, Clone)]
struct PanoramaMpfSyncUpdate {
    metadata: Value,
    market_value: Option<Decimal>,
    valuation_date: NaiveDate,
}

/// Service for managing alternative assets.
///
/// This service coordinates between the asset repository and quote service
/// to manage the lifecycle of alternative assets.
///
/// NOTE: Alternative assets don't create accounts or activities - just asset + quotes.
pub struct AlternativeAssetService {
    alternative_asset_repository: Arc<dyn AlternativeAssetRepositoryTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
    quote_service: Arc<dyn QuoteServiceTrait>,
    event_sink: Arc<dyn DomainEventSink>,
}

impl AlternativeAssetService {
    /// Creates a new AlternativeAssetService instance.
    pub fn new(
        alternative_asset_repository: Arc<dyn AlternativeAssetRepositoryTrait>,
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
    ) -> Self {
        Self {
            alternative_asset_repository,
            asset_repository,
            quote_service,
            event_sink: Arc::new(NoOpDomainEventSink),
        }
    }

    /// Sets the domain event sink for this service.
    pub fn with_event_sink(mut self, event_sink: Arc<dyn DomainEventSink>) -> Self {
        self.event_sink = event_sink;
        self
    }

    /// Validates that the request is for an alternative asset kind.
    fn validate_alternative_asset_kind(kind: &AssetKind) -> Result<()> {
        match kind {
            AssetKind::Property
            | AssetKind::Vehicle
            | AssetKind::Collectible
            | AssetKind::PreciousMetal
            | AssetKind::Mpf
            | AssetKind::PrivateEquity
            | AssetKind::Liability
            | AssetKind::Other => Ok(()),
            _ => Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Asset kind {:?} is not an alternative asset type",
                kind
            )))),
        }
    }

    /// Builds the asset metadata JSON, including purchase info and kind-specific metadata.
    fn build_asset_metadata(request: &CreateAlternativeAssetRequest) -> Option<Value> {
        let mut metadata = request.metadata.clone().unwrap_or_else(|| json!({}));

        // Add purchase info if provided
        if let Some(purchase_price) = &request.purchase_price {
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert(
                    "purchase_price".to_string(),
                    json!(purchase_price.to_string()),
                );
            }
        }
        if let Some(purchase_date) = &request.purchase_date {
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert(
                    "purchase_date".to_string(),
                    json!(purchase_date.to_string()),
                );
            }
        }

        // For liabilities, add linked_asset_id if provided
        if request.kind == AssetKind::Liability {
            if let Some(linked_id) = &request.linked_asset_id {
                if let Some(obj) = metadata.as_object_mut() {
                    obj.insert("linked_asset_id".to_string(), json!(linked_id));
                }
            }
        }

        // Return None if metadata is empty, Some otherwise
        if metadata.as_object().is_some_and(|o| o.is_empty()) {
            None
        } else {
            Some(metadata)
        }
    }

    /// Extracts linked_asset_id from liability metadata.
    #[cfg(test)]
    fn get_linked_asset_id(metadata: &Option<Value>) -> Option<String> {
        metadata
            .as_ref()
            .and_then(|m| m.get("linked_asset_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }

    /// Adds or updates linked_asset_id in metadata.
    fn set_linked_asset_id(metadata: Option<Value>, linked_asset_id: &str) -> Value {
        let mut meta = metadata.unwrap_or_else(|| json!({}));
        if let Some(obj) = meta.as_object_mut() {
            obj.insert("linked_asset_id".to_string(), json!(linked_asset_id));
        }
        meta
    }

    /// Removes linked_asset_id from metadata.
    #[cfg(test)]
    fn remove_linked_asset_id(metadata: Option<Value>) -> Option<Value> {
        let mut meta = metadata?;
        if let Some(obj) = meta.as_object_mut() {
            obj.remove("linked_asset_id");
            if obj.is_empty() {
                return None;
            }
        }
        Some(meta)
    }

    /// Merges a metadata patch into an existing metadata object.
    ///
    /// Top-level `null` values delete keys. All other JSON values are preserved
    /// as-is so Panorama metadata can store structured arrays and objects.
    fn merge_asset_metadata(
        existing: Option<&Value>,
        updates: Option<&std::collections::HashMap<String, Value>>,
    ) -> Option<Value> {
        let mut metadata_obj = existing
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default();

        if let Some(new_metadata) = updates {
            for (key, value) in new_metadata {
                if value.is_null() {
                    metadata_obj.remove(key);
                } else {
                    metadata_obj.insert(key.clone(), value.clone());
                }
            }
        }

        if metadata_obj.is_empty() {
            None
        } else {
            Some(Value::Object(metadata_obj))
        }
    }

    /// Derives the display code for an alternative asset from its metadata.
    ///
    /// Uses the unified `sub_type` field (e.g., "gold" → "Gold", "mortgage" → "Mortgage").
    /// Falls back to the kind's display name if sub_type is not set.
    pub fn derive_display_code(kind: &AssetKind, metadata: &Option<Value>) -> String {
        metadata
            .as_ref()
            .and_then(|m| m.get("sub_type"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(Self::format_subtype)
            .unwrap_or_else(|| kind.display_name().to_string())
    }

    /// Formats a snake_case subtype to Title Case (e.g., "auto_loan" → "Auto Loan").
    fn format_subtype(subtype: &str) -> String {
        subtype
            .split('_')
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().chain(chars).collect(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn is_panorama_mpf_asset(asset: &Asset) -> bool {
        if asset.kind == AssetKind::Mpf {
            return true;
        }

        let Some(metadata) = asset.metadata.as_ref() else {
            return false;
        };

        metadata
            .get("panorama_category")
            .and_then(Value::as_str)
            .map(|value| value.eq_ignore_ascii_case("mpf"))
            .unwrap_or(false)
            || metadata
                .get("sub_type")
                .and_then(Value::as_str)
                .map(|value| value.eq_ignore_ascii_case("mpf"))
                .unwrap_or(false)
            || metadata
                .get("mpf_subfunds")
                .and_then(Value::as_array)
                .map(|subfunds| !subfunds.is_empty())
                .unwrap_or(false)
    }

    fn is_panorama_time_deposit_asset(asset: &Asset) -> bool {
        let Some(metadata) = asset.metadata.as_ref() else {
            return false;
        };

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

        let has_term_dates = metadata
            .get("start_date")
            .and_then(Value::as_str)
            .is_some()
            && metadata
                .get("maturity_date")
                .and_then(Value::as_str)
                .is_some();

        let has_principal = Self::decimal_from_json_value(metadata.get("principal")).is_some();
        let has_return_signal =
            Self::decimal_from_json_value(metadata.get("quoted_annual_rate")).is_some()
                || Self::decimal_from_json_value(metadata.get("guaranteed_maturity_value"))
                    .is_some()
                || Self::decimal_from_json_value(metadata.get("current_value_override")).is_some();

        category || subtype || (has_term_dates && has_principal && has_return_signal)
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

    fn derive_time_deposit_market_value(asset: &Asset) -> Option<(Decimal, chrono::DateTime<Utc>)> {
        let metadata = asset.metadata.as_ref()?;
        if !Self::is_panorama_time_deposit_asset(asset) {
            return None;
        }

        let principal = Self::decimal_from_json_value(metadata.get("principal"))
            .or_else(|| Self::decimal_from_json_value(metadata.get("purchase_price")))?;
        let start_date = Self::date_from_json_value(metadata.get("start_date"))
            .or_else(|| Self::date_from_json_value(metadata.get("purchase_date")))?;
        let maturity_date = Self::date_from_json_value(metadata.get("maturity_date"))?;
        let valuation_mode = metadata
            .get("valuation_mode")
            .and_then(Value::as_str)
            .unwrap_or("derived");

        if valuation_mode.eq_ignore_ascii_case("manual") {
            let override_value = Self::decimal_from_json_value(metadata.get("current_value_override"))?;
            let valuation_date =
                Self::date_from_json_value(metadata.get("valuation_date")).unwrap_or_else(valuation_date_today);
            let timestamp = Utc.from_utc_datetime(&valuation_date.and_hms_opt(12, 0, 0).unwrap());
            return Some((override_value, timestamp));
        }

        let expected_maturity_value =
            if let Some(maturity_value) = Self::decimal_from_json_value(metadata.get("guaranteed_maturity_value")) {
                maturity_value
            } else {
                let quoted_rate_pct =
                    Self::decimal_from_json_value(metadata.get("quoted_annual_rate"))?;
                let total_days = (maturity_date - start_date).num_days().max(0);
                if total_days == 0 {
                    principal
                } else {
                    let total_days_decimal = Decimal::from(total_days);
                    principal
                        * (Decimal::ONE
                            + (quoted_rate_pct / Decimal::new(100, 0))
                                * (total_days_decimal / Decimal::from(365)))
                }
            };

        let total_days = (maturity_date - start_date).num_days().max(0);
        let as_of_date = valuation_date_today();
        let market_value = if total_days == 0 {
            expected_maturity_value
        } else {
            let elapsed_days = (as_of_date - start_date).num_days().clamp(0, total_days);
            if elapsed_days >= total_days {
                expected_maturity_value
            } else {
                principal
                    + (expected_maturity_value - principal)
                        * Decimal::from(elapsed_days)
                        / Decimal::from(total_days)
            }
        };

        let timestamp = Utc.from_utc_datetime(&as_of_date.and_hms_opt(12, 0, 0).unwrap());
        Some((market_value, timestamp))
    }

    fn apply_mpf_unit_prices_to_metadata(
        metadata: &Option<Value>,
        snapshot: &MpfUnitPriceSnapshot,
    ) -> Option<PanoramaMpfSyncUpdate> {
        let mut metadata_value = metadata
            .clone()
            .unwrap_or_else(|| Value::Object(Default::default()));

        let metadata_object = metadata_value.as_object_mut()?;
        let subfunds = metadata_object.get_mut("mpf_subfunds")?.as_array_mut()?;

        let mut matched_any_subfund = false;
        let mut total_market_value = Decimal::ZERO;
        let mut has_market_value = false;

        for subfund in subfunds.iter_mut() {
            let subfund_object = match subfund.as_object_mut() {
                Some(value) => value,
                None => continue,
            };

            let Some(subfund_name) = subfund_object
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };

            let normalized_name = Self::normalize_mpf_fund_name(subfund_name);
            let Some(nav) = snapshot
                .unit_prices_by_normalized_name
                .get(&normalized_name)
                .copied()
            else {
                continue;
            };

            matched_any_subfund = true;
            if let Some(nav_json) = Self::decimal_to_json_value(nav.round_dp(6)) {
                subfund_object.insert("nav".to_string(), nav_json);
            }

            let units = subfund_object.get("units").and_then(Self::json_to_decimal);
            if let Some(units_value) = units {
                if units_value >= Decimal::ZERO {
                    let market_value = (units_value * nav).round_dp(4);
                    if let Some(market_value_json) = Self::decimal_to_json_value(market_value) {
                        subfund_object.insert("market_value".to_string(), market_value_json);
                    }
                    total_market_value += market_value;
                    has_market_value = true;
                }
            }
        }

        if !matched_any_subfund {
            return None;
        }

        let valuation_date = snapshot.valuation_date.unwrap_or_else(valuation_date_today);
        metadata_object.insert(
            "valuation_date".to_string(),
            Value::String(valuation_date.format("%Y-%m-%d").to_string()),
        );

        if has_market_value {
            if let Some(total_market_value_json) =
                Self::decimal_to_json_value(total_market_value.round_dp(2))
            {
                metadata_object.insert("market_value".to_string(), total_market_value_json);
            }
        }

        Some(PanoramaMpfSyncUpdate {
            metadata: metadata_value,
            market_value: has_market_value.then_some(total_market_value.round_dp(2)),
            valuation_date,
        })
    }

    fn json_to_decimal(value: &Value) -> Option<Decimal> {
        match value {
            Value::Number(number) => Decimal::from_str(&number.to_string()).ok(),
            Value::String(raw) => Self::parse_decimal_from_text(raw),
            _ => None,
        }
    }

    fn decimal_to_json_value(value: Decimal) -> Option<Value> {
        value.to_f64().map(|float_value| json!(float_value))
    }

    fn normalize_mpf_fund_name(name: &str) -> String {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return String::new();
        }

        let mut normalized = String::with_capacity(trimmed.len());
        let mut previous_was_space = false;

        for character in trimmed.chars() {
            let mapped = if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else if character.is_alphanumeric() || Self::is_cjk_char(character) {
                character
            } else {
                ' '
            };

            if mapped.is_whitespace() {
                if !previous_was_space {
                    normalized.push(' ');
                }
                previous_was_space = true;
            } else {
                normalized.push(mapped);
                previous_was_space = false;
            }
        }

        normalized.trim().to_string()
    }

    fn is_cjk_char(character: char) -> bool {
        matches!(
            character as u32,
            0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF
        )
    }

    async fn fetch_latest_mpf_unit_price_snapshot(&self) -> Result<MpfUnitPriceSnapshot> {
        let client = reqwest::Client::new();
        let listing_response = client
            .get(MPFA_MONTHLY_UNIT_PRICE_PAGE_URL)
            .header("User-Agent", MPFA_USER_AGENT)
            .send()
            .await
            .map_err(|err| Error::MarketData(err.into()))?;

        if !listing_response.status().is_success() {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "MPFA monthly unit-price page returned HTTP {}",
                listing_response.status()
            ))));
        }

        let page_html = listing_response
            .text()
            .await
            .map_err(|err| Error::MarketData(err.into()))?;
        let xls_url = Self::extract_mpf_unit_price_xls_url(&page_html).ok_or_else(|| {
            Error::Validation(ValidationError::InvalidInput(
                "Unable to locate MPFA monthly unit-price XLS link".to_string(),
            ))
        })?;

        let xls_response = client
            .get(&xls_url)
            .header("User-Agent", MPFA_USER_AGENT)
            .send()
            .await
            .map_err(|err| Error::MarketData(err.into()))?;

        if !xls_response.status().is_success() {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "MPFA unit-price file returned HTTP {}",
                xls_response.status()
            ))));
        }

        let xls_bytes = xls_response
            .bytes()
            .await
            .map_err(|err| Error::MarketData(err.into()))?;

        Self::parse_mpf_unit_price_snapshot(&xls_bytes)
    }

    fn extract_mpf_unit_price_xls_url(page_html: &str) -> Option<String> {
        let regex = Regex::new(r#"href="(?P<path>[^"]*consolidated[^"]*\.(?:xls|xlsx))""#).ok()?;
        let captures = regex.captures(page_html)?;
        let path = captures.name("path")?.as_str().trim();
        if path.starts_with("http://") || path.starts_with("https://") {
            return Some(path.to_string());
        }

        Some(format!("{MPFA_BASE_URL}{path}"))
    }

    fn parse_mpf_unit_price_snapshot(xls_bytes: &[u8]) -> Result<MpfUnitPriceSnapshot> {
        let mut workbook =
            open_workbook_auto_from_rs(Cursor::new(xls_bytes.to_vec())).map_err(|err| {
                Error::Validation(ValidationError::InvalidInput(format!(
                    "Failed to parse MPFA XLS workbook: {}",
                    err
                )))
            })?;

        let first_sheet = workbook.sheet_names().first().cloned().ok_or_else(|| {
            Error::Validation(ValidationError::InvalidInput(
                "MPFA XLS workbook has no worksheets".to_string(),
            ))
        })?;

        let range = workbook.worksheet_range(&first_sheet).map_err(|err| {
            Error::Validation(ValidationError::InvalidInput(format!(
                "Failed to read MPFA worksheet '{first_sheet}': {}",
                err
            )))
        })?;

        let mut snapshot = MpfUnitPriceSnapshot::default();

        for row in range.rows().take(24) {
            for column in 0..5 {
                let cell_text = Self::cell_to_text(row.get(column));
                if cell_text.is_empty() {
                    continue;
                }
                if let Some(date) = Self::extract_valuation_date_from_text(&cell_text) {
                    snapshot.valuation_date = Some(date);
                    break;
                }
            }

            if snapshot.valuation_date.is_some() {
                break;
            }
        }

        for row in range.rows() {
            let fund_name = Self::cell_to_text(row.get(2));
            if fund_name.is_empty()
                || fund_name.eq_ignore_ascii_case("fund name")
                || fund_name.contains("成分基金名稱")
            {
                continue;
            }

            let Some(unit_price) = Self::parse_decimal_from_cell(row.get(3)) else {
                continue;
            };

            if unit_price <= Decimal::ZERO {
                continue;
            }

            let normalized_name = Self::normalize_mpf_fund_name(&fund_name);
            if normalized_name.is_empty() {
                continue;
            }

            snapshot
                .unit_prices_by_normalized_name
                .entry(normalized_name)
                .or_insert(unit_price);
        }

        if snapshot.unit_prices_by_normalized_name.is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "MPFA XLS workbook did not contain any parseable unit prices".to_string(),
            )));
        }

        Ok(snapshot)
    }

    fn cell_to_text(cell: Option<&Data>) -> String {
        match cell {
            Some(Data::String(value)) => value.trim().to_string(),
            Some(Data::Float(value)) => value.to_string(),
            Some(Data::Int(value)) => value.to_string(),
            Some(Data::Bool(value)) => value.to_string(),
            Some(Data::DateTime(value)) => value.to_string(),
            Some(Data::DateTimeIso(value)) => value.clone(),
            Some(Data::DurationIso(value)) => value.clone(),
            Some(Data::Error(_)) | Some(Data::Empty) | None => String::new(),
        }
    }

    fn parse_decimal_from_cell(cell: Option<&Data>) -> Option<Decimal> {
        match cell {
            Some(Data::Float(value)) => Decimal::from_str(&value.to_string()).ok(),
            Some(Data::Int(value)) => Some(Decimal::from(*value)),
            Some(Data::String(value)) => Self::parse_decimal_from_text(value),
            Some(Data::DateTime(_))
            | Some(Data::DateTimeIso(_))
            | Some(Data::DurationIso(_))
            | Some(Data::Bool(_))
            | Some(Data::Error(_))
            | Some(Data::Empty)
            | None => None,
        }
    }

    fn parse_decimal_from_text(raw_value: &str) -> Option<Decimal> {
        let normalized = raw_value.trim().replace(',', "");
        if normalized.is_empty() || normalized == "--" {
            return None;
        }

        Decimal::from_str(&normalized).ok()
    }

    fn extract_valuation_date_from_text(raw_text: &str) -> Option<NaiveDate> {
        let text = raw_text.trim();
        if text.is_empty() {
            return None;
        }

        let dmy_regex = Regex::new(r"(\d{1,2})/(\d{1,2})/(\d{4})").ok()?;
        if let Some(captures) = dmy_regex.captures(text) {
            let day = captures.get(1)?.as_str().parse::<u32>().ok()?;
            let month = captures.get(2)?.as_str().parse::<u32>().ok()?;
            let year = captures.get(3)?.as_str().parse::<i32>().ok()?;
            return NaiveDate::from_ymd_opt(year, month, day);
        }

        let zh_regex = Regex::new(r"(\d{4})年(\d{1,2})月(\d{1,2})日").ok()?;
        if let Some(captures) = zh_regex.captures(text) {
            let year = captures.get(1)?.as_str().parse::<i32>().ok()?;
            let month = captures.get(2)?.as_str().parse::<u32>().ok()?;
            let day = captures.get(3)?.as_str().parse::<u32>().ok()?;
            return NaiveDate::from_ymd_opt(year, month, day);
        }

        None
    }

    async fn apply_mpf_unit_prices_to_asset(
        &self,
        asset: &Asset,
        snapshot: &MpfUnitPriceSnapshot,
    ) -> Result<bool> {
        let Some(update) = Self::apply_mpf_unit_prices_to_metadata(&asset.metadata, snapshot)
        else {
            return Ok(false);
        };

        let existing_quote = self.quote_service.get_latest_quote(&asset.id).ok();
        let metadata_unchanged = asset.metadata.as_ref() == Some(&update.metadata);
        let quote_unchanged = match (existing_quote.as_ref(), update.market_value) {
            (Some(quote), Some(market_value)) => {
                quote.timestamp.date_naive() == update.valuation_date && quote.close == market_value
            }
            (_, None) => true,
            (None, Some(_)) => false,
        };

        if metadata_unchanged && quote_unchanged {
            return Ok(false);
        }

        self.alternative_asset_repository
            .update_asset_metadata(&asset.id, Some(update.metadata))
            .await?;

        if let Some(market_value) = update.market_value {
            let quote = Quote {
                id: Uuid::new_v4().to_string(),
                asset_id: asset.id.clone(),
                timestamp: Utc
                    .from_utc_datetime(&update.valuation_date.and_hms_opt(12, 0, 0).unwrap()),
                open: market_value,
                high: market_value,
                low: market_value,
                close: market_value,
                adjclose: market_value,
                volume: Decimal::ZERO,
                currency: asset.quote_ccy.clone(),
                data_source: DataSource::Manual,
                created_at: Utc::now(),
                notes: Some("Panorama MPF unit-price sync".to_string()),
            };
            self.quote_service.add_quote(&quote).await?;
        }
        Ok(true)
    }
}

#[async_trait]
impl AlternativeAssetServiceTrait for AlternativeAssetService {
    async fn create_alternative_asset(
        &self,
        request: CreateAlternativeAssetRequest,
    ) -> Result<CreateAlternativeAssetResponse> {
        // Validate the asset kind is an alternative asset
        Self::validate_alternative_asset_kind(&request.kind)?;

        // Validate required fields
        if request.name.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Asset name cannot be empty".to_string(),
            )));
        }
        if request.currency.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Currency cannot be empty".to_string(),
            )));
        }

        // Validate purchase date is before value date when both are provided
        if let (Some(purchase_date), value_date) = (request.purchase_date, request.value_date) {
            if purchase_date >= value_date {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Purchase/origination date must be before current value date".to_string(),
                )));
            }
        }

        debug!(
            "Creating alternative asset: {} ({:?})",
            request.name, request.kind
        );

        // 1. Build asset metadata
        let metadata = Self::build_asset_metadata(&request);

        // 2. Determine display_code from metadata
        let display_code = Self::derive_display_code(&request.kind, &metadata);

        // 3. Create the asset record (DB generates UUID)
        let new_asset = NewAsset {
            id: None, // DB generates UUID
            name: Some(request.name.clone()),
            display_code: Some(display_code),
            quote_ccy: request.currency.clone(),
            kind: request.kind.clone(),
            quote_mode: QuoteMode::Manual,
            is_active: true,
            metadata,
            ..Default::default()
        };

        let asset = self.asset_repository.create(new_asset).await?;
        let asset_id = asset.id.clone();
        debug!("Created asset: {}", asset_id);

        // Emit asset created event
        self.event_sink
            .emit(DomainEvent::assets_created(vec![asset_id.clone()]));

        // 4. Create purchase/origination quote if both price and date are provided
        if let (Some(purchase_price), Some(purchase_date)) =
            (request.purchase_price, request.purchase_date)
        {
            let purchase_quote = Quote {
                id: Uuid::new_v4().to_string(),
                asset_id: asset_id.clone(),
                timestamp: Utc.from_utc_datetime(&purchase_date.and_hms_opt(12, 0, 0).unwrap()),
                open: purchase_price,
                high: purchase_price,
                low: purchase_price,
                close: purchase_price,
                adjclose: purchase_price,
                volume: Decimal::ZERO,
                currency: request.currency.clone(),
                data_source: DataSource::Manual,
                created_at: Utc::now(),
                notes: None,
            };
            self.quote_service.add_quote(&purchase_quote).await?;
            debug!(
                "Created purchase/origination quote at {} with value {}",
                purchase_date, purchase_price
            );
        }

        // 5. Create current valuation quote
        let quote_id = Uuid::new_v4().to_string();
        let quote = Quote {
            id: quote_id.clone(),
            asset_id: asset_id.clone(),
            timestamp: Utc.from_utc_datetime(&request.value_date.and_hms_opt(12, 0, 0).unwrap()),
            open: request.current_value,
            high: request.current_value,
            low: request.current_value,
            close: request.current_value,
            adjclose: request.current_value,
            volume: Decimal::ZERO,
            currency: request.currency.clone(),
            data_source: DataSource::Manual,
            created_at: Utc::now(),
            notes: None,
        };

        let saved_quote = self.quote_service.add_quote(&quote).await?;
        debug!("Created current valuation quote: {}", saved_quote.id);

        Ok(CreateAlternativeAssetResponse {
            asset_id,
            quote_id: saved_quote.id,
        })
    }

    async fn update_valuation(
        &self,
        request: UpdateValuationRequest,
    ) -> Result<UpdateValuationResponse> {
        debug!(
            "Updating valuation for asset {} to {} on {}",
            request.asset_id, request.value, request.date
        );

        // Verify the asset exists
        self.asset_repository.get_by_id(&request.asset_id)?;

        // Get the existing quote to find the currency
        let currency = match self.quote_service.get_latest_quote(&request.asset_id) {
            Ok(existing_quote) => existing_quote.currency,
            Err(_) => {
                return Err(Error::Validation(ValidationError::InvalidInput(format!(
                    "Cannot find existing valuation for asset: {}. Please check the asset exists.",
                    request.asset_id
                ))));
            }
        };

        // Create new valuation quote
        let quote_id = Uuid::new_v4().to_string();
        let quote = Quote {
            id: quote_id.clone(),
            asset_id: request.asset_id.clone(),
            timestamp: Utc.from_utc_datetime(&request.date.and_hms_opt(12, 0, 0).unwrap()),
            open: request.value,
            high: request.value,
            low: request.value,
            close: request.value,
            adjclose: request.value,
            volume: Decimal::ZERO,
            currency,
            data_source: DataSource::Manual,
            created_at: Utc::now(),
            notes: request.notes.clone(),
        };

        let saved_quote = self.quote_service.add_quote(&quote).await?;
        debug!("Created valuation quote: {}", saved_quote.id);

        Ok(UpdateValuationResponse {
            quote_id: saved_quote.id,
            valuation_date: request.date,
            value: request.value,
        })
    }

    async fn delete_alternative_asset(&self, asset_id: &str) -> Result<()> {
        debug!("Deleting alternative asset: {}", asset_id);

        // Verify the asset exists and is an alternative asset
        let asset = self.asset_repository.get_by_id(asset_id)?;
        if !asset.kind.is_alternative() {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Asset {} is not an alternative asset (kind: {:?})",
                asset_id, asset.kind
            ))));
        }

        self.alternative_asset_repository
            .delete_alternative_asset(asset_id)
            .await?;

        debug!("Successfully deleted alternative asset: {}", asset_id);
        Ok(())
    }

    async fn link_liability(&self, request: LinkLiabilityRequest) -> Result<LinkLiabilityResponse> {
        debug!(
            "Linking liability {} to asset {}",
            request.liability_id, request.target_asset_id
        );

        // Validate liability is actually a Liability kind
        let liability = self.asset_repository.get_by_id(&request.liability_id)?;
        if liability.kind != AssetKind::Liability {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Asset {} is not a liability (kind: {:?})",
                request.liability_id, liability.kind
            ))));
        }

        // Validate target asset exists and is an alternative asset
        let target = self.asset_repository.get_by_id(&request.target_asset_id)?;
        if !target.kind.is_alternative() {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Target asset {} is not an alternative asset (kind: {:?})",
                request.target_asset_id, target.kind
            ))));
        }

        // Update liability metadata with linked_asset_id
        let new_metadata = Self::set_linked_asset_id(None, &request.target_asset_id);
        self.alternative_asset_repository
            .update_asset_metadata(&request.liability_id, Some(new_metadata))
            .await?;

        debug!(
            "Linked liability {} to asset {}",
            request.liability_id, request.target_asset_id
        );

        Ok(LinkLiabilityResponse {
            liability_id: request.liability_id,
            linked_asset_id: Some(request.target_asset_id),
        })
    }

    async fn unlink_liability(&self, liability_id: &str) -> Result<LinkLiabilityResponse> {
        debug!("Unlinking liability {}", liability_id);

        // Validate liability is actually a Liability kind
        let liability = self.asset_repository.get_by_id(liability_id)?;
        if liability.kind != AssetKind::Liability {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Asset {} is not a liability (kind: {:?})",
                liability_id, liability.kind
            ))));
        }

        // Remove linked_asset_id from metadata
        self.alternative_asset_repository
            .update_asset_metadata(liability_id, None)
            .await?;

        debug!("Unlinked liability {}", liability_id);

        Ok(LinkLiabilityResponse {
            liability_id: liability_id.to_string(),
            linked_asset_id: None,
        })
    }

    async fn update_asset_details(
        &self,
        request: UpdateAssetDetailsRequest,
    ) -> Result<UpdateAssetDetailsResponse> {
        debug!("Updating asset details for {}", request.asset_id);

        // Verify the asset exists and is an alternative asset
        let asset = self.asset_repository.get_by_id(&request.asset_id)?;
        if !asset.kind.is_alternative() {
            return Err(Error::Validation(ValidationError::InvalidInput(format!(
                "Asset {} is not an alternative asset (kind: {:?})",
                request.asset_id, asset.kind
            ))));
        }

        let existing_metadata = asset.metadata.clone();

        // Track old purchase info for quote sync
        let old_purchase_price = existing_metadata
            .as_ref()
            .and_then(|metadata| metadata.get("purchase_price"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let old_purchase_date = existing_metadata
            .as_ref()
            .and_then(|metadata| metadata.get("purchase_date"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let updated_metadata =
            Self::merge_asset_metadata(existing_metadata.as_ref(), request.metadata.as_ref());

        // Get new purchase info after merge
        let new_purchase_price = updated_metadata
            .as_ref()
            .and_then(|metadata| metadata.get("purchase_price"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let new_purchase_date = updated_metadata
            .as_ref()
            .and_then(|metadata| metadata.get("purchase_date"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Recalculate display_code from updated metadata
        let display_code = Self::derive_display_code(&asset.kind, &updated_metadata);

        // Persist asset details update
        self.alternative_asset_repository
            .update_asset_details(
                &request.asset_id,
                request.name.as_deref(),
                Some(&display_code),
                updated_metadata,
                request.notes.as_deref(),
            )
            .await?;

        // Check if purchase info changed and update/create purchase quote
        let mut purchase_quote_updated = false;
        let purchase_info_changed =
            old_purchase_price != new_purchase_price || old_purchase_date != new_purchase_date;

        if purchase_info_changed {
            if let (Some(price_str), Some(date_str)) = (&new_purchase_price, &new_purchase_date) {
                let purchase_price: Decimal = price_str.parse().map_err(|_| {
                    Error::Validation(ValidationError::InvalidInput(
                        "Invalid purchase price format".to_string(),
                    ))
                })?;
                let purchase_date = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
                    .map_err(|_| {
                        Error::Validation(ValidationError::InvalidInput(
                            "Invalid purchase date format".to_string(),
                        ))
                    })?;

                let purchase_quote = Quote {
                    id: Uuid::new_v4().to_string(),
                    asset_id: request.asset_id.clone(),
                    timestamp: Utc.from_utc_datetime(&purchase_date.and_hms_opt(12, 0, 0).unwrap()),
                    open: purchase_price,
                    high: purchase_price,
                    low: purchase_price,
                    close: purchase_price,
                    adjclose: purchase_price,
                    volume: Decimal::ZERO,
                    currency: asset.quote_ccy.clone(),
                    data_source: DataSource::Manual,
                    created_at: Utc::now(),
                    notes: None,
                };

                self.quote_service.add_quote(&purchase_quote).await?;
                purchase_quote_updated = true;
                debug!(
                    "Updated purchase quote for {} at {} with value {}",
                    request.asset_id, purchase_date, purchase_price
                );
            }
        }

        debug!(
            "Updated asset details for {}, purchase_quote_updated: {}",
            request.asset_id, purchase_quote_updated
        );

        Ok(UpdateAssetDetailsResponse {
            asset_id: request.asset_id,
            purchase_quote_updated,
        })
    }

    fn get_alternative_holdings(&self) -> Result<Vec<AlternativeHolding>> {
        debug!("Fetching alternative holdings");

        // Get all assets
        let all_assets = self.asset_repository.list()?;

        // Filter to alternative assets only
        let alternative_assets: Vec<_> = all_assets
            .into_iter()
            .filter(|a| a.kind.is_alternative())
            .collect();

        if alternative_assets.is_empty() {
            return Ok(vec![]);
        }

        // Get asset IDs for quote lookup
        let asset_ids: Vec<String> = alternative_assets.iter().map(|a| a.id.clone()).collect();

        // Fetch latest quotes for all alternative assets
        let quotes = self.quote_service.get_latest_quotes(&asset_ids)?;

        // Build AlternativeHolding for each asset
        let holdings: Vec<AlternativeHolding> = alternative_assets
            .into_iter()
            .filter_map(|asset| {
                let quote = quotes.get(&asset.id)?;

                // Extract purchase_price from metadata
                let purchase_price = asset
                    .metadata
                    .as_ref()
                    .and_then(|m| Self::decimal_from_json_value(m.get("purchase_price")));

                // Extract purchase_date from metadata
                let purchase_date = asset
                    .metadata
                    .as_ref()
                    .and_then(|m| Self::date_from_json_value(m.get("purchase_date")));

                // Extract linked_asset_id from metadata (for liabilities)
                let linked_asset_id = asset
                    .metadata
                    .as_ref()
                    .and_then(|m| m.get("linked_asset_id"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let (market_value, valuation_date) =
                    Self::derive_time_deposit_market_value(&asset)
                        .unwrap_or((quote.close, quote.timestamp));

                // Calculate unrealized gain if we have purchase price
                let (unrealized_gain, unrealized_gain_pct) = if let Some(pp) = purchase_price {
                    let gain = market_value - pp;
                    let pct = if pp != Decimal::ZERO {
                        Some(gain / pp)
                    } else {
                        None
                    };
                    (Some(gain), pct)
                } else {
                    (None, None)
                };

                Some(AlternativeHolding {
                    id: asset.id.clone(),
                    kind: asset.kind.clone(),
                    name: asset
                        .name
                        .clone()
                        .unwrap_or_else(|| asset.display_code.clone().unwrap_or_default()),
                    symbol: asset.display_code.unwrap_or_default(),
                    currency: asset.quote_ccy,
                    market_value,
                    purchase_price,
                    purchase_date,
                    unrealized_gain,
                    unrealized_gain_pct,
                    valuation_date,
                    metadata: asset.metadata,
                    linked_asset_id,
                    notes: asset.notes,
                })
            })
            .collect();

        debug!("Found {} alternative holdings", holdings.len());
        Ok(holdings)
    }

    async fn sync_panorama_mpf_unit_prices(&self) -> Result<usize> {
        let assets = self.asset_repository.list()?;
        let mpf_assets: Vec<Asset> = assets
            .into_iter()
            .filter(Self::is_panorama_mpf_asset)
            .collect();

        if mpf_assets.is_empty() {
            return Ok(0);
        }

        let snapshot = self.fetch_latest_mpf_unit_price_snapshot().await?;
        if snapshot.unit_prices_by_normalized_name.is_empty() {
            return Ok(0);
        }

        let mut updated_assets = 0usize;
        for asset in mpf_assets {
            match self.apply_mpf_unit_prices_to_asset(&asset, &snapshot).await {
                Ok(true) => updated_assets += 1,
                Ok(false) => {}
                Err(err) => {
                    warn!(
                        "Failed to apply MPF unit prices for alternative asset '{}': {}",
                        asset.id, err
                    );
                }
            }
        }

        Ok(updated_assets)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use rust_decimal_macros::dec;
    use std::collections::{HashMap, HashSet};
    use std::sync::Arc;

    use crate::assets::{InstrumentType, ProviderProfile, UpdateAssetProfile};
    use crate::quotes::{
        LatestQuotePair, LatestQuoteSnapshot, ProviderInfo, QuoteImport, QuoteSyncState,
        ResolvedQuote, SymbolSearchResult, SymbolSyncPlan, SyncMode, SyncResult,
    };
    use crate::utils::time_utils::valuation_date_today;

    struct MockAlternativeAssetRepository;

    #[async_trait]
    impl AlternativeAssetRepositoryTrait for MockAlternativeAssetRepository {
        async fn delete_alternative_asset(&self, _asset_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn update_asset_metadata(
            &self,
            _asset_id: &str,
            _metadata: Option<serde_json::Value>,
        ) -> Result<()> {
            unimplemented!()
        }

        fn find_liabilities_linked_to(&self, _linked_asset_id: &str) -> Result<Vec<String>> {
            Ok(vec![])
        }

        async fn update_asset_details(
            &self,
            _asset_id: &str,
            _name: Option<&str>,
            _display_code: Option<&str>,
            _metadata: Option<serde_json::Value>,
            _notes: Option<&str>,
        ) -> Result<()> {
            unimplemented!()
        }
    }

    struct MockAssetRepository {
        assets: Vec<Asset>,
    }

    impl MockAssetRepository {
        fn new(assets: Vec<Asset>) -> Self {
            Self { assets }
        }
    }

    #[async_trait]
    impl AssetRepositoryTrait for MockAssetRepository {
        async fn create(&self, _new_asset: NewAsset) -> Result<Asset> {
            unimplemented!()
        }

        async fn create_batch(&self, _new_assets: Vec<NewAsset>) -> Result<Vec<Asset>> {
            unimplemented!()
        }

        async fn update_profile(
            &self,
            _asset_id: &str,
            _payload: UpdateAssetProfile,
        ) -> Result<Asset> {
            unimplemented!()
        }

        async fn update_quote_mode(&self, _asset_id: &str, _quote_mode: &str) -> Result<Asset> {
            unimplemented!()
        }

        fn get_by_id(&self, asset_id: &str) -> Result<Asset> {
            self.assets
                .iter()
                .find(|asset| asset.id == asset_id)
                .cloned()
                .ok_or_else(|| Error::Repository(format!("Asset {asset_id} not found")))
        }

        fn list(&self) -> Result<Vec<Asset>> {
            Ok(self.assets.clone())
        }

        fn list_by_asset_ids(&self, asset_ids: &[String]) -> Result<Vec<Asset>> {
            Ok(self
                .assets
                .iter()
                .filter(|asset| asset_ids.contains(&asset.id))
                .cloned()
                .collect())
        }

        async fn delete(&self, _asset_id: &str) -> Result<()> {
            unimplemented!()
        }

        fn search_by_symbol(&self, _query: &str) -> Result<Vec<Asset>> {
            Ok(vec![])
        }

        fn find_by_instrument_key(&self, _instrument_key: &str) -> Result<Option<Asset>> {
            Ok(None)
        }

        async fn cleanup_legacy_metadata(&self, _asset_id: &str) -> Result<()> {
            Ok(())
        }

        async fn deactivate(&self, _asset_id: &str) -> Result<()> {
            Ok(())
        }

        async fn reactivate(&self, _asset_id: &str) -> Result<()> {
            Ok(())
        }

        async fn copy_user_metadata(&self, _source_id: &str, _target_id: &str) -> Result<()> {
            Ok(())
        }

        async fn deactivate_orphaned_investments(&self) -> Result<Vec<String>> {
            Ok(vec![])
        }
    }

    #[derive(Clone)]
    struct MockQuoteService {
        quotes: HashMap<String, Quote>,
    }

    impl MockQuoteService {
        fn new(quotes: Vec<Quote>) -> Self {
            Self {
                quotes: quotes
                    .into_iter()
                    .map(|quote| (quote.asset_id.clone(), quote))
                    .collect(),
            }
        }
    }

    #[async_trait]
    impl QuoteServiceTrait for MockQuoteService {
        fn get_latest_quote(&self, symbol: &str) -> Result<Quote> {
            self.quotes
                .get(symbol)
                .cloned()
                .ok_or_else(|| Error::Repository(format!("Quote {symbol} not found")))
        }

        fn get_latest_quotes(&self, symbols: &[String]) -> Result<HashMap<String, Quote>> {
            Ok(symbols
                .iter()
                .filter_map(|symbol| self.quotes.get(symbol).cloned().map(|quote| (symbol.clone(), quote)))
                .collect())
        }

        fn get_latest_quotes_snapshot(
            &self,
            asset_ids: &[String],
        ) -> Result<HashMap<String, LatestQuoteSnapshot>> {
            let today = Utc::now().date_naive();
            let quotes = self.get_latest_quotes(asset_ids)?;
            Ok(quotes
                .into_iter()
                .map(|(asset_id, quote)| {
                    let quote_day = quote.timestamp.date_naive();
                    (
                        asset_id,
                        LatestQuoteSnapshot {
                            quote,
                            is_stale: quote_day < today,
                            effective_market_date: today.to_string(),
                            quote_date: quote_day.to_string(),
                        },
                    )
                })
                .collect())
        }

        fn get_latest_quotes_pair(
            &self,
            _symbols: &[String],
        ) -> Result<HashMap<String, LatestQuotePair>> {
            unimplemented!()
        }

        fn get_historical_quotes(&self, _symbol: &str) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        fn get_all_historical_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>> {
            unimplemented!()
        }

        fn get_quotes_in_range(
            &self,
            _symbols: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        fn get_quotes_in_range_filled(
            &self,
            _symbols: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn get_daily_quotes(
            &self,
            _asset_ids: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>> {
            unimplemented!()
        }

        async fn add_quote(&self, _quote: &Quote) -> Result<Quote> {
            unimplemented!()
        }

        async fn update_quote(&self, quote: Quote) -> Result<Quote> {
            Ok(quote)
        }

        async fn delete_quote(&self, _quote_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn bulk_upsert_quotes(&self, _quotes: Vec<Quote>) -> Result<usize> {
            unimplemented!()
        }

        async fn search_symbol(&self, _query: &str) -> Result<Vec<SymbolSearchResult>> {
            unimplemented!()
        }

        async fn search_symbol_with_currency(
            &self,
            _query: &str,
            _account_currency: Option<&str>,
        ) -> Result<Vec<SymbolSearchResult>> {
            unimplemented!()
        }

        async fn resolve_symbol_quote(
            &self,
            _symbol: &str,
            _exchange_mic: Option<&str>,
            _instrument_type: Option<&InstrumentType>,
        ) -> Result<ResolvedQuote> {
            Ok(ResolvedQuote::default())
        }

        async fn get_asset_profile(&self, _asset: &Asset) -> Result<ProviderProfile> {
            unimplemented!()
        }

        async fn fetch_quotes_from_provider(
            &self,
            _asset_id: &str,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn fetch_quotes_for_symbol(
            &self,
            _asset_id: &str,
            _currency: &str,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn sync(&self, _mode: SyncMode, _asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
            unimplemented!()
        }

        async fn resync(&self, _asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
            unimplemented!()
        }

        async fn refresh_sync_state(&self) -> Result<()> {
            unimplemented!()
        }

        fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>> {
            unimplemented!()
        }

        async fn handle_activity_created(&self, _symbol: &str, _activity_date: NaiveDate) -> Result<()> {
            unimplemented!()
        }

        async fn handle_activity_deleted(&self, _symbol: &str) -> Result<()> {
            unimplemented!()
        }

        async fn delete_sync_state(&self, _symbol: &str) -> Result<()> {
            unimplemented!()
        }

        fn get_symbols_needing_sync(&self) -> Result<Vec<QuoteSyncState>> {
            unimplemented!()
        }

        fn get_sync_state(&self, _symbol: &str) -> Result<Option<QuoteSyncState>> {
            unimplemented!()
        }

        async fn mark_profile_enriched(&self, _symbol: &str) -> Result<()> {
            unimplemented!()
        }

        fn get_assets_needing_profile_enrichment(&self) -> Result<Vec<QuoteSyncState>> {
            unimplemented!()
        }

        fn get_sync_states_with_errors(&self) -> Result<Vec<QuoteSyncState>> {
            unimplemented!()
        }

        async fn update_position_status_from_holdings(
            &self,
            _current_holdings: &HashMap<String, Decimal>,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn get_providers_info(&self) -> Result<Vec<ProviderInfo>> {
            unimplemented!()
        }

        async fn update_provider_settings(
            &self,
            _provider_id: &str,
            _priority: i32,
            _enabled: bool,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn check_quotes_import(
            &self,
            _content: &[u8],
            _has_header_row: bool,
        ) -> Result<Vec<QuoteImport>> {
            unimplemented!()
        }

        async fn import_quotes(
            &self,
            _quotes: Vec<QuoteImport>,
            _overwrite: bool,
        ) -> Result<Vec<QuoteImport>> {
            unimplemented!()
        }
    }

    fn sample_asset(id: &str, metadata: Option<Value>) -> Asset {
        Asset {
            id: id.to_string(),
            kind: AssetKind::Other,
            name: Some("Sample Time Deposit".to_string()),
            display_code: Some("Time Deposit".to_string()),
            notes: None,
            metadata,
            is_active: true,
            quote_mode: QuoteMode::Manual,
            quote_ccy: "HKD".to_string(),
            instrument_type: None,
            instrument_symbol: None,
            instrument_exchange_mic: None,
            instrument_key: None,
            provider_config: None,
            exchange_name: None,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
        }
    }

    fn sample_quote(asset_id: &str, close: Decimal, quote_date: NaiveDate) -> Quote {
        Quote {
            id: format!("QUOTE-{asset_id}"),
            asset_id: asset_id.to_string(),
            timestamp: Utc.from_utc_datetime(&quote_date.and_hms_opt(12, 0, 0).unwrap()),
            open: close,
            high: close,
            low: close,
            close,
            adjclose: close,
            volume: Decimal::ZERO,
            currency: "HKD".to_string(),
            data_source: DataSource::Manual,
            created_at: Utc::now(),
            notes: None,
        }
    }

    #[test]
    fn test_validate_alternative_asset_kind() {
        // Valid alternative asset kinds
        assert!(
            AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Property).is_ok()
        );
        assert!(
            AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Vehicle).is_ok()
        );
        assert!(
            AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Collectible)
                .is_ok()
        );
        assert!(AlternativeAssetService::validate_alternative_asset_kind(
            &AssetKind::PreciousMetal
        )
        .is_ok());
        assert!(
            AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Liability).is_ok()
        );
        assert!(
            AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Other).is_ok()
        );

        // Invalid asset kinds
        assert!(
            AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Investment)
                .is_err()
        );
        assert!(AlternativeAssetService::validate_alternative_asset_kind(&AssetKind::Fx).is_err());
    }

    #[test]
    fn test_build_asset_metadata() {
        let request = CreateAlternativeAssetRequest {
            kind: AssetKind::Property,
            name: "Beach House".to_string(),
            currency: "USD".to_string(),
            current_value: Decimal::new(450000, 0),
            value_date: chrono::NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            purchase_price: Some(Decimal::new(400000, 0)),
            purchase_date: Some(chrono::NaiveDate::from_ymd_opt(2020, 3, 1).unwrap()),
            metadata: Some(json!({"sub_type": "residence"})),
            linked_asset_id: None,
        };

        let metadata = AlternativeAssetService::build_asset_metadata(&request);
        assert!(metadata.is_some());
        let meta = metadata.unwrap();
        assert_eq!(meta.get("sub_type").unwrap(), "residence");
        assert!(meta.get("purchase_price").is_some());
        assert!(meta.get("purchase_date").is_some());
    }

    #[test]
    fn test_set_and_remove_linked_asset_id() {
        let metadata = AlternativeAssetService::set_linked_asset_id(None, "some-uuid-for-property");
        assert_eq!(
            metadata.get("linked_asset_id").unwrap(),
            "some-uuid-for-property"
        );

        let linked_id = AlternativeAssetService::get_linked_asset_id(&Some(metadata.clone()));
        assert_eq!(linked_id, Some("some-uuid-for-property".to_string()));

        let removed = AlternativeAssetService::remove_linked_asset_id(Some(metadata));
        assert!(removed.is_none()); // Only had linked_asset_id, so should be None when removed
    }

    #[test]
    fn test_merge_asset_metadata_preserves_structured_values() {
        let existing = json!({
            "owner": "Alice",
            "obsolete": "remove-me",
            "mpf_subfunds": [
                {
                    "name": "Existing Fund",
                    "allocation_pct": 100
                }
            ]
        });

        let updates = std::collections::HashMap::from([
            ("owner".to_string(), json!("Bob")),
            (
                "mpf_subfunds".to_string(),
                json!([
                    {
                        "name": "Core Accumulation",
                        "allocation_pct": 60.5
                    },
                    {
                        "name": "Equity Fund",
                        "allocation_pct": 39.5,
                        "units": 128.25
                    }
                ]),
            ),
            (
                "fund_allocation".to_string(),
                json!({
                    "Core Accumulation": 60.5,
                    "Equity Fund": 39.5
                }),
            ),
            ("obsolete".to_string(), Value::Null),
        ]);

        let merged = AlternativeAssetService::merge_asset_metadata(Some(&existing), Some(&updates))
            .expect("expected merged metadata");

        assert_eq!(merged.get("owner"), Some(&json!("Bob")));
        assert!(merged.get("obsolete").is_none());
        assert_eq!(
            merged.pointer("/mpf_subfunds/1/units"),
            Some(&json!(128.25))
        );
        assert_eq!(
            merged.pointer("/fund_allocation/Core Accumulation"),
            Some(&json!(60.5))
        );
    }

    #[test]
    fn test_get_alternative_holdings_derives_time_deposit_current_value() {
        let today = valuation_date_today();
        let start_date = today - chrono::Duration::days(50);
        let maturity_date = today + chrono::Duration::days(50);
        let asset_id = "ALT-TD-DERIVED";

        let metadata = Some(json!({
            "panorama_category": "time_deposit",
            "sub_type": "time_deposit",
            "principal": "10000",
            "start_date": start_date.to_string(),
            "maturity_date": maturity_date.to_string(),
            "quoted_annual_rate": 7.3,
            "valuation_mode": "derived",
            "purchase_price": "10000",
            "purchase_date": start_date.to_string()
        }));

        let service = AlternativeAssetService::new(
            Arc::new(MockAlternativeAssetRepository),
            Arc::new(MockAssetRepository::new(vec![sample_asset(asset_id, metadata)])),
            Arc::new(MockQuoteService::new(vec![sample_quote(
                asset_id,
                dec!(10000),
                start_date,
            )])),
        );

        let holdings = service.get_alternative_holdings().expect("expected holdings");
        let holding = holdings.first().expect("expected derived holding");

        assert_eq!(holding.market_value, dec!(10100));
        assert_eq!(holding.purchase_price, Some(dec!(10000)));
        assert_eq!(holding.purchase_date, Some(start_date));
        assert_eq!(holding.unrealized_gain, Some(dec!(100)));
        assert_eq!(holding.unrealized_gain_pct, Some(dec!(0.01)));
        assert_eq!(holding.valuation_date.date_naive(), today);
    }

    #[test]
    fn test_get_alternative_holdings_uses_time_deposit_manual_override() {
        let today = valuation_date_today();
        let start_date = today - chrono::Duration::days(50);
        let maturity_date = today + chrono::Duration::days(50);
        let override_date = today - chrono::Duration::days(1);
        let asset_id = "ALT-TD-MANUAL";

        let metadata = Some(json!({
            "panorama_category": "time_deposit",
            "sub_type": "time_deposit",
            "principal": "10000",
            "start_date": start_date.to_string(),
            "maturity_date": maturity_date.to_string(),
            "quoted_annual_rate": 7.3,
            "valuation_mode": "manual",
            "current_value_override": "10123.45",
            "valuation_date": override_date.to_string(),
            "purchase_price": "10000",
            "purchase_date": start_date.to_string()
        }));

        let service = AlternativeAssetService::new(
            Arc::new(MockAlternativeAssetRepository),
            Arc::new(MockAssetRepository::new(vec![sample_asset(asset_id, metadata)])),
            Arc::new(MockQuoteService::new(vec![sample_quote(
                asset_id,
                dec!(10000),
                start_date,
            )])),
        );

        let holdings = service.get_alternative_holdings().expect("expected holdings");
        let holding = holdings.first().expect("expected manual holding");

        assert_eq!(holding.market_value, dec!(10123.45));
        assert_eq!(holding.unrealized_gain, Some(dec!(123.45)));
        assert_eq!(holding.valuation_date.date_naive(), override_date);
    }

    #[test]
    fn test_get_alternative_holdings_caps_time_deposit_at_maturity_value() {
        let today = valuation_date_today();
        let start_date = today - chrono::Duration::days(100);
        let maturity_date = today - chrono::Duration::days(1);
        let asset_id = "ALT-TD-MATURED";

        let metadata = Some(json!({
            "panorama_category": "time_deposit",
            "sub_type": "time_deposit",
            "principal": "10000",
            "start_date": start_date.to_string(),
            "maturity_date": maturity_date.to_string(),
            "guaranteed_maturity_value": "10200",
            "valuation_mode": "derived",
            "purchase_price": "10000",
            "purchase_date": start_date.to_string()
        }));

        let service = AlternativeAssetService::new(
            Arc::new(MockAlternativeAssetRepository),
            Arc::new(MockAssetRepository::new(vec![sample_asset(asset_id, metadata)])),
            Arc::new(MockQuoteService::new(vec![sample_quote(
                asset_id,
                dec!(10000),
                start_date,
            )])),
        );

        let holdings = service.get_alternative_holdings().expect("expected holdings");
        let holding = holdings.first().expect("expected matured holding");

        assert_eq!(holding.market_value, dec!(10200));
        assert_eq!(holding.unrealized_gain, Some(dec!(200)));
    }

    #[test]
    fn test_apply_mpf_snapshot_updates_subfunds_and_total_value() {
        let snapshot = MpfUnitPriceSnapshot {
            valuation_date: Some(chrono::NaiveDate::from_ymd_opt(2026, 3, 2).unwrap()),
            unit_prices_by_normalized_name: std::collections::HashMap::from([
                ("core accumulation fund".to_string(), Decimal::new(215, 1)),
                ("equity fund".to_string(), Decimal::new(184, 1)),
            ]),
        };

        let update = AlternativeAssetService::apply_mpf_unit_prices_to_metadata(
            &Some(json!({
                "panorama_category": "mpf",
                "mpf_subfunds": [
                    { "name": "Core Accumulation Fund", "units": 10 },
                    { "name": "Equity Fund", "units": 5 }
                ]
            })),
            &snapshot,
        )
        .expect("expected MPF metadata update");

        assert_eq!(
            update.valuation_date,
            chrono::NaiveDate::from_ymd_opt(2026, 3, 2).unwrap()
        );
        assert_eq!(update.market_value, Some(Decimal::new(307, 0)));
        assert_eq!(
            update.metadata.pointer("/mpf_subfunds/0/nav"),
            Some(&json!(21.5))
        );
        assert_eq!(
            update.metadata.pointer("/mpf_subfunds/1/market_value"),
            Some(&json!(92.0))
        );
        assert_eq!(
            update.metadata.pointer("/market_value"),
            Some(&json!(307.0))
        );
        assert_eq!(
            update.metadata.pointer("/valuation_date"),
            Some(&json!("2026-03-02"))
        );
    }

    #[test]
    fn test_apply_mpf_snapshot_skips_non_mpf_metadata() {
        let snapshot = MpfUnitPriceSnapshot {
            valuation_date: Some(chrono::NaiveDate::from_ymd_opt(2026, 3, 2).unwrap()),
            unit_prices_by_normalized_name: std::collections::HashMap::from([(
                "core accumulation fund".to_string(),
                Decimal::new(215, 1),
            )]),
        };

        assert!(AlternativeAssetService::apply_mpf_unit_prices_to_metadata(
            &Some(json!({
                "owner": "Alice",
                "notes": "Not an MPF asset"
            })),
            &snapshot,
        )
        .is_none());
    }
}
