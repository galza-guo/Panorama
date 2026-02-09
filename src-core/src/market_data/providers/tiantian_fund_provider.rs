use crate::market_data::market_data_model::DataSource;
use crate::market_data::providers::market_data_provider::{AssetProfiler, MarketDataProvider};
use crate::market_data::providers::models::AssetProfile;
use crate::market_data::{MarketDataError, Quote as ModelQuote, QuoteSummary};
use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use futures::future::join_all;
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Deserialize;
use std::cmp::{max, min};
use std::str::FromStr;
use std::time::SystemTime;

const LATEST_URL_BASE: &str = "https://fundgz.1234567.com.cn/js";
const HISTORY_URL: &str = "https://api.fund.eastmoney.com/f10/lsjz";
const PROFILE_INFO_URL_BASE: &str = "https://fund.eastmoney.com/pingzhongdata";
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const REFERER: &str = "https://fundf10.eastmoney.com/";
const BULK_BATCH_SIZE: usize = 5;
const HISTORY_PAGE_SIZE: usize = 200;
const MAX_HISTORY_PAGES: usize = 60;

#[derive(Debug, Deserialize)]
struct TiantianLatestResponse {
    #[serde(default)]
    fundcode: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    jzrq: String,
    #[serde(default)]
    dwjz: String,
    #[serde(default)]
    gsz: String,
    #[serde(default)]
    gztime: String,
}

#[derive(Debug, Deserialize)]
struct FundHistoryResponse {
    #[serde(rename = "ErrCode")]
    err_code: Option<i64>,
    #[serde(rename = "ErrMsg")]
    err_msg: Option<String>,
    #[serde(rename = "TotalCount")]
    total_count: Option<usize>,
    #[serde(rename = "Data")]
    data: Option<FundHistoryData>,
}

#[derive(Debug, Deserialize)]
struct FundHistoryData {
    #[serde(rename = "LSJZList", default)]
    lsjz_list: Vec<FundHistoryItem>,
}

#[derive(Debug, Deserialize)]
struct FundHistoryItem {
    #[serde(rename = "FSRQ")]
    date: String,
    #[serde(rename = "DWJZ")]
    nav: String,
}

pub struct TiantianFundProvider {
    client: Client,
}

impl TiantianFundProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    fn parse_fund_symbol(symbol: &str) -> Option<(String, String)> {
        let normalized = symbol.trim().to_uppercase();
        if let Some((code, market)) = normalized.split_once('.') {
            let code = code.to_string();
            if market == "FUND" && code.len() == 6 && code.chars().all(|ch| ch.is_ascii_digit()) {
                return Some((normalized, code));
            }
            return None;
        }

        if normalized.len() == 6 && normalized.chars().all(|ch| ch.is_ascii_digit()) {
            return Some((normalized.clone(), normalized));
        }

        None
    }

    fn fallback_currency(fallback_currency: String) -> String {
        if fallback_currency.trim().is_empty() {
            "CNY".to_string()
        } else {
            fallback_currency
        }
    }

    fn parse_decimal(value: &str) -> Option<Decimal> {
        let trimmed = value.trim();
        if trimmed.is_empty() || trimmed == "--" {
            return None;
        }
        Decimal::from_str(trimmed).ok()
    }

    fn parse_latest_timestamp(gztime: &str, jzrq: &str) -> DateTime<Utc> {
        if let Ok(parsed) = chrono::NaiveDateTime::parse_from_str(gztime, "%Y-%m-%d %H:%M:%S") {
            return Utc.from_utc_datetime(&parsed);
        }

        if let Ok(parsed) = chrono::NaiveDateTime::parse_from_str(gztime, "%Y-%m-%d %H:%M") {
            return Utc.from_utc_datetime(&parsed);
        }

        if let Ok(date) = NaiveDate::parse_from_str(jzrq, "%Y-%m-%d") {
            if let Some(naive) = date.and_hms_opt(0, 0, 0) {
                return Utc.from_utc_datetime(&naive);
            }
        }

        Utc::now()
    }

    fn parse_jsonp_payload(payload: &str) -> Option<&str> {
        let start = payload.find('(')?;
        let end = payload.rfind(')')?;
        if end <= start {
            return None;
        }
        Some(payload[start + 1..end].trim())
    }

    fn quote_from_nav(
        symbol: &str,
        timestamp: DateTime<Utc>,
        nav: Decimal,
        maybe_open: Option<Decimal>,
        currency: &str,
    ) -> ModelQuote {
        let open = maybe_open.unwrap_or(nav);
        let high = max(open, nav);
        let low = min(open, nav);

        ModelQuote {
            id: format!("{}_{}", timestamp.format("%Y%m%d"), symbol),
            created_at: Utc::now(),
            data_source: DataSource::TiantianFund,
            timestamp,
            symbol: symbol.to_string(),
            open,
            high,
            low,
            close: nav,
            adjclose: nav,
            volume: Decimal::ZERO,
            currency: currency.to_string(),
        }
    }

    fn parse_latest_quote_fields(
        json: &str,
        fund_code: &str,
    ) -> Result<Option<(Decimal, Option<Decimal>, DateTime<Utc>)>, MarketDataError> {
        if json.trim().is_empty() {
            return Ok(None);
        }

        let latest: TiantianLatestResponse =
            serde_json::from_str(json).map_err(|e| MarketDataError::ParsingError(e.to_string()))?;

        if latest.fundcode != fund_code {
            return Ok(None);
        }

        let close = Self::parse_decimal(&latest.gsz).or_else(|| Self::parse_decimal(&latest.dwjz));
        let Some(close) = close else {
            return Ok(None);
        };

        let open = Self::parse_decimal(&latest.dwjz);
        let timestamp = Self::parse_latest_timestamp(&latest.gztime, &latest.jzrq);
        Ok(Some((close, open, timestamp)))
    }

    fn parse_fund_name_fields(
        json: &str,
        fund_code: &str,
    ) -> Result<Option<String>, MarketDataError> {
        if json.trim().is_empty() {
            return Ok(None);
        }

        let latest: TiantianLatestResponse =
            serde_json::from_str(json).map_err(|e| MarketDataError::ParsingError(e.to_string()))?;

        if latest.fundcode != fund_code {
            return Ok(None);
        }

        let name = latest.name.trim();
        if name.is_empty() {
            return Ok(None);
        }

        Ok(Some(name.to_string()))
    }

    fn parse_fund_name_from_profile_js(body: &str) -> Option<String> {
        let marker = "var fS_name = \"";
        let start = body.find(marker)?;
        let tail = &body[start + marker.len()..];
        let end = tail.find('"')?;
        let name = tail[..end].trim();
        if name.is_empty() {
            None
        } else {
            Some(name.to_string())
        }
    }

    async fn get_fund_name_from_profile_js(
        &self,
        fund_code: &str,
    ) -> Result<Option<String>, MarketDataError> {
        let url = format!(
            "{PROFILE_INFO_URL_BASE}/{fund_code}.js?v={}",
            Utc::now().timestamp_millis()
        );

        let response = self
            .client
            .get(url)
            .header("User-Agent", USER_AGENT)
            .header("Referer", "https://fund.eastmoney.com/")
            .send()
            .await
            .map_err(MarketDataError::NetworkError)?;

        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError(format!(
                "TIANTIAN_FUND profile-js HTTP {} for fund {}",
                response.status(),
                fund_code
            )));
        }

        let body = response
            .text()
            .await
            .map_err(MarketDataError::NetworkError)?;
        Ok(Self::parse_fund_name_from_profile_js(&body))
    }

    async fn get_latest_quote_from_history(
        &self,
        normalized_symbol: &str,
        fund_code: &str,
        currency: &str,
    ) -> Result<ModelQuote, MarketDataError> {
        let url = reqwest::Url::parse_with_params(
            HISTORY_URL,
            &[("fundCode", fund_code), ("pageIndex", "1"), ("pageSize", "1")],
        )
        .map_err(|e| MarketDataError::ProviderError(format!("Failed to build URL: {e}")))?;

        let response = self
            .client
            .get(url)
            .header("User-Agent", USER_AGENT)
            .header("Referer", REFERER)
            .send()
            .await
            .map_err(MarketDataError::NetworkError)?;

        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError(format!(
                "TIANTIAN_FUND history fallback HTTP {} for symbol {}",
                response.status(),
                normalized_symbol
            )));
        }

        let payload: FundHistoryResponse = response
            .json()
            .await
            .map_err(MarketDataError::NetworkError)?;

        if payload.err_code.unwrap_or(0) != 0 {
            let err_msg = payload
                .err_msg
                .unwrap_or_else(|| "Unknown Tiantian fund history error".to_string());
            return Err(MarketDataError::ProviderError(err_msg));
        }

        let items = payload.data.map(|v| v.lsjz_list).unwrap_or_default();
        for item in items {
            let Ok(date) = NaiveDate::parse_from_str(&item.date, "%Y-%m-%d") else {
                continue;
            };
            let Some(nav) = Self::parse_decimal(&item.nav) else {
                continue;
            };
            let Some(naive) = date.and_hms_opt(0, 0, 0) else {
                continue;
            };
            let timestamp = Utc.from_utc_datetime(&naive);
            return Ok(Self::quote_from_nav(
                normalized_symbol,
                timestamp,
                nav,
                Some(nav),
                currency,
            ));
        }

        Err(MarketDataError::NoData)
    }
}

#[async_trait]
impl AssetProfiler for TiantianFundProvider {
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let (normalized_symbol, fund_code) = Self::parse_fund_symbol(symbol).ok_or_else(|| {
            MarketDataError::ProviderError(format!(
                "TIANTIAN_FUND only supports 6-digit FUND symbols, got: {symbol}"
            ))
        })?;

        let name_from_latest = async {
            let url = format!("{LATEST_URL_BASE}/{fund_code}.js");
            let response = self
                .client
                .get(url)
                .header("User-Agent", USER_AGENT)
                .header("Referer", REFERER)
                .send()
                .await
                .map_err(MarketDataError::NetworkError)?;

            if !response.status().is_success() {
                return Err(MarketDataError::ProviderError(format!(
                    "TIANTIAN_FUND profile HTTP {} for symbol {}",
                    response.status(),
                    normalized_symbol
                )));
            }

            let body = response
                .text()
                .await
                .map_err(MarketDataError::NetworkError)?;
            let json = Self::parse_jsonp_payload(&body).ok_or_else(|| {
                MarketDataError::ParsingError(
                    "Failed to parse Tiantian latest JSONP payload".to_string(),
                )
            })?;
            Self::parse_fund_name_fields(json, &fund_code)
        }
        .await;

        let name = match name_from_latest {
            Ok(Some(value)) => Some(value),
            Ok(None) => self.get_fund_name_from_profile_js(&fund_code).await?,
            Err(err) => {
                log::debug!(
                    "TIANTIAN_FUND latest profile name lookup failed for {}: {}",
                    normalized_symbol,
                    err
                );
                self.get_fund_name_from_profile_js(&fund_code).await?
            }
        };

        Ok(AssetProfile {
            id: Some(normalized_symbol.clone()),
            name,
            asset_type: Some("FUND".to_string()),
            symbol: normalized_symbol.clone(),
            symbol_mapping: Some(fund_code),
            asset_class: Some("Equity".to_string()),
            asset_sub_class: Some("Mutual Fund".to_string()),
            currency: "CNY".to_string(),
            data_source: DataSource::TiantianFund.as_str().to_string(),
            ..Default::default()
        })
    }

    async fn search_ticker(&self, _query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        Ok(vec![])
    }
}

#[async_trait]
impl MarketDataProvider for TiantianFundProvider {
    fn name(&self) -> &'static str {
        "TIANTIAN_FUND"
    }

    fn priority(&self) -> u8 {
        1
    }

    async fn get_latest_quote(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<ModelQuote, MarketDataError> {
        let (normalized_symbol, fund_code) = Self::parse_fund_symbol(symbol).ok_or_else(|| {
            MarketDataError::ProviderError(format!(
                "TIANTIAN_FUND only supports 6-digit FUND symbols, got: {symbol}"
            ))
        })?;
        let fallback_currency = Self::fallback_currency(fallback_currency);
        let url = format!("{LATEST_URL_BASE}/{fund_code}.js");
        let latest_quote_result = async {
            let response = self
                .client
                .get(url)
                .header("User-Agent", USER_AGENT)
                .header("Referer", REFERER)
                .send()
                .await
                .map_err(MarketDataError::NetworkError)?;

            if !response.status().is_success() {
                return Err(MarketDataError::ProviderError(format!(
                    "TIANTIAN_FUND latest quote HTTP {} for symbol {}",
                    response.status(),
                    normalized_symbol
                )));
            }

            let body = response
                .text()
                .await
                .map_err(MarketDataError::NetworkError)?;
            let json = Self::parse_jsonp_payload(&body).ok_or_else(|| {
                MarketDataError::ParsingError(
                    "Failed to parse Tiantian latest JSONP payload".to_string(),
                )
            })?;
            let latest_fields = Self::parse_latest_quote_fields(json, &fund_code)?;
            let Some((close, open, timestamp)) = latest_fields else {
                return Err(MarketDataError::NoData);
            };

            Ok(Self::quote_from_nav(
                &normalized_symbol,
                timestamp,
                close,
                open,
                &fallback_currency,
            ))
        }
        .await;

        match latest_quote_result {
            Ok(quote) => Ok(quote),
            Err(primary_error) => {
                log::info!(
                    "TIANTIAN_FUND latest endpoint unavailable for symbol {} ({}), falling back to history latest NAV",
                    normalized_symbol,
                    primary_error
                );
                self.get_latest_quote_from_history(
                    &normalized_symbol,
                    &fund_code,
                    &fallback_currency,
                )
                .await
                .map_err(|history_error| {
                    log::warn!(
                        "TIANTIAN_FUND history fallback failed for symbol {}: primary_error={}, history_error={}",
                        normalized_symbol,
                        primary_error,
                        history_error
                    );
                    history_error
                })
            }
        }
    }

    async fn get_historical_quotes(
        &self,
        symbol: &str,
        start: SystemTime,
        end: SystemTime,
        fallback_currency: String,
    ) -> Result<Vec<ModelQuote>, MarketDataError> {
        let (normalized_symbol, fund_code) = Self::parse_fund_symbol(symbol).ok_or_else(|| {
            MarketDataError::ProviderError(format!(
                "TIANTIAN_FUND only supports 6-digit FUND symbols, got: {symbol}"
            ))
        })?;

        if start >= end {
            return Ok(Vec::new());
        }

        let fallback_currency = Self::fallback_currency(fallback_currency);
        let start_date = DateTime::<Utc>::from(start).format("%Y-%m-%d").to_string();
        let end_date = DateTime::<Utc>::from(end).format("%Y-%m-%d").to_string();

        let mut page_index = 1usize;
        let mut quotes = Vec::new();

        while page_index <= MAX_HISTORY_PAGES {
            let page_index_str = page_index.to_string();
            let page_size_str = HISTORY_PAGE_SIZE.to_string();
            let url = reqwest::Url::parse_with_params(
                HISTORY_URL,
                &[
                    ("fundCode", fund_code.as_str()),
                    ("pageIndex", page_index_str.as_str()),
                    ("pageSize", page_size_str.as_str()),
                    ("startDate", start_date.as_str()),
                    ("endDate", end_date.as_str()),
                ],
            )
            .map_err(|e| MarketDataError::ProviderError(format!("Failed to build URL: {e}")))?;

            let response = self
                .client
                .get(url)
                .header("User-Agent", USER_AGENT)
                .header("Referer", REFERER)
                .send()
                .await
                .map_err(MarketDataError::NetworkError)?;

            if !response.status().is_success() {
                return Err(MarketDataError::ProviderError(format!(
                    "TIANTIAN_FUND history HTTP {} for symbol {}",
                    response.status(),
                    normalized_symbol
                )));
            }

            let payload: FundHistoryResponse = response
                .json()
                .await
                .map_err(MarketDataError::NetworkError)?;

            if payload.err_code.unwrap_or(0) != 0 {
                let err_msg = payload
                    .err_msg
                    .unwrap_or_else(|| "Unknown Tiantian fund history error".to_string());
                return Err(MarketDataError::ProviderError(err_msg));
            }

            let items = payload.data.map(|v| v.lsjz_list).unwrap_or_default();
            if items.is_empty() {
                break;
            }

            for item in &items {
                let date = match NaiveDate::parse_from_str(&item.date, "%Y-%m-%d") {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                let nav = match Self::parse_decimal(&item.nav) {
                    Some(value) => value,
                    None => continue,
                };
                let timestamp = match date.and_hms_opt(0, 0, 0) {
                    Some(value) => Utc.from_utc_datetime(&value),
                    None => continue,
                };
                quotes.push(Self::quote_from_nav(
                    &normalized_symbol,
                    timestamp,
                    nav,
                    Some(nav),
                    &fallback_currency,
                ));
            }

            if items.len() < HISTORY_PAGE_SIZE {
                break;
            }

            if let Some(total) = payload.total_count {
                if page_index * HISTORY_PAGE_SIZE >= total {
                    break;
                }
            }

            page_index += 1;
            tokio::time::sleep(tokio::time::Duration::from_millis(120)).await;
        }

        if quotes.is_empty() {
            return Err(MarketDataError::NoData);
        }

        quotes.sort_by_key(|quote| quote.timestamp);
        Ok(quotes)
    }

    async fn get_historical_quotes_bulk(
        &self,
        symbols_with_currencies: &[(String, String)],
        start: SystemTime,
        end: SystemTime,
    ) -> Result<(Vec<ModelQuote>, Vec<(String, String)>), MarketDataError> {
        if symbols_with_currencies.is_empty() || start >= end {
            return Ok((Vec::new(), Vec::new()));
        }

        let mut all_quotes = Vec::new();
        let mut failed_symbols: Vec<(String, String)> = Vec::new();
        let mut supported = Vec::new();

        for (symbol, currency) in symbols_with_currencies {
            if Self::parse_fund_symbol(symbol).is_some() {
                supported.push((symbol.clone(), currency.clone()));
            } else {
                failed_symbols.push((symbol.clone(), currency.clone()));
            }
        }

        for chunk in supported.chunks(BULK_BATCH_SIZE) {
            let futures = chunk.iter().map(|(symbol, currency)| {
                let symbol_clone = symbol.clone();
                let currency_clone = currency.clone();
                async move {
                    self.get_historical_quotes(&symbol_clone, start, end, currency_clone.clone())
                        .await
                        .map_err(|e| (symbol_clone, currency_clone, e.to_string()))
                }
            });

            for result in join_all(futures).await {
                match result {
                    Ok(quotes) => all_quotes.extend(quotes),
                    Err((symbol, currency, error)) => {
                        log::warn!(
                            "TIANTIAN_FUND failed to fetch history for symbol {}: {}",
                            symbol,
                            error
                        );
                        failed_symbols.push((symbol, currency));
                    }
                }
            }

            if chunk.len() == BULK_BATCH_SIZE {
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }
        }

        Ok((all_quotes, failed_symbols))
    }
}

#[cfg(test)]
mod tests {
    use super::TiantianFundProvider;
    use rust_decimal::Decimal;

    #[test]
    fn parses_supported_symbols() {
        let with_suffix = TiantianFundProvider::parse_fund_symbol("161039.FUND");
        assert!(with_suffix.is_some());
        assert_eq!(with_suffix.unwrap().1, "161039");

        let bare = TiantianFundProvider::parse_fund_symbol("161039");
        assert!(bare.is_some());
        assert_eq!(bare.unwrap().1, "161039");
    }

    #[test]
    fn rejects_unsupported_symbols() {
        assert!(TiantianFundProvider::parse_fund_symbol("600519.SH").is_none());
        assert!(TiantianFundProvider::parse_fund_symbol("0700.HK").is_none());
        assert!(TiantianFundProvider::parse_fund_symbol("AAPL.US").is_none());
    }

    #[test]
    fn treats_empty_latest_json_as_no_data() {
        let result = TiantianFundProvider::parse_latest_quote_fields("", "164906").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn parses_latest_quote_fields_when_json_valid() {
        let json = r#"{"fundcode":"000083","jzrq":"2026-02-06","dwjz":"5.1210","gsz":"5.1266","gztime":"2026-02-09 15:00"}"#;
        let result = TiantianFundProvider::parse_latest_quote_fields(json, "000083")
            .unwrap()
            .unwrap();
        assert_eq!(result.0, Decimal::from_str_exact("5.1266").unwrap());
        assert_eq!(result.1, Some(Decimal::from_str_exact("5.1210").unwrap()));
    }

    #[test]
    fn returns_no_data_for_mismatched_fundcode() {
        let json = r#"{"fundcode":"000083","jzrq":"2026-02-06","dwjz":"5.1210","gsz":"5.1266","gztime":"2026-02-09 15:00"}"#;
        let result = TiantianFundProvider::parse_latest_quote_fields(json, "006105").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn parses_fund_name_from_profile_js_payload() {
        let body = r#"/*基金或股票信息*/var fS_name = "华安德国(DAX)联接(QDII)A";var fS_code = "000614";"#;
        let parsed = TiantianFundProvider::parse_fund_name_from_profile_js(body);
        assert_eq!(parsed.as_deref(), Some("华安德国(DAX)联接(QDII)A"));
    }
}
