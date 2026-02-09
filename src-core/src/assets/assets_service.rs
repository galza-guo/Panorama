use log::{debug, error};
use std::sync::Arc;

use crate::market_data::market_data_traits::MarketDataServiceTrait;
use crate::market_data::symbol_normalizer::infer_panorama_data_source;

use super::assets_model::{Asset, NewAsset, UpdateAssetProfile};
use super::assets_traits::{AssetRepositoryTrait, AssetServiceTrait};
use crate::errors::{DatabaseError, Error, Result};
use diesel::result::Error as DieselError;

/// Service for managing assets
pub struct AssetService {
    market_data_service: Arc<dyn MarketDataServiceTrait>,
    asset_repository: Arc<dyn AssetRepositoryTrait>,
}

impl AssetService {
    /// Creates a new AssetService instance
    pub fn new(
        asset_repository: Arc<dyn AssetRepositoryTrait>,
        market_data_service: Arc<dyn MarketDataServiceTrait>,
    ) -> Result<Self> {
        Ok(Self {
            market_data_service,
            asset_repository,
        })
    }
}

// Implement the service trait
#[async_trait::async_trait]
impl AssetServiceTrait for AssetService {
    /// Lists all assets
    fn get_assets(&self) -> Result<Vec<Asset>> {
        self.asset_repository.list()
    }

    fn get_assets_by_owner(&self, owner: Option<&str>) -> Result<Vec<Asset>> {
        match owner.map(str::trim).filter(|owner| !owner.is_empty()) {
            Some(owner) => self.asset_repository.list_by_owner(owner),
            None => self.asset_repository.list(),
        }
    }

    /// Retrieves an asset by its ID
    fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset> {
        self.asset_repository.get_by_id(asset_id)
    }

    async fn delete_asset(&self, asset_id: &str) -> Result<()> {
        self.asset_repository.delete(asset_id).await
    }

    /// Updates an asset profile
    async fn update_asset_profile(
        &self,
        asset_id: &str,
        payload: UpdateAssetProfile,
    ) -> Result<Asset> {
        self.asset_repository
            .update_profile(asset_id, payload)
            .await
    }

    /// Lists currency assets for a given base currency
    fn load_cash_assets(&self, base_currency: &str) -> Result<Vec<Asset>> {
        self.asset_repository.list_cash_assets(base_currency)
    }

    /// Creates a new cash asset
    async fn create_cash_asset(&self, currency: &str) -> Result<Asset> {
        let new_asset = NewAsset::new_cash_asset(currency);
        self.asset_repository.create(new_asset).await
    }

    /// Retrieves or creates an asset by its ID
    async fn get_or_create_asset(
        &self,
        asset_id: &str,
        context_currency: Option<String>,
    ) -> Result<Asset> {
        match self.asset_repository.get_by_id(asset_id) {
            Ok(existing_asset) => {
                if let Some(inferred_source) = infer_panorama_data_source(&existing_asset.id) {
                    if !existing_asset.data_source.eq_ignore_ascii_case(inferred_source) {
                        debug!(
                            "Auto-correcting data source for asset '{}' from '{}' to '{}'",
                            existing_asset.id, existing_asset.data_source, inferred_source
                        );
                        return self
                            .asset_repository
                            .update_data_source(&existing_asset.id, inferred_source.to_string())
                            .await;
                    }
                }

                Ok(existing_asset)
            }
            Err(Error::Database(DatabaseError::QueryFailed(DieselError::NotFound))) => {
                debug!(
                    "Asset not found locally, attempting to fetch from market data: {}",
                    asset_id
                );
                let asset_profile_from_provider =
                    self.market_data_service.get_asset_profile(asset_id).await?;

                let mut new_asset: NewAsset = asset_profile_from_provider.into();

                if let Some(inferred_source) = infer_panorama_data_source(&new_asset.symbol) {
                    if !new_asset.data_source.eq_ignore_ascii_case(inferred_source) {
                        debug!(
                            "Overriding inferred data source for symbol '{}' from '{}' to '{}'",
                            new_asset.symbol, new_asset.data_source, inferred_source
                        );
                        new_asset.data_source = inferred_source.to_string();
                    }
                }

                // If the asset profile didn't provide a currency (e.g., generic manual asset)
                // and a context currency is available, use the context currency.
                if new_asset.currency.is_empty() {
                    if let Some(curr) = context_currency {
                        if !curr.is_empty() {
                            new_asset.currency = curr;
                        }
                    }
                }

                // will ensure currency is not empty before insertion.
                return self.asset_repository.create(new_asset).await;
            }
            Err(e) => {
                error!("Error fetching asset by ID '{}': {}", asset_id, e);
                Err(e)
            }
        }
    }

    /// Updates the data source for an asset
    async fn update_asset_data_source(&self, asset_id: &str, data_source: String) -> Result<Asset> {
        self.asset_repository
            .update_data_source(asset_id, data_source)
            .await
    }

    async fn get_assets_by_symbols(&self, symbols: &[String]) -> Result<Vec<Asset>> {
        self.asset_repository.list_by_symbols(symbols)
    }
}
