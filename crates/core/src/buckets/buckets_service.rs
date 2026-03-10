use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_trait::async_trait;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use crate::accounts::AccountRepositoryTrait;
use crate::assets::{AssetKind, AssetRepositoryTrait};
use crate::constants::{DISPLAY_DECIMAL_PRECISION, PORTFOLIO_TOTAL_ACCOUNT_ID};
use crate::errors::{DatabaseError, Result, ValidationError};
use crate::fx::currency::normalize_amount;
use crate::fx::FxServiceTrait;
use crate::portfolio::holdings::{Holding, HoldingType, HoldingsServiceTrait};
use crate::quotes::QuoteServiceTrait;

use super::{
    Bucket, BucketAccountDefault, BucketAllocation, BucketAllocationItem, BucketAssetAssignment,
    BucketHoldingOverride, BucketRepositoryTrait, BucketsServiceTrait, NewBucket,
    NewBucketAccountDefault, NewBucketAssetAssignment, NewBucketHoldingOverride,
    UNASSIGNED_BUCKET_ID,
};

pub struct BucketsService {
    repository: Arc<dyn BucketRepositoryTrait>,
    account_repository: Arc<dyn AccountRepositoryTrait>,
    holdings_service: Arc<dyn HoldingsServiceTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
    quote_service: Arc<dyn QuoteServiceTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

impl BucketsService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        repository: Arc<dyn BucketRepositoryTrait>,
        account_repository: Arc<dyn AccountRepositoryTrait>,
        holdings_service: Arc<dyn HoldingsServiceTrait>,
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        quote_service: Arc<dyn QuoteServiceTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        Self {
            repository,
            account_repository,
            holdings_service,
            asset_repository,
            quote_service,
            fx_service,
        }
    }

    fn validate_bucket_fields(
        name: &str,
        color: &str,
        target_percent: Option<&Decimal>,
    ) -> Result<()> {
        if name.trim().is_empty() {
            return Err(ValidationError::InvalidInput("Bucket name is required".to_string()).into());
        }

        if color.trim().is_empty() {
            return Err(
                ValidationError::InvalidInput("Bucket color is required".to_string()).into(),
            );
        }

        if let Some(target_percent) = target_percent {
            if *target_percent < Decimal::ZERO || *target_percent > dec!(100) {
                return Err(ValidationError::InvalidInput(
                    "Bucket target percent must be between 0 and 100".to_string(),
                )
                .into());
            }
        }

        Ok(())
    }

    fn normalize_bucket_id(bucket_id: &str, valid_bucket_ids: &HashSet<String>) -> String {
        if valid_bucket_ids.contains(bucket_id) {
            bucket_id.to_string()
        } else {
            UNASSIGNED_BUCKET_ID.to_string()
        }
    }

    async fn load_portfolio_holdings(
        &self,
        account_id: &str,
        base_currency: &str,
    ) -> Result<Vec<Holding>> {
        if account_id != PORTFOLIO_TOTAL_ACCOUNT_ID {
            return self.holdings_service.get_holdings(account_id, base_currency).await;
        }

        let accounts = self.account_repository.list(None, Some(false), None)?;
        let mut holdings = Vec::new();

        for account in accounts {
            holdings.extend(
                self.holdings_service
                    .get_holdings(&account.id, base_currency)
                    .await?,
            );
        }

        Ok(holdings)
    }
}

#[async_trait]
impl BucketsServiceTrait for BucketsService {
    fn list_buckets(&self) -> Result<Vec<Bucket>> {
        self.repository.list_buckets()
    }

    fn get_bucket(&self, id: &str) -> Result<Option<Bucket>> {
        self.repository.get_bucket(id)
    }

    async fn create_bucket(&self, bucket: NewBucket) -> Result<Bucket> {
        Self::validate_bucket_fields(&bucket.name, &bucket.color, bucket.target_percent.as_ref())?;
        self.repository.create_bucket(bucket).await
    }

    async fn update_bucket(&self, bucket: Bucket) -> Result<Bucket> {
        if bucket.is_system {
            return Err(ValidationError::InvalidInput(
                "System buckets cannot be edited".to_string(),
            )
            .into());
        }

        Self::validate_bucket_fields(&bucket.name, &bucket.color, bucket.target_percent.as_ref())?;
        self.repository.update_bucket(bucket).await
    }

    async fn delete_bucket(&self, id: &str) -> Result<usize> {
        let bucket = self
            .repository
            .get_bucket(id)?
            .ok_or_else(|| DatabaseError::NotFound(format!("Bucket not found: {id}")))?;

        if bucket.is_system || bucket.id == UNASSIGNED_BUCKET_ID {
            return Err(ValidationError::InvalidInput(
                "System buckets cannot be deleted".to_string(),
            )
            .into());
        }

        self.repository.delete_bucket(id).await
    }

    fn list_account_defaults(&self) -> Result<Vec<BucketAccountDefault>> {
        self.repository.list_account_defaults()
    }

    async fn assign_account_default(
        &self,
        assignment: NewBucketAccountDefault,
    ) -> Result<BucketAccountDefault> {
        if self.repository.get_bucket(&assignment.bucket_id)?.is_none() {
            return Err(DatabaseError::NotFound(format!(
                "Bucket not found: {}",
                assignment.bucket_id
            ))
            .into());
        }

        self.repository.upsert_account_default(assignment).await
    }

    async fn remove_account_default(&self, account_id: &str) -> Result<usize> {
        self.repository.delete_account_default(account_id).await
    }

    fn list_holding_overrides(&self) -> Result<Vec<BucketHoldingOverride>> {
        self.repository.list_holding_overrides()
    }

    async fn assign_holding_override(
        &self,
        assignment: NewBucketHoldingOverride,
    ) -> Result<BucketHoldingOverride> {
        if self.repository.get_bucket(&assignment.bucket_id)?.is_none() {
            return Err(DatabaseError::NotFound(format!(
                "Bucket not found: {}",
                assignment.bucket_id
            ))
            .into());
        }

        self.repository.upsert_holding_override(assignment).await
    }

    async fn remove_holding_override(&self, account_id: &str, asset_id: &str) -> Result<usize> {
        self.repository
            .delete_holding_override(account_id, asset_id)
            .await
    }

    fn list_asset_assignments(&self) -> Result<Vec<BucketAssetAssignment>> {
        self.repository.list_asset_assignments()
    }

    async fn assign_asset(
        &self,
        assignment: NewBucketAssetAssignment,
    ) -> Result<BucketAssetAssignment> {
        if self.repository.get_bucket(&assignment.bucket_id)?.is_none() {
            return Err(DatabaseError::NotFound(format!(
                "Bucket not found: {}",
                assignment.bucket_id
            ))
            .into());
        }

        self.repository.upsert_asset_assignment(assignment).await
    }

    async fn remove_asset_assignment(&self, asset_id: &str) -> Result<usize> {
        self.repository.delete_asset_assignment(asset_id).await
    }

    async fn get_bucket_allocation(
        &self,
        account_id: &str,
        base_currency: &str,
    ) -> Result<BucketAllocation> {
        let buckets = self.repository.list_buckets()?;
        let valid_bucket_ids: HashSet<String> = buckets.iter().map(|bucket| bucket.id.clone()).collect();

        let account_defaults = self
            .repository
            .list_account_defaults()?
            .into_iter()
            .map(|assignment| {
                (
                    assignment.account_id,
                    Self::normalize_bucket_id(&assignment.bucket_id, &valid_bucket_ids),
                )
            })
            .collect::<HashMap<_, _>>();

        let holding_overrides = self
            .repository
            .list_holding_overrides()?
            .into_iter()
            .map(|assignment| {
                (
                    (assignment.account_id, assignment.asset_id),
                    Self::normalize_bucket_id(&assignment.bucket_id, &valid_bucket_ids),
                )
            })
            .collect::<HashMap<_, _>>();

        let asset_assignments = self
            .repository
            .list_asset_assignments()?
            .into_iter()
            .map(|assignment| {
                (
                    assignment.asset_id,
                    Self::normalize_bucket_id(&assignment.bucket_id, &valid_bucket_ids),
                )
            })
            .collect::<HashMap<_, _>>();

        let holdings = self.load_portfolio_holdings(account_id, base_currency).await?;
        let mut totals_by_bucket: HashMap<String, Decimal> = HashMap::new();
        let mut held_asset_ids = HashSet::new();

        for holding in holdings {
            let resolved_bucket_id = match (&holding.holding_type, holding.instrument.as_ref()) {
                (HoldingType::Cash, _) | (_, None) => account_defaults
                    .get(&holding.account_id)
                    .cloned()
                    .unwrap_or_else(|| UNASSIGNED_BUCKET_ID.to_string()),
                (_, Some(instrument)) => {
                    held_asset_ids.insert(instrument.id.clone());
                    holding_overrides
                        .get(&(holding.account_id.clone(), instrument.id.clone()))
                        .cloned()
                        .or_else(|| account_defaults.get(&holding.account_id).cloned())
                        .unwrap_or_else(|| UNASSIGNED_BUCKET_ID.to_string())
                }
            };

            *totals_by_bucket.entry(resolved_bucket_id).or_insert(Decimal::ZERO) +=
                holding.market_value.base;
        }

        if account_id == PORTFOLIO_TOTAL_ACCOUNT_ID {
            for asset in self.asset_repository.list()? {
                if !asset.kind.is_alternative()
                    || asset.kind == AssetKind::Liability
                    || held_asset_ids.contains(&asset.id)
                {
                    continue;
                }

                let Ok(quote) = self.quote_service.get_latest_quote(&asset.id) else {
                    continue;
                };

                let (normalized_price, normalized_currency) =
                    normalize_amount(quote.close, &quote.currency);
                let value_base = if normalized_currency == base_currency {
                    normalized_price
                } else {
                    self.fx_service.convert_currency_for_date(
                        normalized_price,
                        &normalized_currency,
                        base_currency,
                        quote.timestamp.date_naive(),
                    )?
                };

                let resolved_bucket_id = asset_assignments
                    .get(&asset.id)
                    .cloned()
                    .unwrap_or_else(|| UNASSIGNED_BUCKET_ID.to_string());

                *totals_by_bucket.entry(resolved_bucket_id).or_insert(Decimal::ZERO) +=
                    value_base;
            }
        }

        let total_value: Decimal = totals_by_bucket.values().copied().sum();
        let allocation_items = buckets
            .into_iter()
            .map(|bucket| {
                let current_amount = totals_by_bucket
                    .get(&bucket.id)
                    .copied()
                    .unwrap_or(Decimal::ZERO)
                    .round_dp(DISPLAY_DECIMAL_PRECISION);
                let current_percent = if total_value > Decimal::ZERO {
                    ((current_amount / total_value) * dec!(100)).round_dp(DISPLAY_DECIMAL_PRECISION)
                } else {
                    Decimal::ZERO
                };
                let deviation_percent = bucket
                    .target_percent
                    .map(|target| (current_percent - target).round_dp(DISPLAY_DECIMAL_PRECISION));

                BucketAllocationItem {
                    bucket_id: bucket.id,
                    bucket_name: bucket.name,
                    color: bucket.color,
                    current_amount,
                    current_percent,
                    target_percent: bucket.target_percent,
                    deviation_percent,
                }
            })
            .collect::<Vec<_>>();

        Ok(BucketAllocation {
            account_id: account_id.to_string(),
            currency: base_currency.to_string(),
            total_value: total_value.round_dp(DISPLAY_DECIMAL_PRECISION),
            buckets: allocation_items,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::str::FromStr;
    use std::sync::{Arc, Mutex};

    use chrono::Utc;

    use crate::accounts::{Account, AccountRepositoryTrait, AccountUpdate, NewAccount, TrackingMode};
    use crate::assets::{
        Asset, AssetKind, AssetRepositoryTrait, NewAsset, ProviderProfile, QuoteMode,
        UpdateAssetProfile,
    };
    use crate::errors::Result;
    use crate::portfolio::holdings::{Holding, HoldingType, HoldingsServiceTrait, Instrument, MonetaryValue};
    use crate::quotes::{
        DataSource, LatestQuotePair, LatestQuoteSnapshot, ProviderInfo, Quote, QuoteImport,
        QuoteServiceTrait, QuoteSyncState, ResolvedQuote, SyncMode, SyncResult,
        SymbolSearchResult, SymbolSyncPlan,
    };
    use async_trait::async_trait;

    use super::*;

    #[derive(Default)]
    struct MockBucketRepositoryState {
        buckets: Vec<Bucket>,
        account_defaults: Vec<BucketAccountDefault>,
        holding_overrides: Vec<BucketHoldingOverride>,
        asset_assignments: Vec<BucketAssetAssignment>,
    }

    struct MockBucketRepository {
        state: Mutex<MockBucketRepositoryState>,
    }

    impl MockBucketRepository {
        fn new(state: MockBucketRepositoryState) -> Self {
            Self {
                state: Mutex::new(state),
            }
        }
    }

    #[async_trait]
    impl BucketRepositoryTrait for MockBucketRepository {
        fn list_buckets(&self) -> Result<Vec<Bucket>> {
            Ok(self.state.lock().unwrap().buckets.clone())
        }

        fn get_bucket(&self, id: &str) -> Result<Option<Bucket>> {
            Ok(self
                .state
                .lock()
                .unwrap()
                .buckets
                .iter()
                .find(|bucket| bucket.id == id)
                .cloned())
        }

        async fn create_bucket(&self, bucket: NewBucket) -> Result<Bucket> {
            let created = Bucket {
                id: bucket.id.unwrap_or_else(|| "bucket-created".to_string()),
                name: bucket.name,
                color: bucket.color,
                target_percent: bucket.target_percent,
                sort_order: bucket.sort_order,
                is_system: bucket.is_system,
                created_at: Utc::now().naive_utc(),
                updated_at: Utc::now().naive_utc(),
            };
            self.state.lock().unwrap().buckets.push(created.clone());
            Ok(created)
        }

        async fn update_bucket(&self, bucket: Bucket) -> Result<Bucket> {
            let mut state = self.state.lock().unwrap();
            if let Some(existing) = state.buckets.iter_mut().find(|existing| existing.id == bucket.id)
            {
                *existing = bucket.clone();
            }
            Ok(bucket)
        }

        async fn delete_bucket(&self, id: &str) -> Result<usize> {
            let mut state = self.state.lock().unwrap();
            let previous_len = state.buckets.len();
            state.buckets.retain(|bucket| bucket.id != id);
            Ok(previous_len - state.buckets.len())
        }

        fn list_account_defaults(&self) -> Result<Vec<BucketAccountDefault>> {
            Ok(self.state.lock().unwrap().account_defaults.clone())
        }

        async fn upsert_account_default(
            &self,
            assignment: NewBucketAccountDefault,
        ) -> Result<BucketAccountDefault> {
            let record = BucketAccountDefault {
                id: assignment.id.unwrap_or_else(|| "account-default".to_string()),
                account_id: assignment.account_id,
                bucket_id: assignment.bucket_id,
                created_at: Utc::now().naive_utc(),
                updated_at: Utc::now().naive_utc(),
            };
            self.state.lock().unwrap().account_defaults = vec![record.clone()];
            Ok(record)
        }

        async fn delete_account_default(&self, account_id: &str) -> Result<usize> {
            let mut state = self.state.lock().unwrap();
            let previous_len = state.account_defaults.len();
            state
                .account_defaults
                .retain(|assignment| assignment.account_id != account_id);
            Ok(previous_len - state.account_defaults.len())
        }

        fn list_holding_overrides(&self) -> Result<Vec<BucketHoldingOverride>> {
            Ok(self.state.lock().unwrap().holding_overrides.clone())
        }

        async fn upsert_holding_override(
            &self,
            assignment: NewBucketHoldingOverride,
        ) -> Result<BucketHoldingOverride> {
            let record = BucketHoldingOverride {
                id: assignment.id.unwrap_or_else(|| "holding-override".to_string()),
                account_id: assignment.account_id,
                asset_id: assignment.asset_id,
                bucket_id: assignment.bucket_id,
                created_at: Utc::now().naive_utc(),
                updated_at: Utc::now().naive_utc(),
            };
            self.state.lock().unwrap().holding_overrides = vec![record.clone()];
            Ok(record)
        }

        async fn delete_holding_override(&self, account_id: &str, asset_id: &str) -> Result<usize> {
            let mut state = self.state.lock().unwrap();
            let previous_len = state.holding_overrides.len();
            state
                .holding_overrides
                .retain(|assignment| assignment.account_id != account_id || assignment.asset_id != asset_id);
            Ok(previous_len - state.holding_overrides.len())
        }

        fn list_asset_assignments(&self) -> Result<Vec<BucketAssetAssignment>> {
            Ok(self.state.lock().unwrap().asset_assignments.clone())
        }

        async fn upsert_asset_assignment(
            &self,
            assignment: NewBucketAssetAssignment,
        ) -> Result<BucketAssetAssignment> {
            let record = BucketAssetAssignment {
                id: assignment.id.unwrap_or_else(|| "asset-assignment".to_string()),
                asset_id: assignment.asset_id,
                bucket_id: assignment.bucket_id,
                created_at: Utc::now().naive_utc(),
                updated_at: Utc::now().naive_utc(),
            };
            self.state.lock().unwrap().asset_assignments = vec![record.clone()];
            Ok(record)
        }

        async fn delete_asset_assignment(&self, asset_id: &str) -> Result<usize> {
            let mut state = self.state.lock().unwrap();
            let previous_len = state.asset_assignments.len();
            state
                .asset_assignments
                .retain(|assignment| assignment.asset_id != asset_id);
            Ok(previous_len - state.asset_assignments.len())
        }
    }

    struct MockAccountRepository {
        accounts: Vec<Account>,
    }

    #[async_trait]
    impl AccountRepositoryTrait for MockAccountRepository {
        async fn create(&self, _new_account: NewAccount) -> Result<Account> {
            unimplemented!()
        }

        async fn update(&self, _account_update: AccountUpdate) -> Result<Account> {
            unimplemented!()
        }

        async fn delete(&self, _account_id: &str) -> Result<usize> {
            unimplemented!()
        }

        fn get_by_id(&self, _account_id: &str) -> Result<Account> {
            unimplemented!()
        }

        fn list(
            &self,
            _is_active_filter: Option<bool>,
            _is_archived_filter: Option<bool>,
            _account_ids: Option<&[String]>,
        ) -> Result<Vec<Account>> {
            Ok(self.accounts.clone())
        }
    }

    struct MockHoldingsService {
        holdings_by_account: HashMap<String, Vec<Holding>>,
    }

    #[async_trait]
    impl HoldingsServiceTrait for MockHoldingsService {
        async fn get_holdings(&self, account_id: &str, _base_currency: &str) -> Result<Vec<Holding>> {
            Ok(self.holdings_by_account.get(account_id).cloned().unwrap_or_default())
        }

        async fn get_holding(
            &self,
            _account_id: &str,
            _asset_id: &str,
            _base_currency: &str,
        ) -> Result<Option<Holding>> {
            unimplemented!()
        }

        async fn holdings_from_snapshot(
            &self,
            _snapshot: &crate::portfolio::snapshot::AccountStateSnapshot,
            _base_currency: &str,
        ) -> Result<Vec<Holding>> {
            unimplemented!()
        }
    }

    struct MockAssetRepository {
        assets: Vec<Asset>,
    }

    #[async_trait]
    impl AssetRepositoryTrait for MockAssetRepository {
        async fn create(&self, _new_asset: NewAsset) -> Result<Asset> {
            unimplemented!()
        }

        async fn create_batch(&self, _new_assets: Vec<NewAsset>) -> Result<Vec<Asset>> {
            unimplemented!()
        }

        async fn update_profile(&self, _asset_id: &str, _payload: UpdateAssetProfile) -> Result<Asset> {
            unimplemented!()
        }

        async fn update_quote_mode(&self, _asset_id: &str, _quote_mode: &str) -> Result<Asset> {
            unimplemented!()
        }

        fn get_by_id(&self, _asset_id: &str) -> Result<Asset> {
            unimplemented!()
        }

        fn list(&self) -> Result<Vec<Asset>> {
            Ok(self.assets.clone())
        }

        fn list_by_asset_ids(&self, _asset_ids: &[String]) -> Result<Vec<Asset>> {
            unimplemented!()
        }

        async fn delete(&self, _asset_id: &str) -> Result<()> {
            unimplemented!()
        }

        fn search_by_symbol(&self, _query: &str) -> Result<Vec<Asset>> {
            unimplemented!()
        }

        fn find_by_instrument_key(&self, _instrument_key: &str) -> Result<Option<Asset>> {
            unimplemented!()
        }

        async fn cleanup_legacy_metadata(&self, _asset_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn deactivate(&self, _asset_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn reactivate(&self, _asset_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn copy_user_metadata(&self, _source_id: &str, _target_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn deactivate_orphaned_investments(&self) -> Result<Vec<String>> {
            unimplemented!()
        }
    }

    struct MockQuoteService {
        quotes: HashMap<String, Quote>,
    }

    #[async_trait]
    impl QuoteServiceTrait for MockQuoteService {
        fn get_latest_quote(&self, symbol: &str) -> Result<Quote> {
            Ok(self.quotes.get(symbol).cloned().unwrap())
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

        fn get_all_historical_quotes(
            &self,
        ) -> Result<HashMap<String, Vec<(chrono::NaiveDate, Quote)>>> {
            unimplemented!()
        }

        fn get_quotes_in_range(
            &self,
            _symbols: &std::collections::HashSet<String>,
            _start: chrono::NaiveDate,
            _end: chrono::NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        fn get_quotes_in_range_filled(
            &self,
            _symbols: &std::collections::HashSet<String>,
            _start: chrono::NaiveDate,
            _end: chrono::NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn get_daily_quotes(
            &self,
            _asset_ids: &std::collections::HashSet<String>,
            _start: chrono::NaiveDate,
            _end: chrono::NaiveDate,
        ) -> Result<HashMap<chrono::NaiveDate, HashMap<String, Quote>>> {
            unimplemented!()
        }

        async fn add_quote(&self, _quote: &Quote) -> Result<Quote> {
            unimplemented!()
        }

        async fn update_quote(&self, _quote: Quote) -> Result<Quote> {
            unimplemented!()
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
            unimplemented!()
        }

        async fn resolve_symbol_quote(
            &self,
            _symbol: &str,
            _exchange_mic: Option<&str>,
            _instrument_type: Option<&crate::assets::InstrumentType>,
        ) -> Result<ResolvedQuote> {
            Ok(ResolvedQuote::default())
        }

        async fn get_asset_profile(&self, _asset: &Asset) -> Result<ProviderProfile> {
            unimplemented!()
        }

        async fn fetch_quotes_from_provider(
            &self,
            _asset_id: &str,
            _start: chrono::NaiveDate,
            _end: chrono::NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn fetch_quotes_for_symbol(
            &self,
            _asset_id: &str,
            _currency: &str,
            _start: chrono::NaiveDate,
            _end: chrono::NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn sync(&self, _mode: SyncMode, _asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
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
            _activity_date: chrono::NaiveDate,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn handle_activity_deleted(&self, _symbol: &str) -> Result<()> {
            unimplemented!()
        }

        async fn delete_sync_state(&self, _symbol: &str) -> Result<()> {
            unimplemented!()
        }

        fn get_symbols_needing_sync(&self) -> Result<Vec<QuoteSyncState>> {
            unimplemented!()
        }

        fn get_sync_state(&self, _symbol: &str) -> Result<Option<QuoteSyncState>> {
            unimplemented!()
        }

        async fn mark_profile_enriched(&self, _symbol: &str) -> Result<()> {
            unimplemented!()
        }

        fn get_assets_needing_profile_enrichment(&self) -> Result<Vec<QuoteSyncState>> {
            unimplemented!()
        }

        fn get_sync_states_with_errors(&self) -> Result<Vec<QuoteSyncState>> {
            unimplemented!()
        }

        async fn update_position_status_from_holdings(
            &self,
            _current_holdings: &std::collections::HashMap<String, rust_decimal::Decimal>,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn get_providers_info(&self) -> Result<Vec<ProviderInfo>> {
            unimplemented!()
        }

        async fn update_provider_settings(
            &self,
            _provider_id: &str,
            _priority: i32,
            _enabled: bool,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn check_quotes_import(
            &self,
            _content: &[u8],
            _has_header_row: bool,
        ) -> Result<Vec<QuoteImport>> {
            unimplemented!()
        }

        async fn import_quotes(
            &self,
            _quotes: Vec<QuoteImport>,
            _overwrite: bool,
        ) -> Result<Vec<QuoteImport>> {
            unimplemented!()
        }
    }

    struct MockFxService;

    #[async_trait]
    impl crate::fx::FxServiceTrait for MockFxService {
        fn initialize(&self) -> Result<()> {
            unimplemented!()
        }

        fn get_historical_rates(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _days: i64,
        ) -> Result<Vec<crate::fx::ExchangeRate>> {
            unimplemented!()
        }

        fn get_latest_exchange_rate(&self, _from_currency: &str, _to_currency: &str) -> Result<Decimal> {
            unimplemented!()
        }

        fn get_exchange_rate_for_date(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _date: chrono::NaiveDate,
        ) -> Result<Decimal> {
            unimplemented!()
        }

        fn convert_currency(
            &self,
            amount: Decimal,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<Decimal> {
            Ok(amount)
        }

        fn convert_currency_for_date(
            &self,
            amount: Decimal,
            _from_currency: &str,
            _to_currency: &str,
            _date: chrono::NaiveDate,
        ) -> Result<Decimal> {
            Ok(amount)
        }

        fn get_latest_exchange_rates(&self) -> Result<Vec<crate::fx::ExchangeRate>> {
            unimplemented!()
        }

        async fn add_exchange_rate(
            &self,
            _new_rate: crate::fx::NewExchangeRate,
        ) -> Result<crate::fx::ExchangeRate> {
            unimplemented!()
        }

        async fn update_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _rate: Decimal,
        ) -> Result<crate::fx::ExchangeRate> {
            unimplemented!()
        }

        async fn delete_exchange_rate(&self, _rate_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn register_currency_pair(&self, _from_currency: &str, _to_currency: &str) -> Result<()> {
            unimplemented!()
        }

        async fn register_currency_pair_manual(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn ensure_fx_pairs(&self, _pairs: Vec<(String, String)>) -> Result<()> {
            unimplemented!()
        }
    }

    fn test_bucket(
        id: &str,
        name: &str,
        sort_order: i32,
        target_percent: Option<&str>,
        is_system: bool,
    ) -> Bucket {
        Bucket {
            id: id.to_string(),
            name: name.to_string(),
            color: "#123456".to_string(),
            target_percent: target_percent.map(|value| Decimal::from_str(value).unwrap()),
            sort_order,
            is_system,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
        }
    }

    fn test_account(id: &str) -> Account {
        Account {
            id: id.to_string(),
            name: id.to_string(),
            account_type: "cash".to_string(),
            group: None,
            currency: "USD".to_string(),
            is_default: false,
            is_active: true,
            is_archived: false,
            tracking_mode: TrackingMode::Holdings,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
            platform_id: None,
            account_number: None,
            meta: None,
            provider: None,
            provider_account_id: None,
        }
    }

    fn test_holding(account_id: &str, asset_id: &str, value: &str, holding_type: HoldingType) -> Holding {
        Holding {
            id: format!("{account_id}-{asset_id}"),
            account_id: account_id.to_string(),
            holding_type,
            instrument: Some(Instrument {
                id: asset_id.to_string(),
                symbol: asset_id.to_string(),
                name: Some(asset_id.to_string()),
                currency: "USD".to_string(),
                notes: None,
                pricing_mode: "MANUAL".to_string(),
                preferred_provider: None,
                classifications: None,
            }),
            asset_kind: Some(AssetKind::Investment),
            quantity: Decimal::ONE,
            open_date: None,
            lots: None,
            local_currency: "USD".to_string(),
            base_currency: "USD".to_string(),
            fx_rate: Some(Decimal::ONE),
            market_value: MonetaryValue {
                local: Decimal::from_str(value).unwrap(),
                base: Decimal::from_str(value).unwrap(),
            },
            cost_basis: None,
            price: Some(Decimal::from_str(value).unwrap()),
            purchase_price: None,
            unrealized_gain: None,
            unrealized_gain_pct: None,
            realized_gain: None,
            realized_gain_pct: None,
            total_gain: None,
            total_gain_pct: None,
            day_change: None,
            day_change_pct: None,
            prev_close_value: None,
            weight: Decimal::ZERO,
            as_of_date: Utc::now().date_naive(),
            metadata: None,
        }
    }

    fn test_alt_asset(id: &str, kind: AssetKind) -> Asset {
        Asset {
            id: id.to_string(),
            kind,
            name: Some(id.to_string()),
            display_code: Some(id.to_string()),
            notes: None,
            metadata: None,
            is_active: true,
            quote_mode: QuoteMode::Manual,
            quote_ccy: "USD".to_string(),
            instrument_type: None,
            instrument_symbol: None,
            instrument_exchange_mic: None,
            instrument_key: None,
            provider_config: None,
            exchange_name: None,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
        }
    }

    fn test_quote(asset_id: &str, close: &str) -> Quote {
        Quote {
            id: format!("quote-{asset_id}"),
            asset_id: asset_id.to_string(),
            timestamp: Utc::now(),
            open: Decimal::ZERO,
            high: Decimal::ZERO,
            low: Decimal::ZERO,
            close: Decimal::from_str(close).unwrap(),
            adjclose: Decimal::from_str(close).unwrap(),
            volume: Decimal::ZERO,
            currency: "USD".to_string(),
            data_source: DataSource::Manual,
            created_at: Utc::now(),
            notes: None,
        }
    }

    fn create_service(
        repository_state: MockBucketRepositoryState,
        accounts: Vec<Account>,
        holdings_by_account: HashMap<String, Vec<Holding>>,
        assets: Vec<Asset>,
        quotes: HashMap<String, Quote>,
    ) -> BucketsService {
        BucketsService::new(
            Arc::new(MockBucketRepository::new(repository_state)),
            Arc::new(MockAccountRepository { accounts }),
            Arc::new(MockHoldingsService { holdings_by_account }),
            Arc::new(MockAssetRepository { assets }),
            Arc::new(MockQuoteService { quotes }),
            Arc::new(MockFxService),
        )
    }

    #[tokio::test]
    async fn holding_override_takes_precedence_over_account_default() {
        let service = create_service(
            MockBucketRepositoryState {
                buckets: vec![
                    test_bucket(UNASSIGNED_BUCKET_ID, "Unassigned", 0, None, true),
                    test_bucket("bucket-2", "Stable", 10, Some("40"), false),
                    test_bucket("bucket-3", "Growth", 20, Some("60"), false),
                ],
                account_defaults: vec![BucketAccountDefault {
                    id: "default-1".to_string(),
                    account_id: "account-1".to_string(),
                    bucket_id: "bucket-3".to_string(),
                    created_at: Utc::now().naive_utc(),
                    updated_at: Utc::now().naive_utc(),
                }],
                holding_overrides: vec![BucketHoldingOverride {
                    id: "override-1".to_string(),
                    account_id: "account-1".to_string(),
                    asset_id: "asset-1".to_string(),
                    bucket_id: "bucket-2".to_string(),
                    created_at: Utc::now().naive_utc(),
                    updated_at: Utc::now().naive_utc(),
                }],
                asset_assignments: Vec::new(),
            },
            vec![test_account("account-1")],
            HashMap::from([(
                "account-1".to_string(),
                vec![test_holding("account-1", "asset-1", "60", HoldingType::Security)],
            )]),
            Vec::new(),
            HashMap::new(),
        );

        let allocation = service
            .get_bucket_allocation("account-1", "USD")
            .await
            .expect("bucket allocation");

        let stable_bucket = allocation
            .buckets
            .iter()
            .find(|bucket| bucket.bucket_id == "bucket-2")
            .expect("stable bucket");
        let growth_bucket = allocation
            .buckets
            .iter()
            .find(|bucket| bucket.bucket_id == "bucket-3")
            .expect("growth bucket");

        assert_eq!(stable_bucket.current_amount, dec!(60));
        assert_eq!(growth_bucket.current_amount, Decimal::ZERO);
    }

    #[tokio::test]
    async fn account_default_takes_precedence_over_unassigned() {
        let service = create_service(
            MockBucketRepositoryState {
                buckets: vec![
                    test_bucket(UNASSIGNED_BUCKET_ID, "Unassigned", 0, None, true),
                    test_bucket("bucket-3", "Growth", 20, Some("100"), false),
                ],
                account_defaults: vec![BucketAccountDefault {
                    id: "default-1".to_string(),
                    account_id: "account-1".to_string(),
                    bucket_id: "bucket-3".to_string(),
                    created_at: Utc::now().naive_utc(),
                    updated_at: Utc::now().naive_utc(),
                }],
                holding_overrides: Vec::new(),
                asset_assignments: Vec::new(),
            },
            vec![test_account("account-1")],
            HashMap::from([(
                "account-1".to_string(),
                vec![test_holding("account-1", "asset-1", "40", HoldingType::Cash)],
            )]),
            Vec::new(),
            HashMap::new(),
        );

        let allocation = service
            .get_bucket_allocation("account-1", "USD")
            .await
            .expect("bucket allocation");

        let growth_bucket = allocation
            .buckets
            .iter()
            .find(|bucket| bucket.bucket_id == "bucket-3")
            .expect("growth bucket");

        assert_eq!(growth_bucket.current_amount, dec!(40));
        assert_eq!(growth_bucket.current_percent, dec!(100));
    }

    #[tokio::test]
    async fn standalone_asset_assignment_is_used_for_total_allocation() {
        let service = create_service(
            MockBucketRepositoryState {
                buckets: vec![
                    test_bucket(UNASSIGNED_BUCKET_ID, "Unassigned", 0, None, true),
                    test_bucket("bucket-2", "Stable", 10, Some("100"), false),
                ],
                account_defaults: Vec::new(),
                holding_overrides: Vec::new(),
                asset_assignments: vec![BucketAssetAssignment {
                    id: "asset-assignment-1".to_string(),
                    asset_id: "asset-alt-1".to_string(),
                    bucket_id: "bucket-2".to_string(),
                    created_at: Utc::now().naive_utc(),
                    updated_at: Utc::now().naive_utc(),
                }],
            },
            vec![test_account("account-1")],
            HashMap::new(),
            vec![test_alt_asset("asset-alt-1", AssetKind::Property)],
            HashMap::from([("asset-alt-1".to_string(), test_quote("asset-alt-1", "100"))]),
        );

        let allocation = service
            .get_bucket_allocation(PORTFOLIO_TOTAL_ACCOUNT_ID, "USD")
            .await
            .expect("bucket allocation");

        let stable_bucket = allocation
            .buckets
            .iter()
            .find(|bucket| bucket.bucket_id == "bucket-2")
            .expect("stable bucket");

        assert_eq!(stable_bucket.current_amount, dec!(100));
        assert_eq!(stable_bucket.current_percent, dec!(100));
    }

    #[tokio::test]
    async fn allocation_calculates_percentages_and_deviation() {
        let service = create_service(
            MockBucketRepositoryState {
                buckets: vec![
                    test_bucket(UNASSIGNED_BUCKET_ID, "Unassigned", 0, None, true),
                    test_bucket("bucket-2", "Stable", 10, Some("25"), false),
                    test_bucket("bucket-3", "Growth", 20, Some("75"), false),
                ],
                account_defaults: vec![BucketAccountDefault {
                    id: "default-1".to_string(),
                    account_id: "account-1".to_string(),
                    bucket_id: "bucket-3".to_string(),
                    created_at: Utc::now().naive_utc(),
                    updated_at: Utc::now().naive_utc(),
                }],
                holding_overrides: vec![BucketHoldingOverride {
                    id: "override-1".to_string(),
                    account_id: "account-1".to_string(),
                    asset_id: "asset-1".to_string(),
                    bucket_id: "bucket-2".to_string(),
                    created_at: Utc::now().naive_utc(),
                    updated_at: Utc::now().naive_utc(),
                }],
                asset_assignments: Vec::new(),
            },
            vec![test_account("account-1")],
            HashMap::from([(
                "account-1".to_string(),
                vec![
                    test_holding("account-1", "asset-1", "25", HoldingType::Security),
                    test_holding("account-1", "asset-2", "75", HoldingType::Security),
                ],
            )]),
            Vec::new(),
            HashMap::new(),
        );

        let allocation = service
            .get_bucket_allocation("account-1", "USD")
            .await
            .expect("bucket allocation");

        assert_eq!(allocation.total_value, dec!(100));

        let stable_bucket = allocation
            .buckets
            .iter()
            .find(|bucket| bucket.bucket_id == "bucket-2")
            .expect("stable bucket");
        let growth_bucket = allocation
            .buckets
            .iter()
            .find(|bucket| bucket.bucket_id == "bucket-3")
            .expect("growth bucket");

        assert_eq!(stable_bucket.current_percent, dec!(25));
        assert_eq!(growth_bucket.current_percent, dec!(75));
        assert_eq!(stable_bucket.deviation_percent, Some(dec!(0)));
        assert_eq!(growth_bucket.deviation_percent, Some(dec!(0)));
    }

    #[tokio::test]
    async fn total_allocation_keeps_account_context_for_same_asset_across_accounts() {
        let service = create_service(
            MockBucketRepositoryState {
                buckets: vec![
                    test_bucket(UNASSIGNED_BUCKET_ID, "Unassigned", 0, None, true),
                    test_bucket("bucket-2", "Stable", 10, Some("50"), false),
                    test_bucket("bucket-3", "Growth", 20, Some("50"), false),
                ],
                account_defaults: vec![
                    BucketAccountDefault {
                        id: "default-1".to_string(),
                        account_id: "account-1".to_string(),
                        bucket_id: "bucket-2".to_string(),
                        created_at: Utc::now().naive_utc(),
                        updated_at: Utc::now().naive_utc(),
                    },
                    BucketAccountDefault {
                        id: "default-2".to_string(),
                        account_id: "account-2".to_string(),
                        bucket_id: "bucket-3".to_string(),
                        created_at: Utc::now().naive_utc(),
                        updated_at: Utc::now().naive_utc(),
                    },
                ],
                holding_overrides: Vec::new(),
                asset_assignments: Vec::new(),
            },
            vec![test_account("account-1"), test_account("account-2")],
            HashMap::from([
                (
                    "account-1".to_string(),
                    vec![test_holding("account-1", "asset-shared", "50", HoldingType::Security)],
                ),
                (
                    "account-2".to_string(),
                    vec![test_holding("account-2", "asset-shared", "50", HoldingType::Security)],
                ),
            ]),
            Vec::new(),
            HashMap::new(),
        );

        let allocation = service
            .get_bucket_allocation(PORTFOLIO_TOTAL_ACCOUNT_ID, "USD")
            .await
            .expect("bucket allocation");

        let stable_bucket = allocation
            .buckets
            .iter()
            .find(|bucket| bucket.bucket_id == "bucket-2")
            .expect("stable bucket");
        let growth_bucket = allocation
            .buckets
            .iter()
            .find(|bucket| bucket.bucket_id == "bucket-3")
            .expect("growth bucket");

        assert_eq!(stable_bucket.current_amount, dec!(50));
        assert_eq!(growth_bucket.current_amount, dec!(50));
    }

    #[tokio::test]
    async fn delete_bucket_rejects_system_bucket() {
        let service = create_service(
            MockBucketRepositoryState {
                buckets: vec![test_bucket(UNASSIGNED_BUCKET_ID, "Unassigned", 0, None, true)],
                account_defaults: Vec::new(),
                holding_overrides: Vec::new(),
                asset_assignments: Vec::new(),
            },
            Vec::new(),
            HashMap::new(),
            Vec::new(),
            HashMap::new(),
        );

        let result = service.delete_bucket(UNASSIGNED_BUCKET_ID).await;

        assert!(result.is_err());
    }
}
