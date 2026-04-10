//! Tests for manual snapshot service behavior.

#[cfg(test)]
mod tests {
    use crate::assets::{
        Asset, AssetMetadata, AssetProfileEnrichmentStats, AssetServiceTrait, AssetSpec,
        EnsureAssetsResult, NewAsset, ProviderProfile, UpdateAssetProfile,
    };
    use crate::errors::{Error, Result};
    use crate::fx::{ExchangeRate, FxServiceTrait, NewExchangeRate};
    use crate::portfolio::snapshot::{
        AccountStateSnapshot, ManualHoldingInput, ManualSnapshotRequest, ManualSnapshotService,
        SnapshotServiceTrait, SnapshotSource,
    };
    use crate::quotes::{
        LatestQuotePair, LatestQuoteSnapshot, ProviderInfo, Quote, QuoteImport, QuoteServiceTrait,
        QuoteSyncState, SymbolSearchResult, SymbolSyncPlan, SyncMode, SyncResult,
    };
    use async_trait::async_trait;
    use chrono::NaiveDate;
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::{HashMap, HashSet};
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct MockAssetService {
        assets: Arc<Mutex<HashMap<String, Asset>>>,
    }

    impl MockAssetService {
        fn with_assets(assets: Vec<Asset>) -> Self {
            let assets = assets
                .into_iter()
                .map(|asset| (asset.id.clone(), asset))
                .collect();
            Self {
                assets: Arc::new(Mutex::new(assets)),
            }
        }
    }

    #[async_trait]
    impl AssetServiceTrait for MockAssetService {
        fn get_assets(&self) -> Result<Vec<Asset>> {
            Ok(self.assets.lock().unwrap().values().cloned().collect())
        }

        fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset> {
            self.assets
                .lock()
                .unwrap()
                .get(asset_id)
                .cloned()
                .ok_or_else(|| Error::Unexpected(format!("Asset not found: {}", asset_id)))
        }

        async fn delete_asset(&self, _asset_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn update_asset_profile(
            &self,
            _asset_id: &str,
            _payload: UpdateAssetProfile,
        ) -> Result<Asset> {
            unimplemented!()
        }

        async fn create_asset(&self, _new_asset: NewAsset) -> Result<Asset> {
            unimplemented!()
        }

        async fn get_or_create_minimal_asset(
            &self,
            asset_id: &str,
            _context_currency: Option<String>,
            _metadata: Option<AssetMetadata>,
            _quote_mode_hint: Option<String>,
        ) -> Result<Asset> {
            self.get_asset_by_id(asset_id)
        }

        async fn update_quote_mode(&self, asset_id: &str, quote_mode: &str) -> Result<Asset> {
            let mut assets = self.assets.lock().unwrap();
            let asset = assets
                .get_mut(asset_id)
                .ok_or_else(|| Error::Unexpected(format!("Asset not found: {}", asset_id)))?;
            asset.quote_mode = if quote_mode == "MANUAL" {
                crate::assets::QuoteMode::Manual
            } else {
                crate::assets::QuoteMode::Market
            };
            Ok(asset.clone())
        }

        async fn get_assets_by_asset_ids(&self, asset_ids: &[String]) -> Result<Vec<Asset>> {
            Ok(asset_ids
                .iter()
                .filter_map(|asset_id| self.assets.lock().unwrap().get(asset_id).cloned())
                .collect())
        }

        async fn enrich_asset_profile(&self, _asset_id: &str) -> Result<Asset> {
            unimplemented!()
        }

        async fn enrich_assets(&self, _asset_ids: Vec<String>) -> Result<(usize, usize, usize)> {
            Ok((0, 0, 0))
        }

        async fn re_enrich_assets(
            &self,
            _asset_ids: Vec<String>,
        ) -> Result<AssetProfileEnrichmentStats> {
            Ok(AssetProfileEnrichmentStats::default())
        }

        async fn cleanup_legacy_metadata(&self, _asset_id: &str) -> Result<()> {
            Ok(())
        }

        async fn merge_unknown_asset(
            &self,
            _resolved_asset_id: &str,
            _unknown_asset_id: &str,
            _activity_repository: &dyn crate::activities::ActivityRepositoryTrait,
        ) -> Result<u32> {
            Ok(0)
        }

        async fn ensure_assets(
            &self,
            _specs: Vec<AssetSpec>,
            _activity_repository: &dyn crate::activities::ActivityRepositoryTrait,
        ) -> Result<EnsureAssetsResult> {
            Ok(EnsureAssetsResult::default())
        }
    }

    #[derive(Clone, Default)]
    struct MockFxService {
        rates: Arc<Mutex<HashMap<(String, String), Decimal>>>,
        registered_pairs: Arc<Mutex<HashSet<(String, String)>>>,
    }

    impl MockFxService {
        fn add_rate(&self, from: &str, to: &str, rate: Decimal) {
            self.rates
                .lock()
                .unwrap()
                .insert((from.to_string(), to.to_string()), rate);
        }
    }

    #[async_trait]
    impl FxServiceTrait for MockFxService {
        fn initialize(&self) -> Result<()> {
            Ok(())
        }

        fn get_historical_rates(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _days: i64,
        ) -> Result<Vec<ExchangeRate>> {
            unimplemented!()
        }

        fn get_latest_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<Decimal> {
            unimplemented!()
        }

        fn get_exchange_rate_for_date(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _date: NaiveDate,
        ) -> Result<Decimal> {
            unimplemented!()
        }

        fn convert_currency(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
        ) -> Result<Decimal> {
            if from_currency == to_currency {
                return Ok(amount);
            }

            self.rates
                .lock()
                .unwrap()
                .get(&(from_currency.to_string(), to_currency.to_string()))
                .copied()
                .map(|rate| amount * rate)
                .ok_or_else(|| {
                    Error::CurrencyConversionFailed(format!(
                        "Missing rate {}->{}",
                        from_currency, to_currency
                    ))
                })
        }

        fn convert_currency_for_date(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
            _date: NaiveDate,
        ) -> Result<Decimal> {
            self.convert_currency(amount, from_currency, to_currency)
        }

        fn get_latest_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
            Ok(vec![])
        }

        async fn add_exchange_rate(&self, _new_rate: NewExchangeRate) -> Result<ExchangeRate> {
            unimplemented!()
        }

        async fn update_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _rate: Decimal,
        ) -> Result<ExchangeRate> {
            unimplemented!()
        }

        async fn delete_exchange_rate(&self, _rate_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn register_currency_pair(
            &self,
            from_currency: &str,
            to_currency: &str,
        ) -> Result<()> {
            self.registered_pairs
                .lock()
                .unwrap()
                .insert((from_currency.to_string(), to_currency.to_string()));
            Ok(())
        }

        async fn register_currency_pair_manual(
            &self,
            from_currency: &str,
            to_currency: &str,
        ) -> Result<()> {
            self.register_currency_pair(from_currency, to_currency)
                .await
        }

        async fn ensure_fx_pairs(&self, pairs: Vec<(String, String)>) -> Result<()> {
            let mut registered_pairs = self.registered_pairs.lock().unwrap();
            for pair in pairs {
                registered_pairs.insert(pair);
            }
            Ok(())
        }
    }

    #[derive(Clone, Default)]
    struct MockSnapshotService {
        saved_snapshots: Arc<Mutex<Vec<AccountStateSnapshot>>>,
    }

    impl MockSnapshotService {
        fn saved_snapshots(&self) -> Vec<AccountStateSnapshot> {
            self.saved_snapshots.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl SnapshotServiceTrait for MockSnapshotService {
        async fn calculate_holdings_snapshots(
            &self,
            _account_ids: Option<&[String]>,
        ) -> Result<usize> {
            unimplemented!()
        }

        async fn force_recalculate_holdings_snapshots(
            &self,
            _account_ids: Option<&[String]>,
        ) -> Result<usize> {
            unimplemented!()
        }

        fn get_holdings_keyframes(
            &self,
            _account_id: &str,
            _start_date: Option<NaiveDate>,
            _end_date: Option<NaiveDate>,
        ) -> Result<Vec<AccountStateSnapshot>> {
            unimplemented!()
        }

        fn get_daily_holdings_snapshots(
            &self,
            _account_id: &str,
            _start_date: Option<NaiveDate>,
            _end_date: Option<NaiveDate>,
        ) -> Result<Vec<AccountStateSnapshot>> {
            unimplemented!()
        }

        fn get_latest_holdings_snapshot(
            &self,
            _account_id: &str,
        ) -> Result<Option<AccountStateSnapshot>> {
            Ok(None)
        }

        async fn calculate_total_portfolio_snapshots(&self) -> Result<usize> {
            unimplemented!()
        }

        async fn force_recalculate_total_portfolio_snapshots(&self) -> Result<usize> {
            unimplemented!()
        }

        async fn save_manual_snapshot(
            &self,
            _account_id: &str,
            snapshot: AccountStateSnapshot,
        ) -> Result<()> {
            self.saved_snapshots.lock().unwrap().push(snapshot);
            Ok(())
        }

        async fn update_snapshots_source(
            &self,
            _account_id: &str,
            _new_source: &str,
        ) -> Result<usize> {
            unimplemented!()
        }

        async fn ensure_holdings_history(&self, _account_id: &str) -> Result<()> {
            Ok(())
        }
    }

    #[derive(Clone, Default)]
    struct MockQuoteService;

    #[async_trait]
    impl QuoteServiceTrait for MockQuoteService {
        fn get_latest_quote(&self, _symbol: &str) -> Result<Quote> {
            unimplemented!()
        }

        fn get_latest_quotes(&self, _symbols: &[String]) -> Result<HashMap<String, Quote>> {
            unimplemented!()
        }

        fn get_latest_quotes_snapshot(
            &self,
            _asset_ids: &[String],
        ) -> Result<HashMap<String, LatestQuoteSnapshot>> {
            unimplemented!()
        }

        fn get_latest_quotes_pair(
            &self,
            _symbols: &[String],
        ) -> Result<HashMap<String, LatestQuotePair>> {
            unimplemented!()
        }

        fn get_historical_quotes(&self, _symbol: &str) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        fn get_all_historical_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>> {
            unimplemented!()
        }

        fn get_quotes_in_range(
            &self,
            _symbols: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        fn get_quotes_in_range_filled(
            &self,
            _symbols: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn get_daily_quotes(
            &self,
            _asset_ids: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>> {
            unimplemented!()
        }

        async fn add_quote(&self, _quote: &Quote) -> Result<Quote> {
            unimplemented!()
        }

        async fn update_quote(&self, quote: Quote) -> Result<Quote> {
            Ok(quote)
        }

        async fn delete_quote(&self, _quote_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn bulk_upsert_quotes(&self, _quotes: Vec<Quote>) -> Result<usize> {
            unimplemented!()
        }

        async fn search_symbol(&self, _query: &str) -> Result<Vec<SymbolSearchResult>> {
            unimplemented!()
        }

        async fn search_symbol_with_currency(
            &self,
            _query: &str,
            _account_currency: Option<&str>,
        ) -> Result<Vec<SymbolSearchResult>> {
            Ok(vec![])
        }

        async fn get_asset_profile(&self, _asset: &Asset) -> Result<ProviderProfile> {
            unimplemented!()
        }

        async fn fetch_quotes_from_provider(
            &self,
            _asset_id: &str,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn fetch_quotes_for_symbol(
            &self,
            _asset_id: &str,
            _currency: &str,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn sync(
            &self,
            _mode: SyncMode,
            _asset_ids: Option<Vec<String>>,
        ) -> Result<SyncResult> {
            unimplemented!()
        }

        async fn resync(&self, _asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
            unimplemented!()
        }

        async fn refresh_sync_state(&self) -> Result<()> {
            unimplemented!()
        }

        fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>> {
            unimplemented!()
        }

        async fn handle_activity_created(
            &self,
            _symbol: &str,
            _activity_date: NaiveDate,
        ) -> Result<()> {
            Ok(())
        }

        async fn handle_activity_deleted(&self, _symbol: &str) -> Result<()> {
            Ok(())
        }

        async fn delete_sync_state(&self, _symbol: &str) -> Result<()> {
            Ok(())
        }

        fn get_symbols_needing_sync(&self) -> Result<Vec<QuoteSyncState>> {
            Ok(vec![])
        }

        fn get_sync_state(&self, _symbol: &str) -> Result<Option<QuoteSyncState>> {
            Ok(None)
        }

        async fn mark_profile_enriched(&self, _symbol: &str) -> Result<()> {
            Ok(())
        }

        fn get_assets_needing_profile_enrichment(&self) -> Result<Vec<QuoteSyncState>> {
            Ok(vec![])
        }

        async fn update_position_status_from_holdings(
            &self,
            _current_holdings: &HashMap<String, Decimal>,
        ) -> Result<()> {
            Ok(())
        }

        fn get_sync_states_with_errors(&self) -> Result<Vec<QuoteSyncState>> {
            Ok(vec![])
        }

        async fn get_providers_info(&self) -> Result<Vec<ProviderInfo>> {
            Ok(vec![])
        }

        async fn update_provider_settings(
            &self,
            _provider_id: &str,
            _priority: i32,
            _enabled: bool,
        ) -> Result<()> {
            Ok(())
        }

        async fn check_quotes_import(
            &self,
            _content: &[u8],
            _has_header_row: bool,
        ) -> Result<Vec<QuoteImport>> {
            Ok(vec![])
        }

        async fn import_quotes(
            &self,
            quotes: Vec<QuoteImport>,
            _overwrite: bool,
        ) -> Result<Vec<QuoteImport>> {
            Ok(quotes)
        }
    }

    fn sample_asset(asset_id: &str, currency: &str) -> Asset {
        let mut asset = Asset::default();
        asset.id = asset_id.to_string();
        asset.quote_ccy = currency.to_string();
        asset
    }

    #[tokio::test]
    async fn save_manual_snapshot_converts_mixed_currency_cost_basis_to_account_currency() {
        let asset_service = Arc::new(MockAssetService::with_assets(vec![
            sample_asset("asset-usd", "USD"),
            sample_asset("asset-hkd", "HKD"),
        ]));
        let fx_service = Arc::new(MockFxService::default());
        fx_service.add_rate("HKD", "USD", dec!(0.1));
        let snapshot_service = Arc::new(MockSnapshotService::default());
        let quote_service = Arc::new(MockQuoteService);

        let service = ManualSnapshotService::new(
            asset_service,
            fx_service,
            snapshot_service.clone(),
            quote_service,
        );

        service
            .save_manual_snapshot(ManualSnapshotRequest {
                account_id: "account-1".to_string(),
                account_currency: "USD".to_string(),
                snapshot_date: NaiveDate::from_ymd_opt(2026, 4, 3).unwrap(),
                positions: vec![
                    ManualHoldingInput {
                        asset_id: Some("asset-usd".to_string()),
                        symbol: "USDPOS".to_string(),
                        exchange_mic: None,
                        quantity: dec!(10),
                        currency: "USD".to_string(),
                        average_cost: dec!(10),
                        name: None,
                        data_source: None,
                        asset_kind: None,
                    },
                    ManualHoldingInput {
                        asset_id: Some("asset-hkd".to_string()),
                        symbol: "HKDPOS".to_string(),
                        exchange_mic: None,
                        quantity: dec!(10),
                        currency: "HKD".to_string(),
                        average_cost: dec!(20),
                        name: None,
                        data_source: None,
                        asset_kind: None,
                    },
                ],
                cash_balances: vec![],
                base_currency: None,
                source: SnapshotSource::ManualEntry,
            })
            .await
            .unwrap();

        let saved_snapshot = snapshot_service.saved_snapshots().pop().unwrap();

        assert_eq!(
            saved_snapshot.positions["asset-usd"].total_cost_basis,
            dec!(100)
        );
        assert_eq!(
            saved_snapshot.positions["asset-hkd"].total_cost_basis,
            dec!(200)
        );
        assert_eq!(saved_snapshot.cost_basis, dec!(120));
    }
}
