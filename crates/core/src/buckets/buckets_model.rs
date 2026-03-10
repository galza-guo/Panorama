use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

pub const UNASSIGNED_BUCKET_ID: &str = "unassigned";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub id: String,
    pub name: String,
    pub color: String,
    pub target_percent: Option<Decimal>,
    pub sort_order: i32,
    pub is_system: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBucket {
    pub id: Option<String>,
    pub name: String,
    pub color: String,
    pub target_percent: Option<Decimal>,
    pub sort_order: i32,
    pub is_system: bool,
}

impl Default for NewBucket {
    fn default() -> Self {
        Self {
            id: None,
            name: String::new(),
            color: "#94a3b8".to_string(),
            target_percent: None,
            sort_order: 0,
            is_system: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketAccountDefault {
    pub id: String,
    pub account_id: String,
    pub bucket_id: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewBucketAccountDefault {
    pub id: Option<String>,
    pub account_id: String,
    pub bucket_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketHoldingOverride {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub bucket_id: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewBucketHoldingOverride {
    pub id: Option<String>,
    pub account_id: String,
    pub asset_id: String,
    pub bucket_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketAssetAssignment {
    pub id: String,
    pub asset_id: String,
    pub bucket_id: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewBucketAssetAssignment {
    pub id: Option<String>,
    pub asset_id: String,
    pub bucket_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketAllocationItem {
    pub bucket_id: String,
    pub bucket_name: String,
    pub color: String,
    pub current_amount: Decimal,
    pub current_percent: Decimal,
    pub target_percent: Option<Decimal>,
    pub deviation_percent: Option<Decimal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketAllocation {
    pub account_id: String,
    pub currency: String,
    pub total_value: Decimal,
    pub buckets: Vec<BucketAllocationItem>,
}
