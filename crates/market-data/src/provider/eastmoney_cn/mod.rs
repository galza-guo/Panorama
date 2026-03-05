//! EastMoney provider for mainland China equities and ETFs.

use std::str::FromStr;
use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use reqwest::Client;
use rust_decimal::Decimal;
use serde::Deserialize;

use crate::errors::MarketDataError;
use crate::models::{
    AssetProfile, Coverage, InstrumentId, InstrumentKind, ProviderInstrument, Quote, QuoteContext,
    SearchResult,
};
use crate::provider::{MarketDataProvider, ProviderCapabilities, RateLimit};
use crate::resolver::mic_to_exchange_name;

const LATEST_URL: &str = "https://push2.eastmoney.com/api/qt/stock/get";
const HISTORY_URL: &str = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const REFERER: &str = "https://quote.eastmoney.com/";

#[derive(Debug, Deserialize)]
struct EastMoneyLatestResponse {
    data: Option<EastMoneyLatestData>,
}

#[derive(Debug, Deserialize)]
struct EastMoneyLatestData {
    #[serde(rename = "f58")]
    name: Option<String>,
    #[serde(rename = "f43")]
    last_price: Option<f64>,
    #[serde(rename = "f44")]
    high: Option<f64>,
    #[serde(rename = "f45")]
    low: Option<f64>,
    #[serde(rename = "f46")]
    open: Option<f64>,
    #[serde(rename = "f47")]
    volume: Option<f64>,
    #[serde(rename = "f86")]
    quote_timestamp: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct EastMoneyHistoryResponse {
    data: Option<EastMoneyHistoryData>,
}

#[derive(Debug, Deserialize)]
struct EastMoneyHistoryData {
    #[serde(default)]
    name: String,
    #[serde(default)]
    klines: Vec<String>,
}

pub struct EastmoneyCnProvider {
    client: Client,
}

impl EastmoneyCnProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    fn extract_symbol(instrument: &ProviderInstrument) -> Result<&str, MarketDataError> {
        match instrument {
            ProviderInstrument::EquitySymbol { symbol } => Ok(symbol.as_ref()),
            _ => Err(MarketDataError::UnsupportedAssetType(
                "EASTMONEY_CN only supports equity instruments".to_string(),
            )),
        }
    }

    fn parse_cn_symbol(
        raw_symbol: &str,
        exchange_mic: Option<&str>,
    ) -> Result<(String, String), MarketDataError> {
        let normalized = raw_symbol.trim().to_uppercase();
        if normalized.is_empty() {
            return Err(MarketDataError::ProviderError {
                provider: "EASTMONEY_CN".to_string(),
                message: "symbol cannot be empty".to_string(),
            });
        }

        let (code, mic) = if let Some((code, suffix)) = normalized.split_once('.') {
            let mic = match suffix {
                "SH" | "SS" => Some("XSHG"),
                "SZ" => Some("XSHE"),
                _ => exchange_mic,
            };
            (code.to_string(), mic)
        } else {
            (normalized.clone(), exchange_mic)
        };

        if code.len() != 6 || !code.chars().all(|ch| ch.is_ascii_digit()) {
            return Err(MarketDataError::ProviderError {
                provider: "EASTMONEY_CN".to_string(),
                message: format!("unsupported symbol '{}'", raw_symbol),
            });
        }

        let (market_suffix, secid_prefix) = match mic {
            Some("XSHG") => ("SH", "1"),
            Some("XSHE") => ("SZ", "0"),
            _ => {
                return Err(MarketDataError::ProviderError {
                    provider: "EASTMONEY_CN".to_string(),
                    message: format!(
                        "missing mainland exchange MIC for symbol '{}' (expected XSHG or XSHE)",
                        raw_symbol
                    ),
                })
            }
        };

        Ok((
            format!("{code}.{market_suffix}"),
            format!("{secid_prefix}.{code}"),
        ))
    }

    fn context_exchange_mic(context: &QuoteContext) -> Option<&str> {
        match &context.instrument {
            InstrumentId::Equity { mic, .. } => mic.as_deref(),
            _ => None,
        }
    }

    fn infer_search_exchange_mic(code: &str) -> Option<&'static str> {
        if code.len() != 6 || !code.chars().all(|ch| ch.is_ascii_digit()) {
            return None;
        }

        match code.chars().next() {
            Some('5') | Some('6') => Some("XSHG"),
            Some('0') | Some('2') | Some('3') => Some("XSHE"),
            _ => None,
        }
    }

    fn build_search_candidates(query: &str) -> Vec<(String, &'static str)> {
        let normalized = query.trim().to_uppercase();
        if normalized.is_empty() {
            return vec![];
        }

        if let Some((_, suffix)) = normalized.split_once('.') {
            let exchange_mic = match suffix {
                "SH" | "SS" => Some("XSHG"),
                "SZ" => Some("XSHE"),
                _ => None,
            };

            return exchange_mic
                .and_then(|mic| {
                    Self::parse_cn_symbol(&normalized, Some(mic))
                        .ok()
                        .map(|v| (v.0, mic))
                })
                .into_iter()
                .collect();
        }

        Self::infer_search_exchange_mic(&normalized)
            .and_then(|mic| {
                Self::parse_cn_symbol(&normalized, Some(mic))
                    .ok()
                    .map(|v| (v.0, mic))
            })
            .into_iter()
            .collect()
    }

    fn infer_quote_type(normalized_symbol: &str) -> &'static str {
        let code = normalized_symbol
            .split_once('.')
            .map(|(code, _)| code)
            .unwrap_or(normalized_symbol);

        if code.starts_with('5') || code.starts_with("15") || code.starts_with("16") {
            "ETF"
        } else {
            "EQUITY"
        }
    }

    async fn get_symbol_name(
        &self,
        normalized_symbol: &str,
        secid: &str,
    ) -> Result<Option<String>, MarketDataError> {
        let latest_url =
            reqwest::Url::parse_with_params(LATEST_URL, &[("secid", secid), ("fields", "f58")])
                .map_err(|err| MarketDataError::ProviderError {
                    provider: self.id().to_string(),
                    message: format!("failed to build EastMoney profile URL: {err}"),
                })?;

        let latest_name = async {
            let response = self
                .client
                .get(latest_url)
                .header("User-Agent", USER_AGENT)
                .header("Referer", REFERER)
                .send()
                .await?;

            if !response.status().is_success() {
                return Err(MarketDataError::ProviderError {
                    provider: self.id().to_string(),
                    message: format!(
                        "EastMoney profile HTTP {} for {}",
                        response.status(),
                        normalized_symbol
                    ),
                });
            }

            let payload: EastMoneyLatestResponse = response.json().await?;
            Ok(payload
                .data
                .and_then(|data| data.name)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()))
        }
        .await;

        match latest_name {
            Ok(Some(name)) => Ok(Some(name)),
            Ok(None) => {
                let end_date = Utc::now().format("%Y%m%d").to_string();
                let start_date = (Utc::now() - chrono::Duration::days(30))
                    .format("%Y%m%d")
                    .to_string();
                let url = reqwest::Url::parse_with_params(
                    HISTORY_URL,
                    &[
                        ("secid", secid),
                        ("klt", "101"),
                        ("fqt", "1"),
                        ("beg", start_date.as_str()),
                        ("end", end_date.as_str()),
                        ("fields1", "f1,f2,f3,f4,f5,f6"),
                        ("fields2", "f51,f52,f53,f54,f55,f56"),
                    ],
                )
                .map_err(|err| MarketDataError::ProviderError {
                    provider: self.id().to_string(),
                    message: format!("failed to build EastMoney profile history URL: {err}"),
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
                        message: format!(
                            "EastMoney profile history HTTP {} for {}",
                            response.status(),
                            normalized_symbol
                        ),
                    });
                }

                let payload: EastMoneyHistoryResponse = response.json().await?;
                Ok(payload
                    .data
                    .map(|data| data.name.trim().to_string())
                    .filter(|value| !value.is_empty()))
            }
            Err(err) => Err(err),
        }
    }

    fn build_search_result(
        normalized_symbol: String,
        exchange_mic: &'static str,
        name: String,
        score: f64,
    ) -> SearchResult {
        let exchange_name = mic_to_exchange_name(exchange_mic).unwrap_or(exchange_mic);
        let quote_type = Self::infer_quote_type(&normalized_symbol).to_string();

        SearchResult::new(normalized_symbol, name, exchange_name, quote_type)
            .with_exchange_mic(exchange_mic)
            .with_exchange_name(exchange_name)
            .with_currency("CNY")
            .with_score(score)
            .with_data_source("EASTMONEY_CN")
    }

    fn to_price(raw: Option<f64>) -> Decimal {
        Decimal::from_f64_retain(raw.unwrap_or_default() / 100.0).unwrap_or_default()
    }

    fn to_volume(raw: Option<f64>) -> Decimal {
        Decimal::from_f64_retain(raw.unwrap_or_default()).unwrap_or_default()
    }

    fn parse_timestamp(epoch: Option<i64>) -> DateTime<Utc> {
        match epoch {
            Some(ts) if ts > 1_000_000_000_000 => Utc
                .timestamp_millis_opt(ts)
                .single()
                .unwrap_or_else(Utc::now),
            Some(ts) if ts > 0 => Utc.timestamp_opt(ts, 0).single().unwrap_or_else(Utc::now),
            _ => Utc::now(),
        }
    }

    fn parse_history_line(line: &str) -> Option<Quote> {
        let fields: Vec<&str> = line.split(',').collect();
        if fields.len() < 6 {
            return None;
        }

        let date = NaiveDate::parse_from_str(fields[0], "%Y-%m-%d").ok()?;
        let timestamp = Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0)?);
        let open = Decimal::from_str(fields[1]).ok()?;
        let close = Decimal::from_str(fields[2]).ok()?;
        let high = Decimal::from_str(fields[3]).ok()?;
        let low = Decimal::from_str(fields[4]).ok()?;
        let volume = Decimal::from_str(fields[5]).unwrap_or_default();

        Some(Quote::ohlcv(
            timestamp,
            open,
            high,
            low,
            close,
            volume,
            "CNY".to_string(),
            "EASTMONEY_CN".to_string(),
        ))
    }
}

#[async_trait]
impl MarketDataProvider for EastmoneyCnProvider {
    fn id(&self) -> &'static str {
        "EASTMONEY_CN"
    }

    fn priority(&self) -> u8 {
        2
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            instrument_kinds: &[InstrumentKind::Equity],
            coverage: Coverage {
                equity_mic_allow: Some(&["XSHG", "XSHE"]),
                equity_mic_deny: None,
                allow_unknown_mic: false,
                metal_quote_ccy_allow: None,
            },
            supports_latest: true,
            supports_historical: true,
            supports_search: true,
            supports_profile: true,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 120,
            max_concurrency: 2,
            min_delay: Duration::from_millis(250),
        }
    }

    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<Quote, MarketDataError> {
        let raw_symbol = Self::extract_symbol(&instrument)?;
        let (normalized_symbol, secid) =
            Self::parse_cn_symbol(raw_symbol, Self::context_exchange_mic(context))?;
        let url = reqwest::Url::parse_with_params(
            LATEST_URL,
            &[
                ("secid", secid.as_str()),
                ("fields", "f43,f44,f45,f46,f47,f86"),
            ],
        )
        .map_err(|err| MarketDataError::ProviderError {
            provider: self.id().to_string(),
            message: format!("failed to build EastMoney latest URL: {err}"),
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
                message: format!(
                    "EastMoney latest quote HTTP {} for {}",
                    response.status(),
                    normalized_symbol
                ),
            });
        }

        let payload: EastMoneyLatestResponse = response.json().await?;
        let data = payload.data.ok_or(MarketDataError::NoDataForRange)?;
        let close = Self::to_price(data.last_price);
        if close <= Decimal::ZERO {
            return Err(MarketDataError::NoDataForRange);
        }

        let timestamp = Self::parse_timestamp(data.quote_timestamp);
        Ok(Quote::ohlcv(
            timestamp,
            Self::to_price(data.open).max(close),
            Self::to_price(data.high).max(close),
            {
                let low = Self::to_price(data.low);
                if low.is_zero() {
                    close
                } else {
                    low
                }
            },
            close,
            Self::to_volume(data.volume),
            "CNY".to_string(),
            self.id().to_string(),
        ))
    }

    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Quote>, MarketDataError> {
        if start >= end {
            return Ok(vec![]);
        }

        let raw_symbol = Self::extract_symbol(&instrument)?;
        let (normalized_symbol, secid) =
            Self::parse_cn_symbol(raw_symbol, Self::context_exchange_mic(context))?;
        let start_date = start.format("%Y%m%d").to_string();
        let end_date = end.format("%Y%m%d").to_string();
        let url = reqwest::Url::parse_with_params(
            HISTORY_URL,
            &[
                ("secid", secid.as_str()),
                ("klt", "101"),
                ("fqt", "1"),
                ("beg", start_date.as_str()),
                ("end", end_date.as_str()),
                ("fields1", "f1,f2,f3,f4,f5,f6"),
                ("fields2", "f51,f52,f53,f54,f55,f56"),
            ],
        )
        .map_err(|err| MarketDataError::ProviderError {
            provider: self.id().to_string(),
            message: format!("failed to build EastMoney history URL: {err}"),
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
                message: format!(
                    "EastMoney history HTTP {} for {}",
                    response.status(),
                    normalized_symbol
                ),
            });
        }

        let payload: EastMoneyHistoryResponse = response.json().await?;
        let mut quotes = payload
            .data
            .ok_or(MarketDataError::NoDataForRange)?
            .klines
            .iter()
            .filter_map(|line| Self::parse_history_line(line))
            .collect::<Vec<_>>();

        if quotes.is_empty() {
            return Err(MarketDataError::NoDataForRange);
        }

        quotes.sort_by_key(|quote| quote.timestamp);
        Ok(quotes)
    }

    async fn search(&self, query: &str) -> Result<Vec<SearchResult>, MarketDataError> {
        let mut results = Vec::new();
        let mut last_error = None;

        for (normalized_symbol, exchange_mic) in Self::build_search_candidates(query) {
            let (_, secid) = Self::parse_cn_symbol(&normalized_symbol, Some(exchange_mic))?;
            match self.get_symbol_name(&normalized_symbol, &secid).await {
                Ok(Some(name)) => {
                    let score = if normalized_symbol.eq_ignore_ascii_case(query.trim()) {
                        12000.0
                    } else {
                        11000.0
                    };
                    results.push(Self::build_search_result(
                        normalized_symbol,
                        exchange_mic,
                        name,
                        score,
                    ));
                }
                Ok(None) => {}
                Err(err) => last_error = Some(err),
            }
        }

        if results.is_empty() {
            if let Some(err) = last_error {
                return Err(err);
            }
        }

        Ok(results)
    }

    async fn get_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let exchange_mic = if let Some((_, suffix)) = symbol.trim().to_uppercase().split_once('.') {
            match suffix {
                "SH" | "SS" => Some("XSHG"),
                "SZ" => Some("XSHE"),
                _ => None,
            }
        } else {
            Self::infer_search_exchange_mic(symbol.trim())
        };

        let (normalized_symbol, secid) = Self::parse_cn_symbol(symbol, exchange_mic)?;
        let name = self.get_symbol_name(&normalized_symbol, &secid).await?;

        Ok(AssetProfile {
            source: Some(self.id().to_string()),
            name,
            quote_type: Some(Self::infer_quote_type(&normalized_symbol).to_string()),
            ..Default::default()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::EastmoneyCnProvider;

    #[test]
    fn parses_symbols_from_suffix() {
        let parsed = EastmoneyCnProvider::parse_cn_symbol("600519.SH", None).unwrap();
        assert_eq!(parsed.0, "600519.SH");
        assert_eq!(parsed.1, "1.600519");
    }

    #[test]
    fn parses_symbols_from_exchange_mic() {
        let parsed = EastmoneyCnProvider::parse_cn_symbol("000001", Some("XSHE")).unwrap();
        assert_eq!(parsed.0, "000001.SZ");
        assert_eq!(parsed.1, "0.000001");
    }

    #[test]
    fn rejects_non_mainland_symbols() {
        assert!(EastmoneyCnProvider::parse_cn_symbol("AAPL", Some("XNAS")).is_err());
        assert!(EastmoneyCnProvider::parse_cn_symbol("0700.HK", None).is_err());
    }

    #[test]
    fn builds_exact_search_candidate_for_unambiguous_bare_code() {
        let candidate = EastmoneyCnProvider::build_search_candidates("600519");

        assert_eq!(candidate, vec![("600519.SH".to_string(), "XSHG")]);
    }

    #[test]
    fn skips_ambiguous_bare_codes_in_search_candidates() {
        let candidate = EastmoneyCnProvider::build_search_candidates("161039");

        assert!(candidate.is_empty());
    }
}
