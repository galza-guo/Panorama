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
use std::str::FromStr;
use std::time::Duration;
use std::time::SystemTime;

const LATEST_URL: &str = "https://push2.eastmoney.com/api/qt/stock/get";
const HISTORY_URL: &str = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const REFERER: &str = "https://quote.eastmoney.com/";
const BULK_BATCH_SIZE: usize = 5;

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

pub struct EastMoneyCnProvider {
    client: Client,
}

impl EastMoneyCnProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    fn parse_cn_symbol(symbol: &str) -> Option<(String, String)> {
        let normalized = symbol.trim().to_uppercase();
        let (code, market) = normalized.split_once('.')?;
        let code = code.to_string();
        if code.len() != 6 || !code.chars().all(|ch| ch.is_ascii_digit()) {
            return None;
        }

        let market_id = match market {
            "SH" => "1",
            "SZ" => "0",
            _ => return None,
        };

        Some((normalized, format!("{market_id}.{code}")))
    }

    fn fallback_currency(fallback_currency: String) -> String {
        if fallback_currency.trim().is_empty() {
            "CNY".to_string()
        } else {
            fallback_currency
        }
    }

    fn infer_asset_sub_class(symbol: &str) -> &'static str {
        let Some((code, _)) = symbol.split_once('.') else {
            return "Stock";
        };

        if code.starts_with('5') || code.starts_with("15") || code.starts_with("16") {
            "ETF"
        } else {
            "Stock"
        }
    }

    fn to_price(raw: Option<f64>) -> Decimal {
        Decimal::from_f64_retain(raw.unwrap_or_default() / 100.0).unwrap_or_default()
    }

    fn to_volume(raw: Option<f64>) -> Decimal {
        Decimal::from_f64_retain(raw.unwrap_or_default()).unwrap_or_default()
    }

    fn parse_timestamp(epoch: Option<i64>) -> DateTime<Utc> {
        match epoch {
            Some(ts) if ts > 0 => {
                // EastMoney timestamps may be seconds or milliseconds.
                if ts > 1_000_000_000_000 {
                    Utc.timestamp_millis_opt(ts)
                        .single()
                        .unwrap_or_else(Utc::now)
                } else {
                    Utc.timestamp_opt(ts, 0).single().unwrap_or_else(Utc::now)
                }
            }
            _ => Utc::now(),
        }
    }

    fn parse_history_line(line: &str, symbol: &str, fallback_currency: &str) -> Option<ModelQuote> {
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

        Some(ModelQuote {
            id: format!("{}_{}", timestamp.format("%Y%m%d"), symbol),
            created_at: Utc::now(),
            data_source: DataSource::EastMoneyCn,
            timestamp,
            symbol: symbol.to_string(),
            open,
            high,
            low,
            close,
            adjclose: close,
            volume,
            currency: fallback_currency.to_string(),
        })
    }

    async fn get_name_from_history(
        &self,
        normalized_symbol: &str,
        secid: &str,
    ) -> Result<Option<String>, MarketDataError> {
        let end = SystemTime::now();
        let start = end
            .checked_sub(Duration::from_secs(60 * 60 * 24 * 30))
            .unwrap_or(end);
        let start_date = DateTime::<Utc>::from(start).format("%Y%m%d").to_string();
        let end_date = DateTime::<Utc>::from(end).format("%Y%m%d").to_string();

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
                "EASTMONEY_CN profile history HTTP {} for symbol {}",
                response.status(),
                normalized_symbol
            )));
        }

        let payload: EastMoneyHistoryResponse = response
            .json()
            .await
            .map_err(MarketDataError::NetworkError)?;

        let name = payload
            .data
            .map(|d| d.name.trim().to_string())
            .filter(|v| !v.is_empty());
        Ok(name)
    }
}

#[async_trait]
impl MarketDataProvider for EastMoneyCnProvider {
    fn name(&self) -> &'static str {
        "EASTMONEY_CN"
    }

    fn priority(&self) -> u8 {
        2
    }

    async fn get_latest_quote(
        &self,
        symbol: &str,
        fallback_currency: String,
    ) -> Result<ModelQuote, MarketDataError> {
        let (normalized_symbol, secid) = Self::parse_cn_symbol(symbol).ok_or_else(|| {
            MarketDataError::ProviderError(format!(
                "EASTMONEY_CN only supports 6-digit .SH/.SZ symbols, got: {symbol}"
            ))
        })?;

        let fallback_currency = Self::fallback_currency(fallback_currency);
        let url = reqwest::Url::parse_with_params(
            LATEST_URL,
            &[
                ("secid", secid.as_str()),
                ("fields", "f58,f43,f44,f45,f46,f47,f86"),
            ],
        )
        .map_err(|e| MarketDataError::ProviderError(format!("Failed to build URL: {e}")))?;

        let latest_from_quote_api = async {
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
                    "EASTMONEY_CN latest quote HTTP {} for symbol {}",
                    response.status(),
                    normalized_symbol
                )));
            }

            let payload: EastMoneyLatestResponse = response
                .json()
                .await
                .map_err(MarketDataError::NetworkError)?;
            let data = payload.data.ok_or(MarketDataError::NoData)?;
            let quote_timestamp = Self::parse_timestamp(data.quote_timestamp);
            let close = Self::to_price(data.last_price);

            if close <= Decimal::ZERO {
                return Err(MarketDataError::NoData);
            }

            Ok(ModelQuote {
                id: format!("{}_{}", quote_timestamp.format("%Y%m%d"), normalized_symbol),
                created_at: Utc::now(),
                data_source: DataSource::EastMoneyCn,
                timestamp: quote_timestamp,
                symbol: normalized_symbol.clone(),
                open: Self::to_price(data.open),
                high: Self::to_price(data.high),
                low: Self::to_price(data.low),
                close,
                adjclose: close,
                volume: Self::to_volume(data.volume),
                currency: fallback_currency.clone(),
            })
        };

        match latest_from_quote_api.await {
            Ok(quote) => Ok(quote),
            Err(primary_error) => {
                log::warn!(
                    "EASTMONEY_CN quote endpoint failed for {} ({}). Falling back to kline endpoint.",
                    normalized_symbol,
                    primary_error
                );

                let end = SystemTime::now();
                let start = end
                    .checked_sub(Duration::from_secs(60 * 60 * 24 * 30))
                    .unwrap_or(end);
                let history = self
                    .get_historical_quotes(&normalized_symbol, start, end, fallback_currency)
                    .await?;

                history.last().cloned().ok_or(primary_error)
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
        let (normalized_symbol, secid) = Self::parse_cn_symbol(symbol).ok_or_else(|| {
            MarketDataError::ProviderError(format!(
                "EASTMONEY_CN only supports 6-digit .SH/.SZ symbols, got: {symbol}"
            ))
        })?;

        if start >= end {
            return Ok(Vec::new());
        }

        let fallback_currency = Self::fallback_currency(fallback_currency);
        let start_date = DateTime::<Utc>::from(start).format("%Y%m%d").to_string();
        let end_date = DateTime::<Utc>::from(end).format("%Y%m%d").to_string();

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
                "EASTMONEY_CN historical quote HTTP {} for symbol {}",
                response.status(),
                normalized_symbol
            )));
        }

        let payload: EastMoneyHistoryResponse = response
            .json()
            .await
            .map_err(MarketDataError::NetworkError)?;
        let mut quotes = payload
            .data
            .ok_or(MarketDataError::NoData)?
            .klines
            .iter()
            .filter_map(|line| {
                Self::parse_history_line(line, &normalized_symbol, &fallback_currency)
            })
            .collect::<Vec<_>>();

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
            if Self::parse_cn_symbol(symbol).is_some() {
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
                        .map_err(|e| (symbol_clone, currency_clone, e))
                }
            });

            for result in join_all(futures).await {
                match result {
                    Ok(quotes) => all_quotes.extend(quotes),
                    Err((symbol, _currency, MarketDataError::NoData)) => {
                        log::debug!(
                            "EASTMONEY_CN has no new history in requested window for symbol {}",
                            symbol
                        );
                    }
                    Err((symbol, currency, error)) => {
                        log::warn!(
                            "EASTMONEY_CN failed to fetch history for symbol {}: {}",
                            symbol,
                            error
                        );
                        failed_symbols.push((symbol, currency));
                    }
                }
            }

            if chunk.len() == BULK_BATCH_SIZE {
                tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
            }
        }

        Ok((all_quotes, failed_symbols))
    }
}

#[async_trait]
impl AssetProfiler for EastMoneyCnProvider {
    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile, MarketDataError> {
        let (normalized_symbol, secid) = Self::parse_cn_symbol(symbol).ok_or_else(|| {
            MarketDataError::ProviderError(format!(
                "EASTMONEY_CN only supports 6-digit .SH/.SZ symbols, got: {symbol}"
            ))
        })?;

        let latest_url = reqwest::Url::parse_with_params(
            LATEST_URL,
            &[("secid", secid.as_str()), ("fields", "f58")],
        )
        .map_err(|e| MarketDataError::ProviderError(format!("Failed to build URL: {e}")))?;

        let latest_name = async {
            let response = self
                .client
                .get(latest_url)
                .header("User-Agent", USER_AGENT)
                .header("Referer", REFERER)
                .send()
                .await
                .map_err(MarketDataError::NetworkError)?;

            if !response.status().is_success() {
                return Err(MarketDataError::ProviderError(format!(
                    "EASTMONEY_CN profile HTTP {} for symbol {}",
                    response.status(),
                    normalized_symbol
                )));
            }

            let payload: EastMoneyLatestResponse = response
                .json()
                .await
                .map_err(MarketDataError::NetworkError)?;

            Ok(payload
                .data
                .and_then(|d| d.name)
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()))
        }
        .await;

        let name = match latest_name {
            Ok(Some(v)) => Some(v),
            Ok(None) => self.get_name_from_history(&normalized_symbol, &secid).await?,
            Err(err) => {
                log::debug!(
                    "EASTMONEY_CN latest profile name lookup failed for {}: {}",
                    normalized_symbol,
                    err
                );
                self.get_name_from_history(&normalized_symbol, &secid).await?
            }
        };
        let asset_sub_class = Self::infer_asset_sub_class(&normalized_symbol).to_string();

        Ok(AssetProfile {
            id: Some(normalized_symbol.clone()),
            name,
            asset_type: Some("EQUITY".to_string()),
            symbol: normalized_symbol.clone(),
            symbol_mapping: Some(normalized_symbol),
            asset_class: Some("Equity".to_string()),
            asset_sub_class: Some(asset_sub_class),
            currency: "CNY".to_string(),
            data_source: DataSource::EastMoneyCn.as_str().to_string(),
            ..Default::default()
        })
    }

    async fn search_ticker(&self, _query: &str) -> Result<Vec<QuoteSummary>, MarketDataError> {
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::EastMoneyCnProvider;

    #[test]
    fn parses_supported_symbols() {
        let parsed = EastMoneyCnProvider::parse_cn_symbol("600519.SH");
        assert!(parsed.is_some());
        assert_eq!(parsed.unwrap().1, "1.600519");

        let parsed_sz = EastMoneyCnProvider::parse_cn_symbol("000001.sz");
        assert!(parsed_sz.is_some());
        assert_eq!(parsed_sz.unwrap().1, "0.000001");
    }

    #[test]
    fn rejects_unsupported_symbols() {
        assert!(EastMoneyCnProvider::parse_cn_symbol("AAPL.US").is_none());
        assert!(EastMoneyCnProvider::parse_cn_symbol("700.HK").is_none());
        assert!(EastMoneyCnProvider::parse_cn_symbol("161039.FUND").is_none());
    }
}
