//! Domain models for local external account connectors.

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConnectorProvider {
    WebullHk,
}

impl ConnectorProvider {
    pub fn as_db_str(self) -> &'static str {
        match self {
            Self::WebullHk => "WEBULL_HK",
        }
    }
}

impl TryFrom<&str> for ConnectorProvider {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "WEBULL_HK" => Ok(Self::WebullHk),
            other => Err(format!("Unknown connector provider: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConnectorEnvironment {
    #[default]
    Sandbox,
    Production,
}

impl ConnectorEnvironment {
    pub fn as_db_str(self) -> &'static str {
        match self {
            Self::Sandbox => "SANDBOX",
            Self::Production => "PRODUCTION",
        }
    }
}

impl TryFrom<&str> for ConnectorEnvironment {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "SANDBOX" => Ok(Self::Sandbox),
            "PRODUCTION" => Ok(Self::Production),
            other => Err(format!("Unknown connector environment: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConnectorCapability {
    PortfolioSnapshotSync,
    OrderHistoryImport,
    FullActivityLedgerSync,
    Trading,
    MarketData,
    Streaming,
    Web3Wallet,
}

impl ConnectorCapability {
    pub fn as_db_str(self) -> &'static str {
        match self {
            Self::PortfolioSnapshotSync => "PORTFOLIO_SNAPSHOT_SYNC",
            Self::OrderHistoryImport => "ORDER_HISTORY_IMPORT",
            Self::FullActivityLedgerSync => "FULL_ACTIVITY_LEDGER_SYNC",
            Self::Trading => "TRADING",
            Self::MarketData => "MARKET_DATA",
            Self::Streaming => "STREAMING",
            Self::Web3Wallet => "WEB3_WALLET",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExternalConnectionStatus {
    #[default]
    Active,
    NeedsAuth,
    Paused,
    Failed,
}

impl ExternalConnectionStatus {
    pub fn as_db_str(self) -> &'static str {
        match self {
            Self::Active => "ACTIVE",
            Self::NeedsAuth => "NEEDS_AUTH",
            Self::Paused => "PAUSED",
            Self::Failed => "ERROR",
        }
    }
}

impl TryFrom<&str> for ExternalConnectionStatus {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "ACTIVE" => Ok(Self::Active),
            "NEEDS_AUTH" => Ok(Self::NeedsAuth),
            "PAUSED" => Ok(Self::Paused),
            "ERROR" => Ok(Self::Failed),
            other => Err(format!("Unknown external connection status: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExternalAccountLinkStatus {
    #[default]
    Active,
    Paused,
    Unlinked,
}

impl ExternalAccountLinkStatus {
    pub fn as_db_str(self) -> &'static str {
        match self {
            Self::Active => "ACTIVE",
            Self::Paused => "PAUSED",
            Self::Unlinked => "UNLINKED",
        }
    }
}

impl TryFrom<&str> for ExternalAccountLinkStatus {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "ACTIVE" => Ok(Self::Active),
            "PAUSED" => Ok(Self::Paused),
            "UNLINKED" => Ok(Self::Unlinked),
            other => Err(format!("Unknown external account link status: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExternalAccountSyncMode {
    #[default]
    Prospective,
}

impl ExternalAccountSyncMode {
    pub fn as_db_str(self) -> &'static str {
        match self {
            Self::Prospective => "PROSPECTIVE",
        }
    }
}

impl TryFrom<&str> for ExternalAccountSyncMode {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "PROSPECTIVE" => Ok(Self::Prospective),
            other => Err(format!("Unknown external account sync mode: {other}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalConnection {
    pub id: String,
    pub provider: ConnectorProvider,
    pub display_name: String,
    pub environment: ConnectorEnvironment,
    pub owner_name: Option<String>,
    pub status: ExternalConnectionStatus,
    pub capabilities: Vec<ConnectorCapability>,
    pub metadata_json: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewExternalConnection {
    pub id: Option<String>,
    pub provider: ConnectorProvider,
    pub display_name: String,
    #[serde(default)]
    pub environment: ConnectorEnvironment,
    pub owner_name: Option<String>,
    #[serde(default)]
    pub status: ExternalConnectionStatus,
    pub capabilities: Vec<ConnectorCapability>,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAccountLink {
    pub id: String,
    pub connection_id: String,
    pub provider: ConnectorProvider,
    pub remote_account_id: String,
    pub local_account_id: String,
    pub remote_account_number_masked: Option<String>,
    pub remote_account_type: Option<String>,
    pub linked_at: NaiveDateTime,
    pub source_from_date: NaiveDate,
    pub sync_mode: ExternalAccountSyncMode,
    pub status: ExternalAccountLinkStatus,
    pub metadata_json: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewExternalAccountLink {
    pub id: Option<String>,
    pub connection_id: String,
    pub provider: ConnectorProvider,
    pub remote_account_id: String,
    pub local_account_id: String,
    pub remote_account_number_masked: Option<String>,
    pub remote_account_type: Option<String>,
    pub source_from_date: NaiveDate,
    #[serde(default)]
    pub sync_mode: ExternalAccountSyncMode,
    #[serde(default)]
    pub status: ExternalAccountLinkStatus,
    pub metadata_json: Option<String>,
}
