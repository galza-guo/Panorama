use chrono::NaiveDate;

use super::{
    ConnectorCapability, ConnectorEnvironment, ConnectorProvider, ExternalAccountLinkStatus,
    ExternalAccountSyncMode,
};

#[test]
fn connector_provider_serializes_as_screaming_snake_case() {
    let serialized = serde_json::to_string(&ConnectorProvider::WebullHk).unwrap();

    assert_eq!(serialized, "\"WEBULL_HK\"");
}

#[test]
fn connector_capabilities_serialize_as_screaming_snake_case() {
    let capabilities = vec![
        ConnectorCapability::PortfolioSnapshotSync,
        ConnectorCapability::OrderHistoryImport,
        ConnectorCapability::MarketData,
    ];

    let serialized = serde_json::to_string(&capabilities).unwrap();

    assert_eq!(
        serialized,
        "[\"PORTFOLIO_SNAPSHOT_SYNC\",\"ORDER_HISTORY_IMPORT\",\"MARKET_DATA\"]"
    );
}

#[test]
fn connector_environment_defaults_to_sandbox() {
    assert_eq!(
        ConnectorEnvironment::default(),
        ConnectorEnvironment::Sandbox
    );
}

#[test]
fn account_link_defaults_to_prospective_active_sync() {
    assert_eq!(
        ExternalAccountLinkStatus::default(),
        ExternalAccountLinkStatus::Active
    );
    assert_eq!(
        ExternalAccountSyncMode::default(),
        ExternalAccountSyncMode::Prospective
    );
}

#[test]
fn prospective_sync_uses_link_date_as_source_start() {
    let source_from_date = NaiveDate::from_ymd_opt(2026, 5, 27).unwrap();

    assert_eq!(source_from_date.to_string(), "2026-05-27");
}
