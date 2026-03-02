//! Provider settings models and types.
//!
//! This module contains types for managing market data provider settings,
//! including configuration, capabilities, and status information.

use serde::{Deserialize, Serialize};

/// Information about a market data provider's sync status.
#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MarketDataProviderInfo {
    pub id: String,
    pub name: String,
    pub logo_filename: String,
    pub last_synced_date: Option<chrono::DateTime<chrono::Utc>>,
}

/// Domain model for market data provider settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketDataProviderSetting {
    pub id: String,
    pub name: String,
    pub description: String,
    pub url: Option<String>,
    pub priority: i32,
    pub enabled: bool,
    pub logo_filename: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_error: Option<String>,
    /// Provider capabilities (populated from provider implementation)
    pub capabilities: Option<ProviderCapabilities>,
}

/// Provider capabilities - what a provider supports.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    /// Supported instrument types (e.g., "Stocks", "Crypto", "Forex", "Metals")
    pub instruments: String,
    /// Market coverage (e.g., "Global", "US only")
    pub coverage: String,
    /// Supported features (e.g., ["Real-time", "Historical", "Search"])
    pub features: Vec<String>,
}

impl ProviderCapabilities {
    /// Get capabilities for a provider by ID.
    pub fn for_provider(provider_id: &str) -> Option<Self> {
        match provider_id {
            "YAHOO" => Some(Self {
                instruments: "Stocks • Crypto • Forex • Metals".to_string(),
                coverage: "Global".to_string(),
                features: vec![
                    "Real-time".to_string(),
                    "Historical".to_string(),
                    "Search".to_string(),
                    "Profiles".to_string(),
                ],
            }),
            "MARKETDATA_APP" => Some(Self {
                instruments: "Stocks".to_string(),
                coverage: "US only".to_string(),
                features: vec!["Real-time".to_string(), "Historical".to_string()],
            }),
            "ALPHA_VANTAGE" => Some(Self {
                instruments: "Stocks • Crypto • Forex".to_string(),
                coverage: "Global".to_string(),
                features: vec![
                    "Real-time".to_string(),
                    "Historical".to_string(),
                    "Search".to_string(),
                    "Profiles".to_string(),
                ],
            }),
            "METAL_PRICE_API" => Some(Self {
                instruments: "Metals".to_string(),
                coverage: "USD only".to_string(),
                features: vec!["Real-time".to_string()],
            }),
            "FINNHUB" => Some(Self {
                instruments: "Stocks".to_string(),
                coverage: "Global".to_string(),
                features: vec![
                    "Real-time".to_string(),
                    "Historical".to_string(),
                    "Search".to_string(),
                    "Profiles".to_string(),
                ],
            }),
            "EASTMONEY_CN" => Some(Self {
                instruments: "CN Stocks • ETFs".to_string(),
                coverage: "Mainland China".to_string(),
                features: vec![
                    "Real-time".to_string(),
                    "Historical".to_string(),
                    "Search".to_string(),
                    "Profiles".to_string(),
                ],
            }),
            "TIANTIAN_FUND" => Some(Self {
                instruments: "CN Mutual Funds".to_string(),
                coverage: "China funds".to_string(),
                features: vec![
                    "Real-time".to_string(),
                    "Historical".to_string(),
                    "Search".to_string(),
                    "Profiles".to_string(),
                ],
            }),
            _ => None,
        }
    }
}

/// Update model for market data provider settings.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateMarketDataProviderSetting {
    pub priority: Option<i32>,
    pub enabled: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::ProviderCapabilities;

    #[test]
    fn test_provider_capabilities_include_panorama_providers() {
        let eastmoney =
            ProviderCapabilities::for_provider("EASTMONEY_CN").expect("missing EASTMONEY_CN caps");
        assert!(eastmoney.instruments.contains("CN"));
        assert!(eastmoney.features.iter().any(|feature| feature == "Historical"));
        assert!(eastmoney.features.iter().any(|feature| feature == "Search"));
        assert!(eastmoney.features.iter().any(|feature| feature == "Profiles"));

        let tiantian =
            ProviderCapabilities::for_provider("TIANTIAN_FUND").expect("missing TIANTIAN_FUND caps");
        assert!(tiantian.instruments.contains("Funds"));
        assert!(tiantian.coverage.contains("China"));
        assert!(tiantian.features.iter().any(|feature| feature == "Search"));
        assert!(tiantian.features.iter().any(|feature| feature == "Profiles"));
    }
}
