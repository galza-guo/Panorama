//! Tests for asset domain models.

#[cfg(test)]
mod tests {
    use crate::assets::{
        canonicalize_market_identity, default_market_data_provider_id,
        resolve_quote_ccy_precedence, Asset, AssetKind, InstrumentId, InstrumentType, NewAsset,
        OptionSpec, ProviderProfile, QuoteCcyResolutionSource, QuoteMode,
    };
    use chrono::NaiveDateTime;
    use rust_decimal_macros::dec;
    use serde_json::json;

    // Test AssetKind enum
    #[test]
    fn test_asset_kind_serialization() {
        let kind = AssetKind::Investment;
        let json = serde_json::to_string(&kind).unwrap();
        assert_eq!(json, "\"INVESTMENT\"");
    }

    #[test]
    fn test_asset_kind_serialization_all_variants() {
        assert_eq!(
            serde_json::to_string(&AssetKind::Investment).unwrap(),
            "\"INVESTMENT\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Property).unwrap(),
            "\"PROPERTY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Vehicle).unwrap(),
            "\"VEHICLE\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Collectible).unwrap(),
            "\"COLLECTIBLE\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::PreciousMetal).unwrap(),
            "\"PRECIOUS_METAL\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::PrivateEquity).unwrap(),
            "\"PRIVATE_EQUITY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Liability).unwrap(),
            "\"LIABILITY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Other).unwrap(),
            "\"OTHER\""
        );
        assert_eq!(serde_json::to_string(&AssetKind::Fx).unwrap(), "\"FX\"");
    }

    #[test]
    fn test_asset_kind_deserialization() {
        let kind: AssetKind = serde_json::from_str("\"INVESTMENT\"").unwrap();
        assert_eq!(kind, AssetKind::Investment);
    }

    #[test]
    fn test_asset_kind_deserialization_all_variants() {
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"INVESTMENT\"").unwrap(),
            AssetKind::Investment
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"PROPERTY\"").unwrap(),
            AssetKind::Property
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"VEHICLE\"").unwrap(),
            AssetKind::Vehicle
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"COLLECTIBLE\"").unwrap(),
            AssetKind::Collectible
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"PRECIOUS_METAL\"").unwrap(),
            AssetKind::PreciousMetal
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"PRIVATE_EQUITY\"").unwrap(),
            AssetKind::PrivateEquity
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"LIABILITY\"").unwrap(),
            AssetKind::Liability
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"OTHER\"").unwrap(),
            AssetKind::Other
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"FX\"").unwrap(),
            AssetKind::Fx
        );
    }

    #[test]
    fn test_asset_kind_default() {
        let kind = AssetKind::default();
        assert_eq!(kind, AssetKind::Investment);
    }

    // Test is_holdable method
    #[test]
    fn test_is_holdable_investment() {
        let asset = create_test_asset(AssetKind::Investment);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_fx() {
        let asset = create_test_asset(AssetKind::Fx);
        assert!(!asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_property() {
        let asset = create_test_asset(AssetKind::Property);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_liability() {
        let asset = create_test_asset(AssetKind::Liability);
        assert!(asset.is_holdable());
    }

    // Test needs_pricing method
    #[test]
    fn test_needs_pricing_market() {
        let asset = create_test_asset(AssetKind::Investment);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_manual() {
        let mut asset = create_test_asset(AssetKind::Property);
        asset.quote_mode = QuoteMode::Manual;
        assert!(!asset.needs_pricing());
    }

    // Test is_alternative
    #[test]
    fn test_is_alternative() {
        assert!(AssetKind::Property.is_alternative());
        assert!(AssetKind::Vehicle.is_alternative());
        assert!(AssetKind::Collectible.is_alternative());
        assert!(AssetKind::PreciousMetal.is_alternative());
        assert!(AssetKind::Liability.is_alternative());
        assert!(AssetKind::Other.is_alternative());
        assert!(!AssetKind::Investment.is_alternative());
        assert!(!AssetKind::Fx.is_alternative());
        assert!(!AssetKind::PrivateEquity.is_alternative());
    }

    // Test is_investment
    #[test]
    fn test_is_investment() {
        assert!(AssetKind::Investment.is_investment());
        assert!(AssetKind::PrivateEquity.is_investment());
        assert!(!AssetKind::Property.is_investment());
        assert!(!AssetKind::Fx.is_investment());
    }

    // Test option_spec method
    #[test]
    fn test_option_spec_non_option_asset() {
        let asset = create_test_asset(AssetKind::Investment);
        assert!(asset.option_spec().is_none());
    }

    #[test]
    fn test_option_spec_option_with_metadata() {
        let mut asset = create_test_asset(AssetKind::Investment);
        asset.instrument_type = Some(InstrumentType::Option);
        asset.metadata = Some(json!({
            "option": {
                "underlyingAssetId": "AAPL",
                "expiration": "2024-12-20",
                "right": "CALL",
                "strike": "150.00",
                "multiplier": "100",
                "occSymbol": "AAPL241220C00150000"
            }
        }));

        let spec = asset.option_spec();
        assert!(spec.is_some());
        let spec = spec.unwrap();
        assert_eq!(spec.underlying_asset_id, "AAPL");
        assert_eq!(spec.right, "CALL");
        assert_eq!(spec.strike, dec!(150.00));
        assert_eq!(spec.multiplier, dec!(100));
    }

    // Test OptionSpec serialization
    #[test]
    fn test_option_spec_serialization() {
        let spec = OptionSpec {
            underlying_asset_id: "AAPL".to_string(),
            expiration: chrono::NaiveDate::from_ymd_opt(2024, 12, 20).unwrap(),
            right: "CALL".to_string(),
            strike: dec!(150.00),
            multiplier: dec!(100),
            occ_symbol: Some("AAPL241220C00150000".to_string()),
        };

        let json = serde_json::to_string(&spec).unwrap();
        assert!(json.contains("\"underlyingAssetId\":\"AAPL\""));
        assert!(json.contains("\"right\":\"CALL\""));
    }

    #[test]
    fn test_to_instrument_id_repairs_legacy_panorama_cn_equity_symbol() {
        let mut asset = create_test_asset(AssetKind::Investment);
        asset.instrument_type = Some(InstrumentType::Equity);
        asset.instrument_symbol = Some("510300.SH".to_string());
        asset.instrument_exchange_mic = None;

        let instrument = asset.to_instrument_id();

        match instrument {
            Some(InstrumentId::Equity { ticker, mic }) => {
                assert_eq!(ticker.as_ref(), "510300");
                assert_eq!(mic.as_deref(), Some("XSHG"));
            }
            other => panic!("Expected equity instrument, got {other:?}"),
        }
    }

    #[test]
    fn test_to_instrument_id_repairs_legacy_panorama_fund_symbol() {
        let mut asset = create_test_asset(AssetKind::Investment);
        asset.instrument_type = Some(InstrumentType::Equity);
        asset.instrument_symbol = Some("004235.FUND".to_string());
        asset.instrument_exchange_mic = None;

        let instrument = asset.to_instrument_id();

        match instrument {
            Some(InstrumentId::Equity { ticker, mic }) => {
                assert_eq!(ticker.as_ref(), "004235");
                assert_eq!(mic, None);
            }
            other => panic!("Expected equity instrument, got {other:?}"),
        }
    }

    #[test]
    fn test_to_instrument_id_falls_back_to_legacy_display_code() {
        let mut asset = create_test_asset(AssetKind::Investment);
        asset.instrument_type = Some(InstrumentType::Equity);
        asset.instrument_symbol = None;
        asset.display_code = Some("004235.FUND".to_string());
        asset.instrument_exchange_mic = None;

        let instrument = asset.to_instrument_id();

        match instrument {
            Some(InstrumentId::Equity { ticker, mic }) => {
                assert_eq!(ticker.as_ref(), "004235");
                assert_eq!(mic, None);
            }
            other => panic!("Expected equity instrument, got {other:?}"),
        }
    }

    #[test]
    fn test_to_instrument_id_infers_equity_for_legacy_market_fund() {
        let mut asset = create_test_asset(AssetKind::Investment);
        asset.instrument_type = None;
        asset.instrument_symbol = None;
        asset.display_code = Some("004235.FUND".to_string());
        asset.instrument_exchange_mic = None;
        asset.provider_config = Some(json!({
            "preferred_provider": "TIANTIAN_FUND"
        }));

        let instrument = asset.to_instrument_id();

        match instrument {
            Some(InstrumentId::Equity { ticker, mic }) => {
                assert_eq!(ticker.as_ref(), "004235");
                assert_eq!(mic, None);
            }
            other => panic!("Expected equity instrument, got {other:?}"),
        }
    }

    #[test]
    fn test_to_instrument_id_keeps_tiantian_bare_fund_code_off_exchange() {
        let mut asset = create_test_asset(AssetKind::Investment);
        asset.instrument_type = Some(InstrumentType::Equity);
        asset.instrument_symbol = Some("003095".to_string());
        asset.instrument_exchange_mic = None;
        asset.provider_config = Some(json!({
            "preferred_provider": "TIANTIAN_FUND"
        }));

        let instrument = asset.to_instrument_id();

        match instrument {
            Some(InstrumentId::Equity { ticker, mic }) => {
                assert_eq!(ticker.as_ref(), "003095");
                assert_eq!(mic, None);
            }
            other => panic!("Expected equity instrument, got {other:?}"),
        }
    }

    // Test InstrumentType
    #[test]
    fn test_instrument_type_db_roundtrip() {
        for inst_type in [
            InstrumentType::Equity,
            InstrumentType::Crypto,
            InstrumentType::Fx,
            InstrumentType::Option,
            InstrumentType::Metal,
        ] {
            let db_str = inst_type.as_db_str();
            let parsed = InstrumentType::from_db_str(db_str).unwrap();
            assert_eq!(parsed, inst_type);
        }
    }

    // Test AssetKind db roundtrip
    #[test]
    fn test_asset_kind_db_roundtrip() {
        for kind in [
            AssetKind::Investment,
            AssetKind::Property,
            AssetKind::Vehicle,
            AssetKind::Collectible,
            AssetKind::PreciousMetal,
            AssetKind::PrivateEquity,
            AssetKind::Liability,
            AssetKind::Other,
            AssetKind::Fx,
        ] {
            let db_str = kind.as_db_str();
            let parsed = AssetKind::from_db_str(db_str).unwrap();
            assert_eq!(parsed, kind);
        }
    }

    #[test]
    fn test_canonicalize_market_identity_equity_suffix() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Equity),
            Some("SHOP.TO"),
            None,
            Some("cad"),
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("SHOP"));
        assert_eq!(canonical.display_code.as_deref(), Some("SHOP"));
        assert_eq!(canonical.instrument_exchange_mic.as_deref(), Some("XTSE"));
        assert_eq!(canonical.quote_ccy.as_deref(), Some("CAD"));
    }

    #[test]
    fn test_canonicalize_market_identity_crypto_pair() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Crypto),
            Some("CRO-USD"),
            Some("XTSE"),
            None,
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("CRO"));
        assert_eq!(canonical.display_code.as_deref(), Some("CRO"));
        assert_eq!(canonical.instrument_exchange_mic, None);
        assert_eq!(canonical.quote_ccy.as_deref(), Some("USD"));
    }

    #[test]
    fn test_canonicalize_market_identity_fx_pair() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Fx),
            Some("eurusd=x"),
            None,
            Some("usd"),
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("EUR"));
        assert_eq!(canonical.display_code.as_deref(), Some("EUR/USD"));
        assert_eq!(canonical.quote_ccy.as_deref(), Some("USD"));
        assert_eq!(canonical.instrument_exchange_mic, None);
    }

    #[test]
    fn test_canonicalize_market_identity_preserves_minor_unit_code() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Equity),
            Some("AZN.L"),
            None,
            Some("GBp"),
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("AZN"));
        assert_eq!(canonical.instrument_exchange_mic.as_deref(), Some("XLON"));
        assert_eq!(canonical.quote_ccy.as_deref(), Some("GBp"));
    }

    #[test]
    fn test_canonicalize_market_identity_preserves_explicit_equity_quote_ccy() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Equity),
            Some("AZN"),
            Some("XLON"),
            Some("GBP"),
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("AZN"));
        assert_eq!(canonical.instrument_exchange_mic.as_deref(), Some("XLON"));
        assert_eq!(canonical.quote_ccy.as_deref(), Some("GBP"));
    }

    #[test]
    fn test_canonicalize_market_identity_uses_mic_currency_as_fallback() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Equity),
            Some("AZN"),
            Some("XLON"),
            None,
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("AZN"));
        assert_eq!(canonical.instrument_exchange_mic.as_deref(), Some("XLON"));
        assert_eq!(canonical.quote_ccy.as_deref(), Some("GBp"));
    }

    #[test]
    fn test_canonicalize_market_identity_supports_panorama_cn_equities() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Equity),
            Some("600519.SH"),
            None,
            None,
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("600519"));
        assert_eq!(canonical.display_code.as_deref(), Some("600519"));
        assert_eq!(canonical.instrument_exchange_mic.as_deref(), Some("XSHG"));
        assert_eq!(canonical.quote_ccy.as_deref(), Some("CNY"));
    }

    #[test]
    fn test_canonicalize_market_identity_supports_panorama_funds() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Equity),
            Some("161039.FUND"),
            None,
            None,
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("161039.FUND"));
        assert_eq!(canonical.display_code.as_deref(), Some("161039"));
        assert_eq!(canonical.instrument_exchange_mic, None);
        assert_eq!(canonical.quote_ccy.as_deref(), Some("CNY"));
    }

    #[test]
    fn test_default_market_data_provider_id_prefers_eastmoney_for_cn_equities() {
        assert_eq!(
            default_market_data_provider_id(
                Some(&InstrumentType::Equity),
                Some("600519.SH"),
                Some("XSHG")
            ),
            "EASTMONEY_CN"
        );
    }

    #[test]
    fn test_default_market_data_provider_id_prefers_tiantian_for_funds() {
        assert_eq!(
            default_market_data_provider_id(
                Some(&InstrumentType::Equity),
                Some("161039.FUND"),
                None
            ),
            "TIANTIAN_FUND"
        );
    }

    #[test]
    fn test_new_asset_from_tiantian_profile_appends_panorama_fund_suffix() {
        let profile = ProviderProfile {
            symbol: "003095".to_string(),
            currency: "cny".to_string(),
            data_source: "TIANTIAN_FUND".to_string(),
            ..Default::default()
        };

        let asset = NewAsset::from(profile);

        assert_eq!(asset.instrument_symbol.as_deref(), Some("003095.FUND"));
        assert_eq!(asset.display_code.as_deref(), Some("003095"));
        assert_eq!(asset.instrument_exchange_mic, None);
        assert_eq!(asset.quote_ccy, "CNY");
    }

    #[test]
    fn test_default_market_data_provider_id_falls_back_to_yahoo() {
        assert_eq!(
            default_market_data_provider_id(
                Some(&InstrumentType::Equity),
                Some("AAPL"),
                Some("XNAS")
            ),
            "YAHOO"
        );
    }

    #[test]
    fn test_resolve_quote_ccy_precedence_prefers_explicit_hint() {
        let resolved = resolve_quote_ccy_precedence(
            Some("GBp"),
            Some("GBP"),
            Some("USD"),
            Some("CAD"),
            Some("EUR"),
        );

        assert_eq!(
            resolved,
            Some(("GBp".to_string(), QuoteCcyResolutionSource::ExplicitHint))
        );
    }

    #[test]
    fn test_resolve_quote_ccy_precedence_uses_provider_before_mic() {
        let resolved =
            resolve_quote_ccy_precedence(None, None, Some("GBP"), Some("GBp"), Some("USD"));

        assert_eq!(
            resolved,
            Some(("GBP".to_string(), QuoteCcyResolutionSource::ProviderQuote))
        );
    }

    // Helper function
    fn create_test_asset(kind: AssetKind) -> Asset {
        let quote_mode = match kind {
            AssetKind::Investment | AssetKind::Fx => QuoteMode::Market,
            _ => QuoteMode::Market, // All kinds use Market by default in tests
        };

        Asset {
            id: "test-uuid".to_string(),
            kind,
            name: Some("Test Asset".to_string()),
            display_code: Some("TEST".to_string()),
            notes: None,
            metadata: None,
            is_active: true,
            quote_mode,
            quote_ccy: "USD".to_string(),
            instrument_type: None,
            instrument_symbol: None,
            instrument_exchange_mic: None,
            instrument_key: None,
            provider_config: None,
            exchange_name: None,
            created_at: NaiveDateTime::default(),
            updated_at: NaiveDateTime::default(),
        }
    }
}
