//! Tiantian provider for mainland China OTC mutual funds.

use std::cmp::{max, min};
use std::str::FromStr;
use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Deserialize;

use crate::errors::MarketDataError;
use crate::models::{
    AssetProfile, Coverage, InstrumentKind, ProviderInstrument, Quote, QuoteContext, SearchResult,
};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};

const LATEST_URL_BASE: &str = "https://fundgz.1234567.com.cn/js";
const HISTORY_URL: &str = "https://api.fund.eastmoney.com/f10/lsjz";
const PROFILE_INFO_URL_BASE: &str = "https://fund.eastmoney.com/pingzhongdata";
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const REFERER: &str = "https://fundf10.eastmoney.com/";
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

    fn extract_symbol(instrument: &ProviderInstrument) -> Result<&str, MarketDataError> {
        match instrument {
            ProviderInstrument::EquitySymbol { symbol } => Ok(symbol.as_ref()),
            _ => Err(MarketDataError::UnsupportedAssetType(
                "TIANTIAN_FUND only supports fund symbols".to_string(),
            )),
        }
    }

    fn parse_fund_symbol(raw_symbol: &str) -> Result<(String, String), MarketDataError> {
        let normalized = raw_symbol.trim().to_uppercase();
        if normalized.is_empty() {
            return Err(MarketDataError::ProviderError {
                provider: "TIANTIAN_FUND".to_string(),
                message: "symbol cannot be empty".to_string(),
            });
        }

        let code = if let Some((code, suffix)) = normalized.split_once('.') {
            if suffix != "FUND" {
                return Err(MarketDataError::ProviderError {
                    provider: "TIANTIAN_FUND".to_string(),
                    message: format!("unsupported fund suffix in '{raw_symbol}'"),
                });
            }
            code.to_string()
        } else {
            normalized.clone()
        };

        if code.len() != 6 || !code.chars().all(|ch| ch.is_ascii_digit()) {
            return Err(MarketDataError::ProviderError {
                provider: "TIANTIAN_FUND".to_string(),
                message: format!("unsupported fund symbol '{raw_symbol}'"),
            });
        }

        Ok((format!("{code}.FUND"), code))
    }

    fn parse_decimal(value: &str) -> Option<Decimal> {
        let trimmed = value.trim();
        if trimmed.is_empty() || trimmed == "--" {
            return None;
        }

        Decimal::from_str(trimmed).ok()
    }

    fn parse_jsonp_payload(payload: &str) -> Option<&str> {
        let start = payload.find('(')?;
        let end = payload.rfind(')')?;
        if end <= start {
            return None;
        }
        Some(payload[start + 1..end].trim())
    }

    fn parse_latest_quote_fields(
        json: &str,
        fund_code: &str,
    ) -> Result<Option<(Decimal, Option<Decimal>, DateTime<Utc>)>, MarketDataError> {
        if json.trim().is_empty() {
            return Ok(None);
        }

        let latest: TiantianLatestResponse =
            serde_json::from_str(json).map_err(|err| MarketDataError::ProviderError {
                provider: "TIANTIAN_FUND".to_string(),
                message: format!("failed to parse Tiantian latest payload: {err}"),
            })?;

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
            serde_json::from_str(json).map_err(|err| MarketDataError::ProviderError {
                provider: "TIANTIAN_FUND".to_string(),
                message: format!("failed to parse Tiantian name payload: {err}"),
            })?;

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

    fn build_search_candidate(query: &str) -> Option<String> {
        Self::parse_fund_symbol(query)
            .ok()
            .map(|candidate| candidate.0)
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
            .await?;

        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError {
                provider: "TIANTIAN_FUND".to_string(),
                message: format!("Tiantian profile-js HTTP {}", response.status()),
            });
        }

        let body = response.text().await?;
        Ok(Self::parse_fund_name_from_profile_js(&body))
    }

    async fn get_fund_name(
        &self,
        normalized_symbol: &str,
        fund_code: &str,
    ) -> Result<Option<String>, MarketDataError> {
        let latest_result = async {
            let url = format!("{LATEST_URL_BASE}/{fund_code}.js");
            let response = self
                .client
                .get(url)
                .header("User-Agent", USER_AGENT)
                .header("Referer", REFERER)
                .send()
                .await?;

            if !response.status().is_success() {
                return Err(MarketDataError::ProviderError {
                    provider: "TIANTIAN_FUND".to_string(),
                    message: format!(
                        "Tiantian profile HTTP {} for {}",
                        response.status(),
                        normalized_symbol
                    ),
                });
            }

            let body = response.text().await?;
            let json = Self::parse_jsonp_payload(&body).ok_or(MarketDataError::ProviderError {
                provider: "TIANTIAN_FUND".to_string(),
                message: "failed to parse Tiantian latest JSONP payload".to_string(),
            })?;

            Self::parse_fund_name_fields(json, fund_code)
        }
        .await;

        match latest_result {
            Ok(Some(name)) => Ok(Some(name)),
            Ok(None) => self.get_fund_name_from_profile_js(fund_code).await,
            Err(err) => match self.get_fund_name_from_profile_js(fund_code).await {
                Ok(name) => Ok(name),
                Err(_) => Err(err),
            },
        }
    }

    fn build_search_result(normalized_symbol: String, name: String, score: f64) -> SearchResult {
        SearchResult::new(normalized_symbol, name, "FUND", "MUTUALFUND")
            .with_currency("CNY")
            .with_score(score)
            .with_data_source("TIANTIAN_FUND")
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

    fn quote_from_nav(
        timestamp: DateTime<Utc>,
        nav: Decimal,
        maybe_open: Option<Decimal>,
    ) -> Quote {
        let open = maybe_open.unwrap_or(nav);
        let high = max(open, nav);
        let low = min(open, nav);

        Quote::ohlcv(
            timestamp,
            open,
            high,
            low,
            nav,
            Decimal::ZERO,
            "CNY".to_string(),
            "TIANTIAN_FUND".to_string(),
        )
    }

    async fn get_latest_quote_from_history(
        &self,
        fund_code: &str,
    ) -> Result<Quote, MarketDataError> {
        let url = reqwest::Url::parse_with_params(
            HISTORY_URL,
            &[
                ("fundCode", fund_code),
                ("pageIndex", "1"),
                ("pageSize", "1"),
            ],
        )
        .map_err(|err| MarketDataError::ProviderError {
            provider: "TIANTIAN_FUND".to_string(),
            message: format!("failed to build Tiantian history URL: {err}"),
        })?;

        let response = self
            .client
            .get(url)
            .header("User-Agent", USER_AGENT)
            .header("Referer", REFERER)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError {
                provider: "TIANTIAN_FUND".to_string(),
                message: format!("Tiantian history fallback HTTP {}", response.status()),
            });
        }

        let payload: FundHistoryResponse = response.json().await?;
        if payload.err_code.unwrap_or(0) != 0 {
            return Err(MarketDataError::ProviderError {
                provider: "TIANTIAN_FUND".to_string(),
                message: payload
                    .err_msg
                    .unwrap_or_else(|| "unknown Tiantian history error".to_string()),
            });
        }

        let items = payload.data.map(|data| data.lsjz_list).unwrap_or_default();
        for item in items {
            let date = NaiveDate::parse_from_str(&item.date, "%Y-%m-%d").ok();
            let nav = Self::parse_decimal(&item.nav);
            if let (Some(date), Some(nav)) = (date, nav) {
                if let Some(naive) = date.and_hms_opt(0, 0, 0) {
                    return Ok(Self::quote_from_nav(
                        Utc.from_utc_datetime(&naive),
                        nav,
                        Some(nav),
                    ));
                }
            }
        }

        Err(MarketDataError::NoDataForRange)
    }
}

#[async_trait]
impl MarketDataProvider for TiantianFundProvider {
    fn id(&self) -> &'static str {
        "TIANTIAN_FUND"
    }

    fn priority(&self) -> u8 {
        9
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            instrument_kinds: &[InstrumentKind::Equity],
            coverage: Coverage::global_best_effort(),
            supports_latest: true,
            supports_historical: true,
            supports_search: true,
            supports_profile: true,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 60,
            max_concurrency: 1,
            min_delay: Duration::from_millis(200),
        }
    }

    async fn get_latest_quote(
        &self,
        _context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        let raw_symbol = Self::extract_symbol(&instrument)?;
        let (_normalized_symbol, fund_code) = Self::parse_fund_symbol(raw_symbol)?;
        let url = format!("{LATEST_URL_BASE}/{fund_code}.js");

        let latest_result = async {
            let response = self
                .client
                .get(url)
                .header("User-Agent", USER_AGENT)
                .header("Referer", REFERER)
                .send()
                .await?;

            if !response.status().is_success() {
                return Err(MarketDataError::ProviderError {
                    provider: self.id().to_string(),
                    message: format!("Tiantian latest quote HTTP {}", response.status()),
                });
            }

            let body = response.text().await?;
            let json = Self::parse_jsonp_payload(&body).ok_or(MarketDataError::ProviderError {
                provider: self.id().to_string(),
                message: "failed to parse Tiantian latest JSONP payload".to_string(),
            })?;
            let fields = Self::parse_latest_quote_fields(json, &fund_code)?;
            let Some((close, open, timestamp)) = fields else {
                return Err(MarketDataError::NoDataForRange);
            };

            Ok(Self::quote_from_nav(timestamp, close, open))
        }
        .await;

        match latest_result {
            Ok(quote) => Ok(quote),
            Err(_) => self.get_latest_quote_from_history(&fund_code).await,
        }
    }

    async fn get_historical_quotes(
        &self,
        _context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        if start >= end {
            return Ok(vec![]);
        }

        let raw_symbol = Self::extract_symbol(&instrument)?;
        let (_normalized_symbol, fund_code) = Self::parse_fund_symbol(raw_symbol)?;
        let start_date = start.format("%Y-%m-%d").to_string();
        let end_date = end.format("%Y-%m-%d").to_string();
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
            .map_err(|err| MarketDataError::ProviderError {
                provider: self.id().to_string(),
                message: format!("failed to build Tiantian history URL: {err}"),
            })?;

            let response = self
                .client
                .get(url)
                .header("User-Agent", USER_AGENT)
                .header("Referer", REFERER)
                .send()
                .await?;

            if !response.status().is_success() {
                return Err(MarketDataError::ProviderError {
                    provider: self.id().to_string(),
                    message: format!("Tiantian history HTTP {}", response.status()),
                });
            }

            let payload: FundHistoryResponse = response.json().await?;
            if payload.err_code.unwrap_or(0) != 0 {
                return Err(MarketDataError::ProviderError {
                    provider: self.id().to_string(),
                    message: payload
                        .err_msg
                        .unwrap_or_else(|| "unknown Tiantian history error".to_string()),
                });
            }

            let items = payload.data.map(|data| data.lsjz_list).unwrap_or_default();
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
                if let Some(naive) = date.and_hms_opt(0, 0, 0) {
                    quotes.push(Self::quote_from_nav(
                        Utc.from_utc_datetime(&naive),
                        nav,
                        Some(nav),
                    ));
                }
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
            return Err(MarketDataError::NoDataForRange);
        }

        quotes.sort_by_key(|quote| quote.timestamp);
        Ok(quotes)
    }

    async fn search(&self, query: &str) -> Result<Vec<SearchResult>, MarketDataError> {
        let Some(normalized_symbol) = Self::build_search_candidate(query) else {
            return Ok(vec![]);
        };

        let (_, fund_code) = Self::parse_fund_symbol(&normalized_symbol)?;
        let name = self.get_fund_name(&normalized_symbol, &fund_code).await?;
        let Some(name) = name else {
            return Ok(vec![]);
        };

        let score = if normalized_symbol.eq_ignore_ascii_case(query.trim()) {
            12000.0
        } else {
            11000.0
        };

        Ok(vec![Self::build_search_result(
            normalized_symbol,
            name,
            score,
        )])
    }

    async fn get_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let (normalized_symbol, fund_code) = Self::parse_fund_symbol(symbol)?;
        let name = self.get_fund_name(&normalized_symbol, &fund_code).await?;

        Ok(AssetProfile {
            source: Some(self.id().to_string()),
            name,
            quote_type: Some("MUTUALFUND".to_string()),
            ..Default::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::TiantianFundProvider;
    use rust_decimal::Decimal;

    #[test]
    fn parses_supported_fund_symbols() {
        let with_suffix = TiantianFundProvider::parse_fund_symbol("161039.FUND").unwrap();
        assert_eq!(with_suffix.0, "161039.FUND");
        assert_eq!(with_suffix.1, "161039");

        let bare = TiantianFundProvider::parse_fund_symbol("161039").unwrap();
        assert_eq!(bare.0, "161039.FUND");
        assert_eq!(bare.1, "161039");
    }

    #[test]
    fn rejects_unsupported_fund_symbols() {
        assert!(TiantianFundProvider::parse_fund_symbol("600519.SH").is_err());
        assert!(TiantianFundProvider::parse_fund_symbol("AAPL").is_err());
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
    fn treats_bare_six_digit_code_as_searchable_fund_candidate() {
        let candidate = TiantianFundProvider::build_search_candidate("161039");

        assert_eq!(candidate.as_deref(), Some("161039.FUND"));
    }

    #[test]
    fn rejects_non_fund_style_search_candidates() {
        let candidate = TiantianFundProvider::build_search_candidate("600519.SH");

        assert!(candidate.is_none());
    }
}
