use async_trait::async_trait;
use calamine::{open_workbook_auto_from_rs, Data, Reader};
use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use lazy_static::lazy_static;
use log::{debug, error};
use num_traits::ToPrimitive;
use regex::Regex;
use rust_decimal::Decimal;
use serde_json::{Map as JsonMap, Number as JsonNumber, Value as JsonValue};
use std::collections::btree_map::Entry as BTreeEntry;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Cursor;
use std::str::FromStr;
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::RwLock;

use super::market_data_constants::*;
use super::market_data_model::{
    ImportValidationStatus, LatestQuotePair, MarketDataProviderInfo, MarketDataProviderSetting,
    Quote, QuoteImport, QuoteRequest, QuoteSummary, UpdateMarketDataProviderSetting,
};
use super::market_data_traits::{MarketDataRepositoryTrait, MarketDataServiceTrait};
use super::providers::models::AssetProfile;
use crate::assets::assets_constants::CASH_ASSET_TYPE;
use crate::assets::assets_traits::AssetRepositoryTrait;
use crate::assets::{Asset, UpdateAssetProfile};
use crate::errors::{Error, Result, ValidationError};
use crate::fx::open_exchange_rates_client;
use crate::market_data::providers::ProviderRegistry;
use crate::market_data::symbol_normalizer::infer_panorama_data_source;
use crate::secrets::SecretStore;
use crate::utils::time_utils;

const QUOTE_LOOKBACK_DAYS: i64 = 7;
const MPFA_MONTHLY_UNIT_PRICE_PAGE_URL: &str = "https://www.mpfa.org.hk/en/info-centre/fund-information/monthly-fund-price/monthly-unit-prices-of-mpf-constituent-funds";
const MPFA_BASE_URL: &str = "https://www.mpfa.org.hk";
const MPFA_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

lazy_static! {
    static ref MPFA_UNIT_PRICE_LINK_REGEX: Regex = Regex::new(
        r#"(?i)href=['"](?P<path>/en/-/media/files/information-centre/fund-information/monthly-fund-price/consolidated_list_for_[^'"]+?\.xls)['"]"#
    )
    .expect("valid MPFA unit price link regex");
    static ref MPFA_DMY_DATE_REGEX: Regex =
        Regex::new(r"(?i)(\d{1,2})[./-](\d{1,2})[./-](\d{4})").expect("valid DMY date regex");
    static ref MPFA_YMD_ZH_DATE_REGEX: Regex =
        Regex::new(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日").expect("valid zh date regex");
}

#[derive(Debug)]
struct SymbolSyncPlanItem {
    symbol: String,
    currency: String,
    start: SystemTime,
}

#[derive(Debug, Default)]
struct MpfUnitPriceSnapshot {
    valuation_date: Option<NaiveDate>,
    unit_prices_by_normalized_name: HashMap<String, Decimal>,
}

pub struct MarketDataService {
    provider_registry: Arc<RwLock<ProviderRegistry>>,
    repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
    asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>,
    secret_store: Arc<dyn SecretStore>,
}

#[async_trait]
impl MarketDataServiceTrait for MarketDataService {
    async fn search_symbol(&self, query: &str) -> Result<Vec<QuoteSummary>> {
        self.provider_registry
            .read()
            .await
            .search_ticker(query)
            .await
            .map_err(|e| e.into())
    }

    fn get_latest_quote_for_symbol(&self, symbol: &str) -> Result<Quote> {
        self.repository.get_latest_quote_for_symbol(symbol)
    }

    fn get_latest_quotes_for_symbols(&self, symbols: &[String]) -> Result<HashMap<String, Quote>> {
        self.repository.get_latest_quotes_for_symbols(symbols)
    }

    fn get_latest_quotes_pair_for_symbols(
        &self,
        symbols: &[String],
    ) -> Result<HashMap<String, LatestQuotePair>> {
        self.repository.get_latest_quotes_pair_for_symbols(symbols)
    }

    fn get_all_historical_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>> {
        let quotes = self.repository.get_all_historical_quotes()?;
        let mut quotes_map: HashMap<String, Vec<(NaiveDate, Quote)>> = HashMap::new();

        for quote in quotes {
            let quote_date = quote.timestamp.date_naive();
            quotes_map
                .entry(quote.symbol.clone())
                .or_default()
                .push((quote_date, quote));
        }

        for (_symbol, symbol_quotes_tuples) in quotes_map.iter_mut() {
            symbol_quotes_tuples.sort_by(|a, b| b.0.cmp(&a.0));
        }

        Ok(quotes_map)
    }

    async fn get_asset_profile(&self, symbol: &str) -> Result<AssetProfile> {
        self.provider_registry
            .read()
            .await
            .get_asset_profile(symbol)
            .await
            .map_err(|e| e.into())
    }

    fn get_historical_quotes_for_symbol(&self, symbol: &str) -> Result<Vec<Quote>> {
        let mut quotes = self.repository.get_historical_quotes_for_symbol(symbol)?;
        quotes.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
        Ok(quotes)
    }

    async fn add_quote(&self, quote: &Quote) -> Result<Quote> {
        self.repository.save_quote(quote).await
    }

    async fn update_quote(&self, quote: Quote) -> Result<Quote> {
        self.repository.save_quote(&quote).await
    }

    async fn delete_quote(&self, quote_id: &str) -> Result<()> {
        self.repository.delete_quote(quote_id).await
    }

    async fn get_historical_quotes_from_provider(
        &self,
        symbol: &str,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>> {
        debug!(
            "Getting symbol history for {} from {} to {}",
            symbol, start_date, end_date
        );
        let start_time: SystemTime = Utc
            .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap())
            .into();
        let end_time: SystemTime = Utc
            .from_utc_datetime(&end_date.and_hms_opt(23, 59, 59).unwrap())
            .into();

        self.provider_registry
            .read()
            .await
            .historical_quotes(symbol, start_time, end_time, "USD".to_string())
            .await
            .map_err(|e| e.into())
    }

    async fn sync_market_data(&self) -> Result<((), Vec<(String, String)>)> {
        debug!("Syncing market data.");
        let assets = self.asset_repository.list()?;
        let quote_requests = self.build_quote_requests_from_assets(assets).await;

        self.process_market_data_sync(quote_requests, false).await
    }

    async fn resync_market_data(
        &self,
        symbols: Option<Vec<String>>,
    ) -> Result<((), Vec<(String, String)>)> {
        debug!("Resyncing market data. Symbols: {:?}", symbols);
        let assets = match symbols {
            Some(syms) if !syms.is_empty() => self.asset_repository.list_by_symbols(&syms)?,
            _ => {
                debug!("No symbols provided or empty list. Fetching all assets.");
                self.asset_repository.list()?
            }
        };

        let quote_requests = self.build_quote_requests_from_assets(assets).await;

        self.process_market_data_sync(quote_requests, true).await
    }

    fn get_historical_quotes_for_symbols_in_range(
        &self,
        symbols: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<Vec<Quote>> {
        debug!(
            "Fetching historical quotes for {} symbols between {} and {}.",
            symbols.len(),
            start_date,
            end_date
        );

        if symbols.is_empty() {
            return Ok(Vec::new());
        }

        let manual_quotes = self
            .repository
            .get_all_historical_quotes_for_symbols_by_source(symbols, DATA_SOURCE_MANUAL)?;
        let manual_symbols: HashSet<String> =
            manual_quotes.iter().map(|q| q.symbol.clone()).collect();
        let mut all_fetched_quotes = manual_quotes;
        let other_symbols: HashSet<String> = symbols.difference(&manual_symbols).cloned().collect();

        if !other_symbols.is_empty() {
            let lookback_start_date = start_date - Duration::days(QUOTE_LOOKBACK_DAYS);
            let quotes = self.repository.get_historical_quotes_for_symbols_in_range(
                &other_symbols,
                lookback_start_date,
                end_date,
            )?;
            all_fetched_quotes.extend(quotes);
        }

        let filled_quotes =
            self.fill_missing_quotes(&all_fetched_quotes, symbols, start_date, end_date);

        Ok(filled_quotes)
    }

    async fn get_daily_quotes(
        &self,
        asset_ids: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>> {
        if asset_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let quotes_vec = self
            .repository
            .get_historical_quotes_for_symbols_in_range(asset_ids, start_date, end_date)?;

        let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();
        for quote in quotes_vec {
            let date_key = quote.timestamp.date_naive();
            quotes_by_date
                .entry(date_key)
                .or_default()
                .insert(quote.symbol.clone(), quote);
        }

        Ok(quotes_by_date)
    }

    async fn get_market_data_providers_info(&self) -> Result<Vec<MarketDataProviderInfo>> {
        debug!("Fetching market data providers info");
        let latest_sync_dates_by_source = self.repository.get_latest_sync_dates_by_source()?;

        let mut providers_info = Vec::new();
        let known_providers = vec![(DATA_SOURCE_YAHOO, "Yahoo Finance", "yahoo-finance.png")];

        for (id, name, logo_filename) in known_providers {
            let last_synced_naive: Option<NaiveDateTime> = latest_sync_dates_by_source
                .get(id)
                .and_then(|opt_dt| *opt_dt);

            let last_synced_utc: Option<DateTime<Utc>> =
                last_synced_naive.map(|naive_dt| Utc.from_utc_datetime(&naive_dt));

            providers_info.push(MarketDataProviderInfo {
                id: id.to_string(),
                name: name.to_string(),
                logo_filename: logo_filename.to_string(),
                last_synced_date: last_synced_utc,
            });
        }

        debug!("Market data providers info: {:?}", providers_info);
        Ok(providers_info)
    }

    async fn get_market_data_providers_settings(&self) -> Result<Vec<MarketDataProviderSetting>> {
        debug!("Fetching market data providers settings");
        self.repository.get_all_providers()
    }

    async fn update_market_data_provider_settings(
        &self,
        provider_id: String,
        priority: i32,
        enabled: bool,
    ) -> Result<MarketDataProviderSetting> {
        debug!(
            "Updating market data provider settings for provider id: {}",
            provider_id
        );

        if provider_id.eq_ignore_ascii_case(DATA_SOURCE_OPEN_EXCHANGE_RATES) && enabled {
            let api_key = self
                .secret_store
                .get_secret(DATA_SOURCE_OPEN_EXCHANGE_RATES)?
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    Error::Validation(ValidationError::InvalidInput(
                        "Open Exchange Rates API key is required before enabling this provider"
                            .to_string(),
                    ))
                })?;

            self.validate_market_data_provider_api_key(&provider_id, &api_key)
                .await?;
        }

        let changes = UpdateMarketDataProviderSetting {
            priority: Some(priority),
            enabled: Some(enabled),
        };
        let updated_setting = self
            .repository
            .update_provider_settings(provider_id, changes)
            .await?;

        // Refresh the provider registry with the updated settings
        debug!("Refreshing provider registry after settings update");
        self.refresh_provider_registry().await?;

        Ok(updated_setting)
    }

    async fn validate_market_data_provider_api_key(
        &self,
        provider_id: &str,
        api_key: &str,
    ) -> Result<()> {
        if api_key.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "API key is required".to_string(),
            )));
        }

        if provider_id.eq_ignore_ascii_case(DATA_SOURCE_OPEN_EXCHANGE_RATES) {
            open_exchange_rates_client::validate_api_key(api_key).await?;
        }

        Ok(())
    }

    async fn import_quotes_from_csv(
        &self,
        quotes: Vec<QuoteImport>,
        overwrite: bool,
    ) -> Result<Vec<QuoteImport>> {
        debug!("🚀 SERVICE: import_quotes_from_csv called");
        debug!(
            "📊 Processing {} quotes, overwrite: {}",
            quotes.len(),
            overwrite
        );

        let mut results = Vec::new();
        let mut quotes_to_import = Vec::new();

        debug!("🔍 Starting quote validation and duplicate checking...");
        for (index, mut quote) in quotes.into_iter().enumerate() {
            debug!(
                "📋 Processing quote {}/{}: symbol={}, date={}",
                index + 1,
                results.len() + quotes_to_import.len() + 1,
                quote.symbol,
                quote.date
            );

            // Check if quote already exists
            let exists = self.repository.quote_exists(&quote.symbol, &quote.date)?;
            debug!("🔍 Quote exists check: {}", exists);

            if exists {
                if overwrite {
                    debug!("🔄 Quote exists but overwrite=true, will import");
                    quote.validation_status = ImportValidationStatus::Valid;
                    quotes_to_import.push(quote.clone());
                } else {
                    debug!("⚠️ Quote exists and overwrite=false, skipping");
                    quote.validation_status = ImportValidationStatus::Warning(
                        "Quote already exists, skipping".to_string(),
                    );
                }
            } else {
                debug!("✨ New quote, validating...");
                quote.validation_status = self.validate_quote_data(&quote);
                debug!("📋 Validation result: {:?}", quote.validation_status);
                if matches!(quote.validation_status, ImportValidationStatus::Valid) {
                    quotes_to_import.push(quote.clone());
                }
            }
            results.push(quote);
        }

        debug!(
            "📊 Validation complete: {} total, {} to import",
            results.len(),
            quotes_to_import.len()
        );

        // Convert to Quote structs and import
        debug!("🔄 Converting import quotes to database quotes...");
        let quotes_for_db: Vec<Quote> = quotes_to_import
            .iter()
            .enumerate()
            .filter_map(|(index, import_quote)| {
                match self.convert_import_quote_to_quote(import_quote) {
                    Ok(quote) => {
                        debug!("✅ Converted quote {}: {}", index + 1, quote.symbol);
                        Some(quote)
                    }
                    Err(e) => {
                        error!("❌ Failed to convert quote {}: {}", index + 1, e);
                        None
                    }
                }
            })
            .collect();

        debug!(
            "📦 Successfully converted {} quotes for database insertion",
            quotes_for_db.len()
        );

        if !quotes_for_db.is_empty() {
            debug!(
                "💾 Calling repository.bulk_upsert_quotes with {} quotes",
                quotes_for_db.len()
            );
            debug!(
                "🎯 Sample quote for DB: id={}, symbol={}, timestamp={}, data_source={:?}",
                quotes_for_db[0].id,
                quotes_for_db[0].symbol,
                quotes_for_db[0].timestamp,
                quotes_for_db[0].data_source
            );

            match self.repository.bulk_upsert_quotes(quotes_for_db).await {
                Ok(count) => {
                    debug!(
                        "✅ Successfully inserted/updated {} quotes in database",
                        count
                    );
                }
                Err(e) => {
                    error!("❌ Database insertion failed: {}", e);
                    return Err(e);
                }
            }
        } else {
            debug!("⚠️ No quotes to import after conversion");
        }

        debug!("✅ SERVICE: import_quotes_from_csv completed successfully");
        Ok(results)
    }

    async fn bulk_upsert_quotes(&self, quotes: Vec<Quote>) -> Result<usize> {
        self.repository.bulk_upsert_quotes(quotes).await
    }
}

impl MarketDataService {
    pub async fn new(
        repository: Arc<dyn MarketDataRepositoryTrait + Send + Sync>,
        asset_repository: Arc<dyn AssetRepositoryTrait + Send + Sync>,
        secret_store: Arc<dyn SecretStore>,
    ) -> Result<Self> {
        let provider_settings = repository.get_all_providers()?;
        // Be resilient on platforms where certain providers cannot initialize (e.g., mobile TLS differences).
        // Fall back to an empty registry (Manual provider only) instead of aborting app initialization.
        let registry = match ProviderRegistry::new(provider_settings, secret_store.clone()).await {
            Ok(reg) => reg,
            Err(e) => {
                log::warn!(
                    "Provider registry initialization failed: {}. Falling back to empty registry.",
                    e
                );
                // Safe fallback: no external providers enabled
                ProviderRegistry::new(Vec::new(), secret_store.clone()).await?
            }
        };
        let provider_registry = Arc::new(RwLock::new(registry));

        Ok(Self {
            provider_registry,
            repository,
            asset_repository,
            secret_store,
        })
    }

    /// Refreshes the provider registry with the latest settings from the database
    async fn refresh_provider_registry(&self) -> Result<()> {
        debug!("Refreshing provider registry with latest settings");
        let provider_settings = self.repository.get_all_providers()?;
        let new_registry =
            ProviderRegistry::new(provider_settings, self.secret_store.clone()).await?;

        // Replace the registry with the new one
        *self.provider_registry.write().await = new_registry;

        debug!("Provider registry refreshed successfully");
        Ok(())
    }

    fn fill_missing_quotes(
        &self,
        quotes: &[Quote],
        required_symbols: &HashSet<String>,
        start_date: NaiveDate,
        end_date: NaiveDate,
    ) -> Vec<Quote> {
        if required_symbols.is_empty() {
            return Vec::new();
        }

        let mut quotes_by_date: HashMap<NaiveDate, HashMap<String, Quote>> = HashMap::new();
        for quote in quotes {
            quotes_by_date
                .entry(quote.timestamp.date_naive())
                .or_default()
                .insert(quote.symbol.clone(), quote.clone());
        }

        let mut all_filled_quotes = Vec::new();
        let mut last_known_quotes: HashMap<String, Quote> = HashMap::new();
        let mut current_date = start_date.pred_opt().unwrap_or(start_date);
        let mut initial_lookback = 0;
        while initial_lookback < 365 * 10 {
            if let Some(daily_quotes) = quotes_by_date.get(&current_date) {
                for (symbol, quote) in daily_quotes {
                    if required_symbols.contains(symbol) && !last_known_quotes.contains_key(symbol)
                    {
                        last_known_quotes.insert(symbol.clone(), quote.clone());
                    }
                }
            }
            if last_known_quotes.len() == required_symbols.len() {
                break;
            }
            current_date = current_date.pred_opt().unwrap_or(current_date);
            if current_date == start_date.pred_opt().unwrap_or(start_date) {
                break;
            }
            initial_lookback += 1;
        }

        for current_date in time_utils::get_days_between(start_date, end_date) {
            if let Some(daily_quotes) = quotes_by_date.get(&current_date) {
                for (symbol, quote) in daily_quotes {
                    if required_symbols.contains(symbol) {
                        last_known_quotes.insert(symbol.clone(), quote.clone());
                    }
                }
            }

            for symbol in required_symbols {
                if let Some(last_quote) = last_known_quotes.get(symbol) {
                    let mut quote_for_today = last_quote.clone();
                    quote_for_today.timestamp =
                        Utc.from_utc_datetime(&current_date.and_hms_opt(12, 0, 0).unwrap());
                    all_filled_quotes.push(quote_for_today);
                } else {
                    debug!(
                        "No quote available for symbol '{}' on or before date {}",
                        symbol, current_date
                    );
                }
            }
        }

        all_filled_quotes
    }

    fn has_placeholder_name(asset: &Asset) -> bool {
        let Some(name) = &asset.name else {
            return true;
        };

        let trimmed = name.trim();
        trimmed.is_empty()
            || trimmed.eq_ignore_ascii_case(asset.id.as_str())
            || trimmed.eq_ignore_ascii_case(asset.symbol.as_str())
    }

    fn is_cn_a_share_symbol(symbol: &str) -> bool {
        let normalized = symbol.trim().to_uppercase();
        normalized.ends_with(".SH") || normalized.ends_with(".SZ")
    }

    fn contains_cjk(value: &str) -> bool {
        value.chars().any(|ch| {
            matches!(
                ch as u32,
                0x3400..=0x4DBF // CJK Unified Ideographs Extension A
                    | 0x4E00..=0x9FFF // CJK Unified Ideographs
                    | 0xF900..=0xFAFF // CJK Compatibility Ideographs
            )
        })
    }

    async fn maybe_backfill_asset_profile_name(&self, asset: &Asset, effective_source: &str) {
        if !matches!(
            effective_source,
            DATA_SOURCE_EASTMONEY_CN | DATA_SOURCE_TIANTIAN_FUND
        ) {
            return;
        }

        let force_cn_name_for_a_share = effective_source
            .eq_ignore_ascii_case(DATA_SOURCE_EASTMONEY_CN)
            && Self::is_cn_a_share_symbol(&asset.symbol);

        if !force_cn_name_for_a_share && !Self::has_placeholder_name(asset) {
            return;
        }

        let profile = match self
            .provider_registry
            .read()
            .await
            .get_asset_profile(&asset.symbol)
            .await
        {
            Ok(value) => value,
            Err(err) => {
                debug!(
                    "Skipping profile backfill for '{}' due to profile lookup error: {}",
                    asset.symbol, err
                );
                return;
            }
        };

        if profile.data_source.eq_ignore_ascii_case(DATA_SOURCE_MANUAL) {
            return;
        }

        let profile_name = profile
            .name
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .filter(|value| !value.eq_ignore_ascii_case(asset.id.as_str()))
            .filter(|value| !value.eq_ignore_ascii_case(asset.symbol.as_str()))
            .map(|value| value.to_string());

        let Some(profile_name) = profile_name else {
            return;
        };

        if force_cn_name_for_a_share {
            if !Self::contains_cjk(&profile_name) {
                debug!(
                    "Skipping CN name override for '{}' because provider name is not CJK: '{}'",
                    asset.symbol, profile_name
                );
                return;
            }

            let current_name_matches = asset
                .name
                .as_ref()
                .map(|value| value.trim() == profile_name.as_str())
                .unwrap_or(false);
            if current_name_matches {
                return;
            }
        }

        let payload = UpdateAssetProfile {
            symbol: asset.symbol.clone(),
            name: Some(profile_name),
            sectors: profile.sectors.or_else(|| asset.sectors.clone()),
            countries: profile.countries.or_else(|| asset.countries.clone()),
            notes: profile
                .notes
                .or_else(|| asset.notes.clone())
                .unwrap_or_default(),
            asset_sub_class: profile
                .asset_sub_class
                .or_else(|| asset.asset_sub_class.clone()),
            asset_class: profile.asset_class.or_else(|| asset.asset_class.clone()),
            attributes: asset.attributes.clone(),
        };

        match self
            .asset_repository
            .update_profile(&asset.id, payload)
            .await
        {
            Ok(updated) => debug!(
                "Backfilled asset profile name for '{}' -> '{}'",
                updated.id,
                updated.name.unwrap_or_default()
            ),
            Err(err) => error!(
                "Failed to backfill asset profile for '{}': {}",
                asset.id, err
            ),
        }
    }

    async fn build_quote_requests_from_assets(&self, assets: Vec<Asset>) -> Vec<QuoteRequest> {
        let mut quote_requests = Vec::new();

        for asset in assets {
            if asset.asset_type.as_deref() == Some(CASH_ASSET_TYPE) {
                continue;
            }

            let inferred_source = infer_panorama_data_source(&asset.symbol);
            let mut effective_source = match inferred_source {
                Some(source) => source.to_string(),
                None => asset.data_source.clone(),
            };

            if effective_source.eq_ignore_ascii_case(DATA_SOURCE_MANUAL) {
                continue;
            }

            if !asset.data_source.eq_ignore_ascii_case(&effective_source) {
                if let Err(err) = self
                    .asset_repository
                    .update_data_source(&asset.id, effective_source.clone())
                    .await
                {
                    error!(
                        "Failed to auto-correct data source for asset '{}' to '{}': {}",
                        asset.id, effective_source, err
                    );
                    effective_source = asset.data_source.clone();
                } else {
                    debug!(
                        "Auto-corrected data source for asset '{}' to '{}'",
                        asset.id, effective_source
                    );
                }
            }

            if effective_source.eq_ignore_ascii_case(DATA_SOURCE_MANUAL) {
                continue;
            }

            self.maybe_backfill_asset_profile_name(&asset, &effective_source)
                .await;

            quote_requests.push(QuoteRequest {
                symbol: asset.symbol,
                data_source: effective_source.as_str().into(),
                currency: asset.currency,
            });
        }

        quote_requests
    }

    async fn process_market_data_sync(
        &self,
        quote_requests: Vec<QuoteRequest>,
        refetch_all: bool,
    ) -> Result<((), Vec<(String, String)>)> {
        if quote_requests.is_empty() {
            debug!("No syncable assets found matching the criteria. Skipping sync.");
            self.try_sync_mpf_unit_prices().await;
            return Ok(((), Vec::new()));
        }

        let current_utc_naive_date = Utc::now().date_naive();
        let end_date_naive_utc = current_utc_naive_date
            .and_hms_opt(23, 59, 59)
            .expect("valid end-of-day time");
        let end_date: SystemTime = Utc.from_utc_datetime(&end_date_naive_utc).into();

        let public_requests = quote_requests;
        let mut all_quotes = Vec::new();
        let mut failed_syncs = Vec::new();
        let symbols_with_currencies: Vec<(String, String)> = public_requests
            .iter()
            .map(|req| (req.symbol.clone(), req.currency.clone()))
            .collect();

        let sync_plan =
            self.calculate_sync_plan(refetch_all, &symbols_with_currencies, end_date)?;

        if sync_plan.is_empty() {
            debug!("All tracked symbols are already up to date; nothing to fetch from providers.");
        } else {
            let mut grouped_requests: BTreeMap<NaiveDateTime, (SystemTime, Vec<(String, String)>)> =
                BTreeMap::new();

            for plan in sync_plan {
                let SymbolSyncPlanItem {
                    symbol,
                    currency,
                    start,
                } = plan;
                let start_key = DateTime::<Utc>::from(start).naive_utc();
                match grouped_requests.entry(start_key) {
                    BTreeEntry::Occupied(mut entry) => entry.get_mut().1.push((symbol, currency)),
                    BTreeEntry::Vacant(entry) => {
                        entry.insert((start, vec![(symbol, currency)]));
                    }
                }
            }

            for (_, (start_time, group_symbols)) in grouped_requests.into_iter() {
                if group_symbols.is_empty() {
                    continue;
                }

                if start_time >= end_date {
                    debug!(
                        "Skipping sync for symbols {:?} because start time {:?} >= end time {:?}.",
                        group_symbols
                            .iter()
                            .map(|(symbol, _)| symbol.clone())
                            .collect::<Vec<_>>(),
                        DateTime::<Utc>::from(start_time),
                        DateTime::<Utc>::from(end_date),
                    );
                    continue;
                }

                let symbol_names: Vec<String> = group_symbols
                    .iter()
                    .map(|(symbol, _)| symbol.clone())
                    .collect();

                match self
                    .provider_registry
                    .read()
                    .await
                    .historical_quotes_bulk(&group_symbols, start_time, end_date)
                    .await
                {
                    Ok((quotes, provider_failures)) => {
                        debug!(
                            "Fetched {} quotes for symbols {:?} (start {}).",
                            quotes.len(),
                            symbol_names,
                            DateTime::<Utc>::from(start_time).format("%Y-%m-%d")
                        );
                        all_quotes.extend(quotes);
                        failed_syncs.extend(provider_failures);
                    }
                    Err(e) => {
                        error!(
                            "Failed to sync quotes for symbols {:?} starting {}: {}",
                            symbol_names,
                            DateTime::<Utc>::from(start_time).format("%Y-%m-%d"),
                            e
                        );
                        failed_syncs.extend(
                            symbol_names
                                .into_iter()
                                .map(|symbol| (symbol, e.to_string())),
                        );
                    }
                }
            }
        }

        if !all_quotes.is_empty() {
            debug!(
                "Attempting to save {} filled quotes to the repository.",
                all_quotes.len()
            );
            all_quotes.sort_by(|a, b| {
                a.symbol
                    .cmp(&b.symbol)
                    .then_with(|| a.timestamp.cmp(&b.timestamp))
                    .then_with(|| a.data_source.as_str().cmp(b.data_source.as_str()))
            });
            if let Err(e) = self.repository.save_quotes(&all_quotes).await {
                error!("Failed to save synced quotes to repository: {}", e);
                failed_syncs.push(("repository_save".to_string(), e.to_string()));
            } else {
                debug!("Successfully saved {} filled quotes.", all_quotes.len());
            }
        }

        self.try_sync_mpf_unit_prices().await;

        Ok(((), failed_syncs))
    }

    async fn try_sync_mpf_unit_prices(&self) {
        match self.sync_mpf_unit_prices().await {
            Ok(updated_assets) => {
                if updated_assets > 0 {
                    debug!("MPF unit price sync updated {} asset(s).", updated_assets);
                }
            }
            Err(err) => {
                error!("MPF unit price sync failed: {}", err);
            }
        }
    }

    async fn sync_mpf_unit_prices(&self) -> Result<usize> {
        let assets = self.asset_repository.list()?;
        let mpf_assets: Vec<Asset> = assets.into_iter().filter(Self::is_mpf_asset).collect();

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
                    error!(
                        "Failed to apply MPF unit prices for asset '{}': {}",
                        asset.symbol, err
                    );
                }
            }
        }

        Ok(updated_assets)
    }

    fn is_mpf_asset(asset: &Asset) -> bool {
        if asset
            .asset_class
            .as_deref()
            .map(|value| value.to_ascii_lowercase().contains("mpf"))
            .unwrap_or(false)
        {
            return true;
        }

        if asset
            .asset_sub_class
            .as_deref()
            .map(|value| value.to_ascii_lowercase().contains("mpf"))
            .unwrap_or(false)
        {
            return true;
        }

        let Some(attributes) = asset.attributes.as_deref() else {
            return false;
        };

        let Ok(parsed) = serde_json::from_str::<JsonValue>(attributes) else {
            return false;
        };

        parsed
            .get("mpf_subfunds")
            .and_then(|value| value.as_array())
            .map(|subfunds| !subfunds.is_empty())
            .unwrap_or(false)
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
        let captures = MPFA_UNIT_PRICE_LINK_REGEX.captures(page_html)?;
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
            if fund_name.is_empty() {
                continue;
            }
            if fund_name.eq_ignore_ascii_case("fund name") || fund_name.contains("成分基金名稱")
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
            Some(Data::Float(value)) => Decimal::from_f64_retain(*value),
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

        if let Some(captures) = MPFA_DMY_DATE_REGEX.captures(text) {
            let day = captures.get(1)?.as_str().parse::<u32>().ok()?;
            let month = captures.get(2)?.as_str().parse::<u32>().ok()?;
            let year = captures.get(3)?.as_str().parse::<i32>().ok()?;
            return NaiveDate::from_ymd_opt(year, month, day);
        }

        if let Some(captures) = MPFA_YMD_ZH_DATE_REGEX.captures(text) {
            let year = captures.get(1)?.as_str().parse::<i32>().ok()?;
            let month = captures.get(2)?.as_str().parse::<u32>().ok()?;
            let day = captures.get(3)?.as_str().parse::<u32>().ok()?;
            return NaiveDate::from_ymd_opt(year, month, day);
        }

        None
    }

    fn is_cjk_char(character: char) -> bool {
        matches!(
            character as u32,
            0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF
        )
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

    fn json_to_decimal(value: &JsonValue) -> Option<Decimal> {
        match value {
            JsonValue::Number(number) => {
                if let Some(v) = number.as_f64() {
                    return Decimal::from_f64_retain(v);
                }
                Decimal::from_str(&number.to_string()).ok()
            }
            JsonValue::String(raw) => Self::parse_decimal_from_text(raw),
            _ => None,
        }
    }

    fn decimal_to_json_value(value: Decimal) -> Option<JsonValue> {
        let float_value = value.to_f64()?;
        let number = JsonNumber::from_f64(float_value)?;
        Some(JsonValue::Number(number))
    }

    async fn apply_mpf_unit_prices_to_asset(
        &self,
        asset: &Asset,
        snapshot: &MpfUnitPriceSnapshot,
    ) -> Result<bool> {
        let mut attributes_value = asset
            .attributes
            .as_deref()
            .and_then(|raw| serde_json::from_str::<JsonValue>(raw).ok())
            .unwrap_or_else(|| JsonValue::Object(JsonMap::new()));

        let Some(attributes_object) = attributes_value.as_object_mut() else {
            return Ok(false);
        };

        let Some(subfunds) = attributes_object
            .get_mut("mpf_subfunds")
            .and_then(|value| value.as_array_mut())
        else {
            return Ok(false);
        };

        let mut matched_any_subfund = false;
        let mut has_market_value = false;
        let mut total_market_value = Decimal::ZERO;

        for subfund in subfunds.iter_mut() {
            let Some(subfund_object) = subfund.as_object_mut() else {
                continue;
            };

            let Some(subfund_name) = subfund_object
                .get("name")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };

            let normalized_name = Self::normalize_mpf_fund_name(subfund_name);
            let Some(nav) = snapshot
                .unit_prices_by_normalized_name
                .get(&normalized_name)
                .cloned()
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
                        total_market_value += market_value;
                        has_market_value = true;
                    }
                }
            }
        }

        if !matched_any_subfund {
            return Ok(false);
        }

        if let Some(valuation_date) = snapshot.valuation_date {
            attributes_object.insert(
                "valuation_date".to_string(),
                JsonValue::String(valuation_date.format("%Y-%m-%d").to_string()),
            );
        }

        if has_market_value {
            if let Some(total_market_value_json) =
                Self::decimal_to_json_value(total_market_value.round_dp(2))
            {
                attributes_object.insert("market_value".to_string(), total_market_value_json);
            }
        }

        let payload = UpdateAssetProfile {
            symbol: asset.symbol.clone(),
            name: asset.name.clone().or_else(|| Some(asset.symbol.clone())),
            sectors: asset.sectors.clone(),
            countries: asset.countries.clone(),
            notes: asset.notes.clone().unwrap_or_default(),
            asset_sub_class: asset.asset_sub_class.clone(),
            asset_class: asset.asset_class.clone(),
            attributes: Some(attributes_value.to_string()),
        };

        self.asset_repository
            .update_profile(&asset.id, payload)
            .await?;
        Ok(true)
    }

    fn calculate_sync_plan(
        &self,
        refetch_all: bool,
        symbols_with_currencies: &[(String, String)],
        end_time: SystemTime,
    ) -> Result<Vec<SymbolSyncPlanItem>> {
        if symbols_with_currencies.is_empty() {
            return Ok(Vec::new());
        }

        let end_date = DateTime::<Utc>::from(end_time).naive_utc().date();
        let default_history_days = DEFAULT_HISTORY_DAYS;
        let default_start_date = end_date - Duration::days(default_history_days);

        if refetch_all {
            let default_start_time: SystemTime = Utc
                .from_utc_datetime(&default_start_date.and_hms_opt(0, 0, 0).unwrap())
                .into();

            let plan = symbols_with_currencies
                .iter()
                .map(|(symbol, currency)| SymbolSyncPlanItem {
                    symbol: symbol.clone(),
                    currency: currency.clone(),
                    start: default_start_time,
                })
                .collect();
            return Ok(plan);
        }

        let symbols_for_latest: Vec<String> = symbols_with_currencies
            .iter()
            .map(|(sym, _)| sym.clone())
            .collect();

        let quotes_map = match self
            .repository
            .get_latest_quotes_for_symbols(&symbols_for_latest)
        {
            Ok(map) => map,
            Err(e) => {
                error!(
                    "Failed to get latest quotes for symbols {:?}: {}. Falling back to default history window.",
                    symbols_for_latest, e
                );
                HashMap::new()
            }
        };

        let mut plan = Vec::new();

        for (symbol, currency) in symbols_with_currencies {
            let start_date = match quotes_map.get(symbol) {
                Some(latest_quote) => {
                    let last_date = latest_quote.timestamp.date_naive();

                    if last_date >= end_date {
                        // Re-fetch the latest day to pick up intraday adjustments Yahoo publishes.
                        end_date
                    } else {
                        last_date.succ_opt().unwrap_or(last_date)
                    }
                }
                None => default_start_date,
            };

            if start_date > end_date {
                debug!(
                    "Symbol '{}' is already synced through {} (end {}). Skipping fetch.",
                    symbol, start_date, end_date
                );
                continue;
            }

            let start_time: SystemTime = Utc
                .from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap())
                .into();

            plan.push(SymbolSyncPlanItem {
                symbol: symbol.clone(),
                currency: currency.clone(),
                start: start_time,
            });
        }

        Ok(plan)
    }

    fn validate_quote_data(&self, quote: &QuoteImport) -> ImportValidationStatus {
        // Validate symbol
        if quote.symbol.trim().is_empty() {
            return ImportValidationStatus::Error("Symbol is required".to_string());
        }

        // Validate date format
        if chrono::NaiveDate::parse_from_str(&quote.date, "%Y-%m-%d").is_err() {
            return ImportValidationStatus::Error(
                "Invalid date format. Expected YYYY-MM-DD".to_string(),
            );
        }

        // Validate close price (required)
        if quote.close <= Decimal::ZERO {
            return ImportValidationStatus::Error("Close price must be greater than 0".to_string());
        }

        // Validate OHLC logic
        if let (Some(open), Some(high), Some(low)) = (quote.open, quote.high, quote.low) {
            if high < low {
                return ImportValidationStatus::Error(
                    "High price cannot be less than low price".to_string(),
                );
            }
            if open > high || open < low {
                return ImportValidationStatus::Warning(
                    "Open price is outside high-low range".to_string(),
                );
            }
            if quote.close > high || quote.close < low {
                return ImportValidationStatus::Warning(
                    "Close price is outside high-low range".to_string(),
                );
            }
        }

        ImportValidationStatus::Valid
    }

    fn convert_import_quote_to_quote(&self, import_quote: &QuoteImport) -> Result<Quote> {
        use super::market_data_model::DataSource;

        let timestamp = chrono::NaiveDate::parse_from_str(&import_quote.date, "%Y-%m-%d")?
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_local_timezone(Utc)
            .unwrap();

        Ok(Quote {
            id: format!("{}_{}", import_quote.symbol, import_quote.date),
            symbol: import_quote.symbol.clone(),
            timestamp,
            open: import_quote.open.unwrap_or(import_quote.close),
            high: import_quote.high.unwrap_or(import_quote.close),
            low: import_quote.low.unwrap_or(import_quote.close),
            close: import_quote.close,
            adjclose: import_quote.close, // Assume no adjustment for imported data
            volume: import_quote.volume.unwrap_or(Decimal::ZERO),
            currency: import_quote.currency.clone(),
            data_source: DataSource::Manual,
            created_at: Utc::now(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::MarketDataService;
    use crate::assets::Asset;

    #[test]
    fn extracts_latest_mpf_xls_link_from_html() {
        let html = r#"
        <li><a href="/en/-/media/files/information-centre/fund-information/monthly-fund-price/consolidated_list_for_dec_25_read_only.xls">31 December 2025</a></li>
        <li><a href="/en/-/media/files/information-centre/fund-information/monthly-fund-price/consolidated_list_for_nov_25_read_only.xls">28 November 2025</a></li>
        "#;

        let url = MarketDataService::extract_mpf_unit_price_xls_url(html).unwrap();
        assert_eq!(
            url,
            "https://www.mpfa.org.hk/en/-/media/files/information-centre/fund-information/monthly-fund-price/consolidated_list_for_dec_25_read_only.xls"
        );
    }

    #[test]
    fn normalizes_mpf_fund_names_consistently() {
        let left =
            MarketDataService::normalize_mpf_fund_name("Manulife MPF Pacific Asia Equity Fund");
        let right = MarketDataService::normalize_mpf_fund_name(
            "  Manulife  MPF  Pacific-Asia  Equity  Fund  ",
        );

        assert_eq!(left, right);
    }

    #[test]
    fn parses_mpf_valuation_dates_from_header_text() {
        let date = MarketDataService::extract_valuation_date_from_text("as at 31.12.2025").unwrap();
        assert_eq!(date.format("%Y-%m-%d").to_string(), "2025-12-31");
    }

    #[test]
    fn detects_mpf_assets_from_attributes() {
        let asset = Asset {
            id: "mpf-asset".to_string(),
            symbol: "mpf-asset".to_string(),
            attributes: Some(
                r#"{"mpf_subfunds":[{"name":"Manulife MPF Japan Equity Fund","units":1.0}]}"#
                    .to_string(),
            ),
            ..Asset::default()
        };

        assert!(MarketDataService::is_mpf_asset(&asset));
    }
}
