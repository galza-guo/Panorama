//! Auto-classification of assets based on provider profile data.
//!
//! Maps Yahoo/provider data to taxonomy categories:
//! - quote_type (EQUITY, ETF, MUTUALFUND) → instrument_type taxonomy
//! - quote_type → asset_classes taxonomy (EQUITY, DEBT, CASH, etc.)
//! - sector (Technology, Healthcare) → industries_gics taxonomy
//! - country (United States, Canada) → regions taxonomy

use crate::taxonomies::{Category, NewAssetTaxonomyAssignment, TaxonomyServiceTrait};
use log::{debug, warn};
use std::collections::HashMap;
use std::sync::Arc;

/// Maps Yahoo quote_type to instrument_type taxonomy category ID
/// Yahoo quoteType values: EQUITY, ETF, MUTUALFUND, INDEX, CRYPTOCURRENCY, OPTION, BOND, FUTURES, CURRENCY
/// Also handles: ECNQUOTE (Canadian ETFs), NONE (delisted)
///
/// Instrument type hierarchy:
/// - EQUITY_SECURITY: STOCK_COMMON, STOCK_PREFERRED, DEPOSITARY_RECEIPT, EQUITY_WARRANT_RIGHT, PARTNERSHIP_UNIT
/// - DEBT_SECURITY: BOND_GOVERNMENT, BOND_CORPORATE, BOND_MUNICIPAL, BOND_CONVERTIBLE, MONEY_MARKET_DEBT
/// - FUND: FUND_MUTUAL, FUND_CLOSED_END, FUND_PRIVATE, FUND_FOF
/// - ETP: ETF, ETN, ETC
/// - DERIVATIVE: OPTION, FUTURE, OTC_DERIVATIVE, CFD
/// - CASH_FX: CASH, DEPOSIT, FX_POSITION
/// - DIGITAL_ASSET: CRYPTO_NATIVE, STABLECOIN, TOKENIZED_SECURITY
fn map_quote_type_to_instrument_type(quote_type: &str) -> Option<&'static str> {
    match quote_type.to_uppercase().as_str() {
        "EQUITY" => Some("STOCK_COMMON"),
        "ETF" => Some("ETF"),
        "MUTUALFUND" | "MUTUAL FUND" => Some("FUND_MUTUAL"),
        "INDEX" => Some("ETF"), // Index funds are typically ETFs
        "CRYPTOCURRENCY" | "CRYPTO" => Some("CRYPTO_NATIVE"),
        "OPTION" => Some("OPTION"),
        "BOND" => Some("BOND_CORPORATE"), // Default to corporate, can be refined manually
        "MONEYMARKET" => Some("MONEY_MARKET_DEBT"),
        "FUTURE" | "FUTURES" => Some("FUTURE"),
        // ECNQUOTE: Used by Yahoo for some Canadian/international ETFs and securities
        // Since we can't determine if it's a stock or ETF, skip classification
        // Users can manually classify these
        "ECNQUOTE" => None,
        // NONE: Delisted symbols - skip classification
        "NONE" => None,
        // CURRENCY/FOREX not mapped to instrument type (it's an FX rate, not a security)
        _ => None,
    }
}

fn is_six_digit_numeric(value: &str) -> bool {
    value.len() == 6 && value.chars().all(|c| c.is_ascii_digit())
}

fn contains_etf_keyword(name: &str) -> bool {
    contains_any_keyword(name, &["etf", "exchange traded fund"])
}

fn contains_fund_keyword(name: &str) -> bool {
    contains_any_keyword(
        name,
        &[
            "基金", "联接", "混合", "债券", "指数", "lof", "qdii", "fof", "发起", "增强", "货币",
            "money market", "fixed income",
        ],
    )
}

fn contains_stock_keyword(name: &str) -> bool {
    contains_any_keyword(
        name,
        &[
            "inc",
            "corp",
            "corporation",
            "holdings",
            "ltd",
            "bank",
            "股份",
            "控股",
            "银行",
            "集团",
            "公司",
            "光电",
            "科技",
        ],
    )
}

fn infer_instrument_type_from_symbol_and_name(
    symbol: Option<&str>,
    name: Option<&str>,
) -> Option<&'static str> {
    let normalized_name = name.map(normalize_text).unwrap_or_default();

    // Strong name signal first.
    if !normalized_name.is_empty() && contains_etf_keyword(&normalized_name) {
        return Some("ETF");
    }

    if let Some(symbol) = symbol {
        let symbol_upper = symbol.trim().to_uppercase();
        if !symbol_upper.is_empty() {
            if symbol_upper.ends_with(".HK") {
                return Some("STOCK_COMMON");
            }

            if symbol_upper.ends_with(".SH")
                || symbol_upper.ends_with(".SZ")
                || symbol_upper.ends_with(".BJ")
            {
                let code = symbol_upper.split('.').next().unwrap_or_default();
                if is_six_digit_numeric(code) {
                    if code.starts_with('5') || code.starts_with("159") {
                        return Some("ETF");
                    }
                    return Some("STOCK_COMMON");
                }
            }

            if is_six_digit_numeric(&symbol_upper) {
                if symbol_upper.starts_with("159") {
                    return Some("ETF");
                }
                // Raw 6-digit symbols are ambiguous, rely on name hints.
            }
        }
    }

    if !normalized_name.is_empty()
        && contains_stock_keyword(&normalized_name)
        && !contains_fund_keyword(&normalized_name)
    {
        return Some("STOCK_COMMON");
    }

    None
}

fn infer_instrument_type(input: &ClassificationInput) -> Option<&'static str> {
    let quote_type = input.quote_type.as_deref().map(str::trim).unwrap_or_default();
    let quote_type_upper = quote_type.to_uppercase();

    match quote_type_upper.as_str() {
        // Provider often labels CN equities/ETFs as MUTUALFUND.
        // Use symbol/name hints to recover ETF/stock, then fall back to mutual fund.
        "MUTUALFUND" | "MUTUAL FUND" => infer_instrument_type_from_symbol_and_name(
            input.symbol.as_deref(),
            input.name.as_deref(),
        )
        .or(Some("FUND_MUTUAL")),
        _ => map_quote_type_to_instrument_type(quote_type).or_else(|| {
            infer_instrument_type_from_symbol_and_name(input.symbol.as_deref(), input.name.as_deref())
        }),
    }
}

/// Maps Yahoo quote_type to asset_classes taxonomy category ID
/// Asset classes: CASH, EQUITY, FIXED_INCOME, REAL_ESTATE, COMMODITIES, ALTERNATIVES, DIGITAL_ASSETS
/// Note: Cash is assigned to CASH_BANK_DEPOSITS (child of CASH) for drill-down support
fn map_quote_type_to_asset_class(quote_type: &str) -> Option<&'static str> {
    match quote_type.to_uppercase().as_str() {
        // Equity class: stocks, ETFs, mutual funds, options
        "EQUITY" | "ETF" | "MUTUALFUND" | "MUTUAL FUND" | "INDEX" | "OPTION" => Some("EQUITY"),
        // Fixed Income class: bonds, money market
        "BOND" | "MONEYMARKET" => Some("FIXED_INCOME"),
        // Cash class - assign to child category for drill-down (rollup will sum to CASH)
        "CURRENCY" | "FOREX" | "FX" | "CASH" => Some("CASH_BANK_DEPOSITS"),
        // Cryptocurrency - classify as Digital Assets
        "CRYPTOCURRENCY" | "CRYPTO" => Some("DIGITAL_ASSETS"),
        // Commodities class
        "COMMODITY" | "FUTURE" | "FUTURES" => Some("COMMODITIES"),
        // ECNQUOTE: Unknown type (Canadian/international securities) - skip
        // NONE: Delisted - skip
        "ECNQUOTE" | "NONE" => None,
        _ => None,
    }
}

fn normalize_country_token(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

fn normalize_label_token(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

fn normalize_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn contains_any_keyword(haystack: &str, keywords: &[&str]) -> bool {
    keywords
        .iter()
        .any(|keyword| haystack.contains(&keyword.to_lowercase()))
}

fn infer_asset_class(input: &ClassificationInput) -> Option<&'static str> {
    let quote_type = input.quote_type.as_deref()?;
    let quote_type_upper = quote_type.to_uppercase();

    // Keep direct mappings for non-fund instruments.
    if !matches!(
        quote_type_upper.as_str(),
        "ETF" | "MUTUALFUND" | "MUTUAL FUND" | "INDEX"
    ) {
        return map_quote_type_to_asset_class(quote_type);
    }

    let mut hint_text = String::new();
    if let Some(name) = &input.name {
        hint_text.push_str(name);
        hint_text.push(' ');
    }
    if let Some(raw_country) = &input.country {
        hint_text.push_str(raw_country);
        hint_text.push(' ');
    }
    for sector in &input.sectors {
        hint_text.push_str(&sector.name);
        hint_text.push(' ');
    }
    let hint_text = normalize_text(&hint_text);

    let fixed_income_keywords = [
        "bond",
        "fixed income",
        "treasury",
        "municipal",
        "credit",
        "gilts",
        "债",
        "债券",
        "纯债",
        "中短债",
        "可转债",
    ];
    if contains_any_keyword(&hint_text, &fixed_income_keywords) {
        return Some("FIXED_INCOME");
    }

    let money_market_keywords = ["money market", "cash management", "货币基金", "货币市场"];
    if contains_any_keyword(&hint_text, &money_market_keywords) {
        return Some("CASH_BANK_DEPOSITS");
    }

    let real_estate_keywords = ["reit", "real estate", "房地产", "不动产"];
    if contains_any_keyword(&hint_text, &real_estate_keywords) {
        return Some("REAL_ESTATE");
    }

    let commodity_keywords = [
        "commodity",
        "gold",
        "silver",
        "oil",
        "metals",
        "商品",
        "黄金",
    ];
    if contains_any_keyword(&hint_text, &commodity_keywords) {
        return Some("COMMODITIES");
    }

    // Keep prior behavior as default for broad ETFs/mutual funds/index funds.
    Some("EQUITY")
}

fn infer_country_from_name(name: &str) -> Option<&'static str> {
    let normalized = normalize_text(name);

    let us_index_keywords = [
        "s&p 500",
        "s&p500",
        "sp500",
        "sp 500",
        "snp500",
        "nasdaq 100",
        "russell 2000",
        "dow jones",
        "us total market",
        "标普500",
        "标普 500",
        "标准普尔500",
    ];
    if contains_any_keyword(&normalized, &us_index_keywords) {
        return Some("United States");
    }

    let hong_kong_keywords = ["hang seng", "hsi", "hong kong", "恒生", "港股"];
    if contains_any_keyword(&normalized, &hong_kong_keywords) {
        return Some("Hong Kong");
    }

    let germany_keywords = ["germany", "dax", "德国"];
    if contains_any_keyword(&normalized, &germany_keywords) {
        return Some("Germany");
    }

    let india_keywords = ["india", "nifty", "sensex", "印度"];
    if contains_any_keyword(&normalized, &india_keywords) {
        return Some("India");
    }

    let vietnam_keywords = ["vietnam", "viet nam", "vn30", "越南"];
    if contains_any_keyword(&normalized, &vietnam_keywords) {
        return Some("Viet Nam");
    }

    None
}

fn infer_country_from_symbol(symbol: &str) -> Option<&'static str> {
    let normalized = symbol.trim().to_uppercase();
    if normalized.is_empty() {
        return None;
    }

    if normalized.ends_with(".SH")
        || normalized.ends_with(".SZ")
        || normalized.ends_with(".BJ")
        || normalized.ends_with(".FUND")
    {
        return Some("China");
    }

    if normalized.ends_with(".HK") {
        return Some("Hong Kong");
    }

    if normalized.len() == 6 && normalized.chars().all(|c| c.is_ascii_digit()) {
        return Some("China");
    }

    None
}

/// Maps Yahoo sector name to GICS sector category ID
/// Yahoo uses simplified names, GICS uses formal names
fn map_sector_to_gics(sector: &str) -> Option<&'static str> {
    // Normalize sector name for matching
    let sector_lower = sector.to_lowercase();

    match sector_lower.as_str() {
        "energy" => Some("10"),
        "materials" | "basic materials" => Some("15"),
        "industrials" => Some("20"),
        "consumer discretionary" | "consumer cyclical" => Some("25"),
        "consumer staples" | "consumer defensive" => Some("30"),
        "health care" | "healthcare" => Some("35"),
        "financials" | "financial services" | "financial" => Some("40"),
        "information technology" | "technology" => Some("45"),
        "communication services" | "communication" | "telecommunications" => Some("50"),
        "utilities" => Some("55"),
        "real estate" | "realestate" => Some("60"),
        _ => None,
    }
}

fn infer_sector_from_name(name: &str) -> Option<&'static str> {
    let normalized = normalize_text(name);
    if normalized.is_empty() {
        return None;
    }

    let sector_rules: [(&str, &[&str]); 11] = [
        ("10", &["energy", "oil", "gas", "能源", "石油", "天然气", "煤炭"]),
        ("15", &["materials", "metal", "mining", "黄金", "有色", "材料", "化工"]),
        (
            "20",
            &[
                "industrial",
                "defense",
                "aerospace",
                "航空",
                "航天",
                "军工",
                "通用航空",
                "制造",
            ],
        ),
        (
            "25",
            &[
                "consumer discretionary",
                "consumer cyclical",
                "可选消费",
                "汽车",
                "家电",
                "零售",
            ],
        ),
        (
            "30",
            &[
                "consumer staples",
                "consumer defensive",
                "白酒",
                "食品",
                "饮料",
                "消费",
            ],
        ),
        (
            "35",
            &[
                "health care",
                "healthcare",
                "medical",
                "biotech",
                "医药",
                "医疗",
                "创新药",
                "生物",
                "卫生",
                "制药",
            ],
        ),
        (
            "40",
            &[
                "financial",
                "bank",
                "insurance",
                "证券",
                "保险",
                "银行",
                "金融",
                "非银",
            ],
        ),
        (
            "45",
            &[
                "information technology",
                "technology",
                "semiconductor",
                "chip",
                "software",
                "电子",
                "光电",
                "半导体",
                "芯片",
                "计算机",
                "科技",
                "科创",
            ],
        ),
        (
            "50",
            &[
                "communication",
                "telecom",
                "media",
                "internet",
                "传媒",
                "通信",
                "互联网",
                "电信",
            ],
        ),
        ("55", &["utilities", "utility", "公用事业", "电力"]),
        ("60", &["real estate", "reit", "地产", "房地产", "不动产"]),
    ];

    let mut matched = Vec::new();
    for (category_id, keywords) in sector_rules {
        if contains_any_keyword(&normalized, keywords) {
            matched.push(category_id);
        }
    }

    matched.sort_unstable();
    matched.dedup();

    if matched.len() == 1 {
        return Some(matched[0]);
    }

    None
}

fn is_fund_like_quote_type(quote_type: Option<&str>) -> bool {
    let Some(quote_type) = quote_type else {
        return false;
    };
    matches!(
        quote_type.trim().to_uppercase().as_str(),
        "ETF" | "MUTUALFUND" | "MUTUAL FUND" | "INDEX"
    )
}

/// Maps exchange MIC to country name for fallback region classification.
/// Used when provider doesn't return country data (e.g., ETFs).
fn mic_to_country(mic: &str) -> Option<&'static str> {
    match mic {
        // North America
        "XNYS" | "XNAS" | "XASE" | "ARCX" | "BATS" => Some("United States"),
        "XTSE" | "XTSX" | "XCNQ" => Some("Canada"),
        "XMEX" => Some("Mexico"),

        // UK & Ireland
        "XLON" => Some("United Kingdom"),
        "XDUB" => Some("Ireland"),

        // Germany
        "XETR" | "XFRA" | "XSTU" | "XHAM" | "XDUS" | "XMUN" | "XBER" | "XHAN" => Some("Germany"),

        // Euronext
        "XPAR" => Some("France"),
        "XAMS" => Some("Netherlands"),
        "XBRU" => Some("Belgium"),
        "XLIS" => Some("Portugal"),

        // Southern Europe
        "XMIL" => Some("Italy"),
        "XMAD" => Some("Spain"),
        "XATH" => Some("Greece"),

        // Nordic
        "XSTO" => Some("Sweden"),
        "XHEL" => Some("Finland"),
        "XCSE" => Some("Denmark"),
        "XOSL" => Some("Norway"),

        // Central/Eastern Europe
        "XSWX" => Some("Switzerland"),
        "XWBO" => Some("Austria"),
        "XWAR" => Some("Poland"),

        // Asia
        "XSHG" | "XSHE" => Some("China"),
        "XHKG" => Some("Hong Kong"),
        "XTKS" => Some("Japan"),
        "XKRX" | "XKOS" => Some("South Korea"),
        "XSES" => Some("Singapore"),
        "XBOM" | "XNSE" => Some("India"),
        "XTAI" => Some("Taiwan"),

        // Oceania
        "XASX" => Some("Australia"),
        "XNZE" => Some("New Zealand"),

        // South America
        "BVMF" => Some("Brazil"),

        // Middle East
        "XTAE" => Some("Israel"),

        // Africa
        "XJSE" => Some("South Africa"),

        _ => None,
    }
}

/// Maps country name to regions taxonomy category ID
/// Uses specific country codes where available, falls back to regional groupings
/// Regions hierarchy: R10=Europe, R20=Americas, R2010=North America, R2040=South America,
///                    R30=Asia, R3030=East Asia, R40=Africa, R50=Oceania
fn map_country_to_region(country: &str) -> Option<&'static str> {
    // Keep explicit aliases/codes first; dynamic taxonomy lookup handles the long tail.
    match normalize_country_token(country).as_str() {
        // North America
        "unitedstates" | "usa" | "us" | "america" => Some("country_US"),
        "canada" | "ca" => Some("country_CA"),
        "mexico" | "mx" | "méxico" => Some("country_MX"),

        // Europe
        "unitedkingdom" | "uk" | "greatbritain" | "england" | "gb" => Some("country_GB"),
        "germany" | "deutschland" | "de" => Some("country_DE"),
        "france" | "fr" => Some("country_FR"),
        "switzerland" | "schweiz" | "ch" => Some("country_CH"),
        "netherlands" | "holland" | "nl" => Some("country_NL"),
        "spain" | "españa" | "es" => Some("country_ES"),
        "italy" | "italia" | "it" => Some("country_IT"),
        "ireland" | "ie" => Some("country_IE"),
        "belgium" | "be" => Some("country_BE"),
        "denmark" | "danmark" | "dk" => Some("country_DK"),
        "norway" | "norge" | "no" => Some("country_NO"),
        "sweden" | "sverige" | "se" => Some("country_SE"),
        "finland" | "suomi" | "fi" => Some("country_FI"),
        "austria" | "österreich" | "at" => Some("country_AT"),
        "portugal" | "pt" => Some("country_PT"),
        "poland" | "polska" | "pl" => Some("country_PL"),
        "greece" | "gr" => Some("country_GR"),
        "czechrepublic" | "czechia" | "cz" => Some("country_CZ"),
        "russia" | "ru" => Some("country_RU"),

        // Asia
        "japan" | "日本" | "jp" => Some("country_JP"),
        "china" | "中国" | "cn" => Some("country_CN"),
        "hongkong" | "香港" | "hk" => Some("country_HK"),
        "southkorea" | "korea" | "대한민국" | "kr" => Some("country_KR"),
        "taiwan" | "臺灣" | "tw" => Some("country_TW"),
        "singapore" | "sg" => Some("country_SG"),
        "india" | "भारत" | "in" => Some("country_IN"),
        "indonesia" | "id" => Some("country_ID"),
        "malaysia" | "my" => Some("country_MY"),
        "thailand" | "th" => Some("country_TH"),
        "vietnam" | "việtnam" | "vn" => Some("country_VN"),
        "philippines" | "ph" => Some("country_PH"),

        // Oceania
        "australia" | "au" => Some("country_AU"),
        "newzealand" | "nz" => Some("country_NZ"),

        // South America
        "brazil" | "brasil" | "br" => Some("country_BR"),
        "argentina" | "ar" => Some("country_AR"),
        "chile" | "cl" => Some("country_CL"),
        "colombia" | "co" => Some("country_CO"),
        "peru" | "pe" => Some("country_PE"),

        // Africa
        "southafrica" | "za" => Some("country_ZA"),
        "nigeria" | "ng" => Some("country_NG"),
        "egypt" | "eg" => Some("country_EG"),

        // Middle East
        "israel" | "il" => Some("country_IL"),

        _ => None,
    }
}

/// Sector weight data from provider profile
#[derive(Debug, Clone)]
pub struct SectorWeight {
    pub name: String,
    pub weight: f64,
}

/// Parsed provider profile for auto-classification
#[derive(Debug, Clone, Default)]
pub struct ClassificationInput {
    pub quote_type: Option<String>,
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub sectors: Vec<SectorWeight>,
    pub country: Option<String>,
}

impl ClassificationInput {
    /// Parse from ProviderProfile fields.
    ///
    /// Handles both:
    /// - Single sector (for stocks): `sector` = "Technology" with 100% weight
    /// - Multiple sectors (for ETFs): `sectors_json` = `[{"name": "Technology", "weight": 0.30}, ...]`
    ///
    /// For country, handles both:
    /// - Single country (for stocks): `country` = "United States"
    /// - Multiple countries (for ETFs): `countries_json` = `[{"name": "United States", "weight": 0.60}, ...]`
    /// - Fallback: `exchange_mic` used to infer fund domicile when provider returns no country
    /// - Final fallback: infer from symbol suffix/format (e.g. `.SH`, `.SZ`, `.FUND`, 6-digit CN codes)
    pub fn from_provider_profile(
        quote_type: Option<&str>,
        name: Option<&str>,
        symbol: Option<&str>,
        sector: Option<&str>,
        sectors_json: Option<&str>,
        country: Option<&str>,
        countries_json: Option<&str>,
        exchange_mic: Option<&str>,
    ) -> Self {
        let mut input = ClassificationInput {
            quote_type: quote_type.map(String::from),
            name: name.map(String::from),
            symbol: symbol.map(String::from),
            ..Default::default()
        };

        // Parse sectors: prefer JSON array (ETFs), fall back to single sector (stocks)
        if let Some(json) = sectors_json {
            if let Ok(sectors) = serde_json::from_str::<Vec<serde_json::Value>>(json) {
                input.sectors = sectors
                    .iter()
                    .filter_map(|v| {
                        let name = v.get("name")?.as_str()?.to_string();
                        let weight = v.get("weight")?.as_f64()?;
                        Some(SectorWeight { name, weight })
                    })
                    .collect();
            }
        }

        // If no sectors from JSON, use single sector with 100% weight
        if input.sectors.is_empty() {
            if let Some(sector_name) = sector {
                if !sector_name.is_empty() {
                    input.sectors.push(SectorWeight {
                        name: sector_name.to_string(),
                        weight: 1.0, // 100% weight for single-sector stocks
                    });
                }
            }
        }

        // Parse country: prefer JSON array (ETFs), fall back to single country (stocks)
        if let Some(json) = countries_json {
            if let Ok(countries) = serde_json::from_str::<Vec<serde_json::Value>>(json) {
                input.country = countries
                    .first()
                    .and_then(|v| v.get("name"))
                    .and_then(|v| v.as_str())
                    .map(String::from);
            }
        }

        // If no country from JSON, use single country field
        if input.country.is_none() {
            if let Some(country_name) = country {
                if !country_name.is_empty() {
                    input.country = Some(country_name.to_string());
                }
            }
        }

        // Fallback: use exchange MIC to infer fund domicile
        // This is useful for ETFs where Yahoo doesn't return country data
        if input.country.is_none() {
            if let Some(mic) = exchange_mic {
                if let Some(country_name) = mic_to_country(mic) {
                    debug!(
                        "Using exchange MIC {} to infer country: {}",
                        mic, country_name
                    );
                    input.country = Some(country_name.to_string());
                }
            }
        }

        // Final fallback: infer from symbol suffix / format when provider country and MIC are unavailable.
        if input.country.is_none() {
            if let Some(symbol) = &input.symbol {
                if let Some(country_name) = infer_country_from_symbol(symbol) {
                    input.country = Some(country_name.to_string());
                }
            }
        }

        input
    }
}

/// Auto-classification service
pub struct AutoClassificationService {
    taxonomy_service: Arc<dyn TaxonomyServiceTrait>,
}

impl AutoClassificationService {
    pub fn new(taxonomy_service: Arc<dyn TaxonomyServiceTrait>) -> Self {
        Self { taxonomy_service }
    }

    /// Auto-classify an asset based on provider profile data.
    /// Creates taxonomy assignments for instrument_type, asset_classes, industries_gics, and regions.
    pub async fn classify_asset(
        &self,
        asset_id: &str,
        input: &ClassificationInput,
    ) -> Result<ClassificationResult, String> {
        let mut result = ClassificationResult::default();

        // 1. Classify instrument type
        if let Some(category_id) = infer_instrument_type(input) {
            self.clear_auto_assignments_for_taxonomy(asset_id, "instrument_type")
                .await;
            match self
                .assign_to_taxonomy(asset_id, "instrument_type", category_id, 10000)
                .await
            {
                Ok(_) => {
                    debug!(
                        "Auto-classified {} as {} in instrument_type",
                        asset_id, category_id
                    );
                    result.security_type = Some(category_id.to_string());
                }
                Err(e) => {
                    warn!(
                        "Failed to auto-classify {} instrument_type: {}",
                        asset_id, e
                    );
                }
            }
        }

        if input.quote_type.is_some() {
            // 2. Classify asset class (EQUITY, DEBT, CASH, COMMODITY, REAL_ESTATE)
            if let Some(category_id) = infer_asset_class(input) {
                self.clear_auto_assignments_for_taxonomy(asset_id, "asset_classes")
                    .await;
                match self
                    .assign_to_taxonomy(asset_id, "asset_classes", category_id, 10000)
                    .await
                {
                    Ok(_) => {
                        debug!(
                            "Auto-classified {} as {} in asset_classes",
                            asset_id, category_id
                        );
                        result.asset_class = Some(category_id.to_string());
                    }
                    Err(e) => {
                        warn!("Failed to auto-classify {} asset_classes: {}", asset_id, e);
                    }
                }
            }
        }

        // 3. Classify sectors (industries_gics)
        let mut sector_weights_bp: HashMap<&'static str, i32> = HashMap::new();
        for sector in &input.sectors {
            if let Some(category_id) = map_sector_to_gics(&sector.name) {
                // Convert weight from 0-1 to basis points (0-10000)
                let weight_bp = (sector.weight * 10000.0).round() as i32;
                *sector_weights_bp.entry(category_id).or_insert(0) += weight_bp;
            }
        }

        if sector_weights_bp.is_empty() {
            if let Some(name) = input.name.as_deref() {
                if let Some(category_id) = infer_sector_from_name(name) {
                    sector_weights_bp.insert(category_id, 10000);
                }
            }
        }

        if !sector_weights_bp.is_empty() {
            // Preserve manual edits, replace stale migrated/AUTO assignments.
            self.clear_non_manual_assignments_for_taxonomy(asset_id, "industries_gics")
                .await;

            let mut sector_assignments: Vec<(&'static str, i32)> =
                sector_weights_bp.into_iter().collect();
            sector_assignments.sort_by_key(|(category_id, _)| *category_id);

            for (category_id, weight_bp) in sector_assignments {
                match self
                    .assign_to_taxonomy(asset_id, "industries_gics", category_id, weight_bp)
                    .await
                {
                    Ok(_) => {
                        let weight = f64::from(weight_bp) / 10000.0;
                        debug!(
                            "Auto-classified {} as {} ({}%) in industries_gics",
                            asset_id,
                            category_id,
                            weight * 100.0
                        );
                        result.sectors.push((category_id.to_string(), weight));
                    }
                    Err(e) => {
                        warn!(
                            "Failed to auto-classify {} industries_gics: {}",
                            asset_id, e
                        );
                    }
                }
            }
        } else if is_fund_like_quote_type(input.quote_type.as_deref()) {
            // Fund names often have stale migrated sectors but no reliable provider sectors.
            // Clear non-manual assignments to avoid misleading single-sector output.
            self.clear_non_manual_assignments_for_taxonomy(asset_id, "industries_gics")
                .await;
        }

        // 4. Classify region
        // Keep region resolution simple and deterministic:
        // 1) Name override (handles QDII/overseas exposure hints like S&P500/Hang Seng)
        // 2) Base listing/provider country fallback
        let inferred_country = input
            .name
            .as_deref()
            .and_then(infer_country_from_name)
            .or(input.country.as_deref());

        if let Some(country) = inferred_country {
            let region_category_id = map_country_to_region(country)
                .map(String::from)
                .or_else(|| self.find_region_category_by_name(country));

            if let Some(category_id) = region_category_id {
                self.clear_auto_assignments_for_taxonomy(asset_id, "regions")
                    .await;
                match self
                    .assign_to_taxonomy(asset_id, "regions", &category_id, 10000)
                    .await
                {
                    Ok(_) => {
                        debug!("Auto-classified {} as {} in regions", asset_id, category_id);
                        result.region = Some(category_id);
                    }
                    Err(e) => {
                        warn!("Failed to auto-classify {} regions: {}", asset_id, e);
                    }
                }
            }
        }

        Ok(result)
    }

    async fn clear_auto_assignments_for_taxonomy(&self, asset_id: &str, taxonomy_id: &str) {
        let assignments = match self.taxonomy_service.get_asset_assignments(asset_id) {
            Ok(assignments) => assignments,
            Err(e) => {
                warn!(
                    "Failed to load existing assignments for {}: {}",
                    asset_id, e
                );
                return;
            }
        };

        for assignment in assignments
            .into_iter()
            .filter(|a| a.taxonomy_id == taxonomy_id && a.source.eq_ignore_ascii_case("AUTO"))
        {
            if let Err(e) = self
                .taxonomy_service
                .remove_asset_assignment(&assignment.id)
                .await
            {
                warn!(
                    "Failed to remove stale AUTO assignment {} for {}: {}",
                    assignment.id, asset_id, e
                );
            }
        }
    }

    async fn clear_non_manual_assignments_for_taxonomy(&self, asset_id: &str, taxonomy_id: &str) {
        let assignments = match self.taxonomy_service.get_asset_assignments(asset_id) {
            Ok(assignments) => assignments,
            Err(e) => {
                warn!(
                    "Failed to load existing assignments for {}: {}",
                    asset_id, e
                );
                return;
            }
        };

        for assignment in assignments.into_iter().filter(|a| {
            a.taxonomy_id == taxonomy_id && !a.source.eq_ignore_ascii_case("MANUAL")
        }) {
            if let Err(e) = self
                .taxonomy_service
                .remove_asset_assignment(&assignment.id)
                .await
            {
                warn!(
                    "Failed to remove stale assignment {} for {}: {}",
                    assignment.id, asset_id, e
                );
            }
        }
    }

    fn find_region_category_by_name(&self, country_name: &str) -> Option<String> {
        let normalized_target = normalize_label_token(country_name);
        if normalized_target.is_empty() {
            return None;
        }

        let regions = self
            .taxonomy_service
            .get_taxonomy("regions")
            .ok()
            .flatten()?;

        self.find_region_in_categories(&regions.categories, &normalized_target)
    }

    fn find_region_in_categories(
        &self,
        categories: &[Category],
        normalized_target: &str,
    ) -> Option<String> {
        if normalized_target.len() == 2 {
            let iso_category = format!("country_{}", normalized_target.to_uppercase());
            if categories.iter().any(|c| c.id == iso_category) {
                return Some(iso_category);
            }
        }

        categories
            .iter()
            .find(|category| normalize_label_token(&category.name) == normalized_target)
            .map(|category| category.id.clone())
    }

    /// Helper to assign an asset to a taxonomy category
    async fn assign_to_taxonomy(
        &self,
        asset_id: &str,
        taxonomy_id: &str,
        category_id: &str,
        weight: i32,
    ) -> Result<(), String> {
        let assignment = NewAssetTaxonomyAssignment {
            id: None, // Auto-generate ID
            asset_id: asset_id.to_string(),
            taxonomy_id: taxonomy_id.to_string(),
            category_id: category_id.to_string(),
            weight,
            source: "AUTO".to_string(),
        };

        self.taxonomy_service
            .assign_asset_to_category(assignment)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

/// Result of auto-classification
#[derive(Debug, Default)]
pub struct ClassificationResult {
    pub security_type: Option<String>,
    pub asset_class: Option<String>,
    pub sectors: Vec<(String, f64)>,
    pub region: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_quote_type_to_instrument_type() {
        assert_eq!(
            map_quote_type_to_instrument_type("EQUITY"),
            Some("STOCK_COMMON")
        );
        assert_eq!(map_quote_type_to_instrument_type("ETF"), Some("ETF"));
        assert_eq!(
            map_quote_type_to_instrument_type("MUTUALFUND"),
            Some("FUND_MUTUAL")
        );
        assert_eq!(
            map_quote_type_to_instrument_type("CRYPTOCURRENCY"),
            Some("CRYPTO_NATIVE")
        );
        assert_eq!(
            map_quote_type_to_instrument_type("BOND"),
            Some("BOND_CORPORATE")
        );
        assert_eq!(
            map_quote_type_to_instrument_type("MONEYMARKET"),
            Some("MONEY_MARKET_DEBT")
        );
        assert_eq!(map_quote_type_to_instrument_type("FUTURE"), Some("FUTURE"));
        assert_eq!(map_quote_type_to_instrument_type("FUTURES"), Some("FUTURE"));
        assert_eq!(map_quote_type_to_instrument_type("OPTION"), Some("OPTION"));
        assert_eq!(map_quote_type_to_instrument_type("unknown"), None);
    }

    #[test]
    fn test_infer_instrument_type_for_cn_etf_from_mutualfund() {
        let input = ClassificationInput::from_provider_profile(
            Some("MUTUALFUND"),
            Some("华泰柏瑞沪深300ETF"),
            Some("510300.SH"),
            None,
            None,
            None,
            None,
            None,
        );
        assert_eq!(infer_instrument_type(&input), Some("ETF"));
    }

    #[test]
    fn test_infer_instrument_type_for_cn_stock_from_mutualfund() {
        let input = ClassificationInput::from_provider_profile(
            Some("MUTUALFUND"),
            Some("交通银行"),
            Some("601328.SH"),
            None,
            None,
            None,
            None,
            None,
        );
        assert_eq!(infer_instrument_type(&input), Some("STOCK_COMMON"));
    }

    #[test]
    fn test_infer_instrument_type_for_fund_from_mutualfund() {
        let input = ClassificationInput::from_provider_profile(
            Some("MUTUALFUND"),
            Some("中欧价值智选混合C"),
            Some("004235.FUND"),
            None,
            None,
            None,
            None,
            None,
        );
        assert_eq!(infer_instrument_type(&input), Some("FUND_MUTUAL"));
    }

    #[test]
    fn test_map_asset_class() {
        // Equity class
        assert_eq!(map_quote_type_to_asset_class("EQUITY"), Some("EQUITY"));
        assert_eq!(map_quote_type_to_asset_class("ETF"), Some("EQUITY"));
        assert_eq!(map_quote_type_to_asset_class("MUTUALFUND"), Some("EQUITY"));
        assert_eq!(
            map_quote_type_to_asset_class("CRYPTOCURRENCY"),
            Some("DIGITAL_ASSETS")
        );
        // Fixed Income class
        assert_eq!(map_quote_type_to_asset_class("BOND"), Some("FIXED_INCOME"));
        // Cash class (assigned to child category for drill-down)
        assert_eq!(
            map_quote_type_to_asset_class("CURRENCY"),
            Some("CASH_BANK_DEPOSITS")
        );
        // Commodities class
        assert_eq!(
            map_quote_type_to_asset_class("COMMODITY"),
            Some("COMMODITIES")
        );
        // Unknown
        assert_eq!(map_quote_type_to_asset_class("unknown"), None);
    }

    #[test]
    fn test_map_sector() {
        assert_eq!(map_sector_to_gics("Technology"), Some("45"));
        assert_eq!(map_sector_to_gics("Information Technology"), Some("45"));
        assert_eq!(map_sector_to_gics("Healthcare"), Some("35"));
        assert_eq!(map_sector_to_gics("Health Care"), Some("35"));
        assert_eq!(map_sector_to_gics("Financial Services"), Some("40"));
        assert_eq!(map_sector_to_gics("Consumer Cyclical"), Some("25"));
        assert_eq!(map_sector_to_gics("unknown sector"), None);
    }

    #[test]
    fn test_infer_sector_from_name() {
        assert_eq!(
            infer_sector_from_name("天弘中证银行ETF联接A"),
            Some("40")
        );
        assert_eq!(
            infer_sector_from_name("国泰CES半导体芯片ETF"),
            Some("45")
        );
        assert_eq!(infer_sector_from_name("广发中证传媒ETF"), Some("50"));
        assert_eq!(
            infer_sector_from_name("华安黄金ETF联接"),
            Some("15")
        );
    }

    #[test]
    fn test_infer_sector_from_name_returns_none_when_ambiguous() {
        assert_eq!(infer_sector_from_name("中银金融地产混合A"), None);
    }

    #[test]
    fn test_map_country() {
        // Specific country entries
        assert_eq!(map_country_to_region("United States"), Some("country_US"));
        assert_eq!(map_country_to_region("USA"), Some("country_US"));
        assert_eq!(map_country_to_region("US"), Some("country_US"));
        assert_eq!(map_country_to_region("Canada"), Some("country_CA"));
        assert_eq!(map_country_to_region("Japan"), Some("country_JP"));
        assert_eq!(map_country_to_region("China"), Some("country_CN"));
        assert_eq!(map_country_to_region("Hong Kong"), Some("country_HK"));
        assert_eq!(map_country_to_region("Australia"), Some("country_AU"));
        assert_eq!(map_country_to_region("India"), Some("country_IN"));
        assert_eq!(map_country_to_region("Viet Nam"), Some("country_VN"));
        assert_eq!(map_country_to_region("Vietnam"), Some("country_VN"));
        assert_eq!(map_country_to_region("VN"), Some("country_VN"));

        // More countries to ensure we map to concrete country categories
        assert_eq!(map_country_to_region("United Kingdom"), Some("country_GB"));
        assert_eq!(map_country_to_region("Germany"), Some("country_DE"));
        assert_eq!(map_country_to_region("France"), Some("country_FR"));
        assert_eq!(map_country_to_region("Brazil"), Some("country_BR"));
        assert_eq!(map_country_to_region("Singapore"), Some("country_SG"));

        // Unknown
        assert_eq!(map_country_to_region("Unknown Country"), None);
    }

    #[test]
    fn test_parse_sectors_json() {
        let json = r#"[{"name":"Technology","weight":0.30},{"name":"Healthcare","weight":0.15}]"#;
        let input = ClassificationInput::from_provider_profile(
            None,
            None,
            None,
            None,
            Some(json),
            None,
            None,
            None,
        );
        assert_eq!(input.sectors.len(), 2);
        assert_eq!(input.sectors[0].name, "Technology");
        assert_eq!(input.sectors[0].weight, 0.30);
    }

    #[test]
    fn test_parse_single_sector() {
        // For stocks: single sector with 100% weight
        let input = ClassificationInput::from_provider_profile(
            Some("EQUITY"),
            Some("Apple Inc"),
            Some("AAPL"),
            Some("Technology"),
            None, // no sectors JSON
            Some("United States"),
            None, // no countries JSON
            None, // no exchange_mic
        );
        assert_eq!(input.sectors.len(), 1);
        assert_eq!(input.sectors[0].name, "Technology");
        assert_eq!(input.sectors[0].weight, 1.0);
        assert_eq!(input.country, Some("United States".to_string()));
    }

    #[test]
    fn test_exchange_mic_fallback_for_country() {
        // For ETFs: no country from provider, use exchange MIC
        let input = ClassificationInput::from_provider_profile(
            Some("ETF"),
            Some("Vanguard FTSE Canada ETF"),
            Some("VFV.TO"),
            None,
            None,
            None,         // no country from provider
            None,         // no countries JSON
            Some("XTSE"), // Canadian exchange
        );
        assert_eq!(input.country, Some("Canada".to_string()));
    }

    #[test]
    fn test_symbol_fallback_for_country() {
        let input = ClassificationInput::from_provider_profile(
            Some("MUTUALFUND"),
            Some("华泰柏瑞沪深300ETF"),
            Some("510300.SH"),
            None,
            None,
            None,
            None,
            None,
        );
        assert_eq!(input.country, Some("China".to_string()));
    }

    #[test]
    fn test_infer_asset_class_for_bond_fund_name() {
        let input = ClassificationInput::from_provider_profile(
            Some("MUTUALFUND"),
            Some("Global Treasury Bond Fund"),
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert_eq!(infer_asset_class(&input), Some("FIXED_INCOME"));
    }

    #[test]
    fn test_infer_asset_class_for_short_cn_bond_name() {
        let input = ClassificationInput::from_provider_profile(
            Some("MUTUALFUND"),
            Some("平安增利六个月定开债A"),
            Some("008690"),
            None,
            None,
            None,
            None,
            None,
        );

        assert_eq!(infer_asset_class(&input), Some("FIXED_INCOME"));
    }

    #[test]
    fn test_infer_asset_class_does_not_match_muni_substring() {
        let input = ClassificationInput::from_provider_profile(
            Some("ETF"),
            Some("Vanguard Total Stock Market ETF"),
            Some("VTI"),
            None,
            Some(r#"[{"name":"Communication Services","weight":1.0}]"#),
            None,
            None,
            None,
        );

        assert_eq!(infer_asset_class(&input), Some("EQUITY"));
    }

    #[test]
    fn test_infer_country_from_name() {
        assert_eq!(
            infer_country_from_name("SP500 Index ETF"),
            Some("United States")
        );
        assert_eq!(
            infer_country_from_name("博时标普500ETF联接A"),
            Some("United States")
        );
        assert_eq!(infer_country_from_name("India Equity ETF"), Some("India"));
        assert_eq!(
            infer_country_from_name("华夏恒生ETF(QDII)"),
            Some("Hong Kong")
        );
        assert_eq!(
            infer_country_from_name("华安德国(DAX)联接(QDII)A"),
            Some("Germany")
        );
        assert_eq!(
            infer_country_from_name("Viet Nam Opportunity Fund"),
            Some("Viet Nam")
        );
    }

    #[test]
    fn test_infer_country_from_symbol() {
        assert_eq!(infer_country_from_symbol("510300.SH"), Some("China"));
        assert_eq!(infer_country_from_symbol("159920"), Some("China"));
        assert_eq!(infer_country_from_symbol("000614.FUND"), Some("China"));
        assert_eq!(infer_country_from_symbol("0700.HK"), Some("Hong Kong"));
        assert_eq!(infer_country_from_symbol("VTI"), None);
    }
}
