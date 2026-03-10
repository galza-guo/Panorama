//! Database models for buckets.

use chrono::{NaiveDate, NaiveDateTime};
use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use wealthfolio_core::buckets::{
    Bucket, BucketAccountDefault, BucketAssetAssignment, BucketHoldingOverride, NewBucket,
    NewBucketAccountDefault, NewBucketAssetAssignment, NewBucketHoldingOverride,
};

fn text_to_datetime(s: &str) -> NaiveDateTime {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return dt.naive_utc();
    }

    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return dt;
    }

    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return dt;
    }

    if let Ok(date) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return date
            .and_hms_opt(0, 0, 0)
            .unwrap_or_else(|| chrono::Utc::now().naive_utc());
    }

    chrono::Utc::now().naive_utc()
}

#[derive(
    Queryable, Identifiable, Selectable, AsChangeset, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::buckets)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct BucketDB {
    pub id: String,
    pub name: String,
    pub color: String,
    pub target_percent: Option<String>,
    pub sort_order: i32,
    pub is_system: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::buckets)]
#[serde(rename_all = "camelCase")]
pub struct NewBucketDB {
    pub id: Option<String>,
    pub name: String,
    pub color: String,
    pub target_percent: Option<String>,
    pub sort_order: i32,
    pub is_system: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable, Identifiable, Selectable, AsChangeset, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::bucket_account_defaults)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct BucketAccountDefaultDB {
    pub id: String,
    pub account_id: String,
    pub bucket_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::bucket_account_defaults)]
#[serde(rename_all = "camelCase")]
pub struct NewBucketAccountDefaultDB {
    pub id: Option<String>,
    pub account_id: String,
    pub bucket_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable, Identifiable, Selectable, AsChangeset, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::bucket_holding_overrides)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct BucketHoldingOverrideDB {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,
    pub bucket_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::bucket_holding_overrides)]
#[serde(rename_all = "camelCase")]
pub struct NewBucketHoldingOverrideDB {
    pub id: Option<String>,
    pub account_id: String,
    pub asset_id: String,
    pub bucket_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable, Identifiable, Selectable, AsChangeset, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::bucket_asset_assignments)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct BucketAssetAssignmentDB {
    pub id: String,
    pub asset_id: String,
    pub bucket_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::bucket_asset_assignments)]
#[serde(rename_all = "camelCase")]
pub struct NewBucketAssetAssignmentDB {
    pub id: Option<String>,
    pub asset_id: String,
    pub bucket_id: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<BucketDB> for Bucket {
    fn from(value: BucketDB) -> Self {
        Self {
            id: value.id,
            name: value.name,
            color: value.color,
            target_percent: value
                .target_percent
                .as_deref()
                .and_then(|amount| Decimal::from_str(amount).ok()),
            sort_order: value.sort_order,
            is_system: value.is_system,
            created_at: text_to_datetime(&value.created_at),
            updated_at: text_to_datetime(&value.updated_at),
        }
    }
}

impl From<NewBucket> for NewBucketDB {
    fn from(value: NewBucket) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: value.id,
            name: value.name,
            color: value.color,
            target_percent: value.target_percent.map(|amount| amount.to_string()),
            sort_order: value.sort_order,
            is_system: value.is_system,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl From<BucketAccountDefaultDB> for BucketAccountDefault {
    fn from(value: BucketAccountDefaultDB) -> Self {
        Self {
            id: value.id,
            account_id: value.account_id,
            bucket_id: value.bucket_id,
            created_at: text_to_datetime(&value.created_at),
            updated_at: text_to_datetime(&value.updated_at),
        }
    }
}

impl From<NewBucketAccountDefault> for NewBucketAccountDefaultDB {
    fn from(value: NewBucketAccountDefault) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: value.id,
            account_id: value.account_id,
            bucket_id: value.bucket_id,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl From<BucketHoldingOverrideDB> for BucketHoldingOverride {
    fn from(value: BucketHoldingOverrideDB) -> Self {
        Self {
            id: value.id,
            account_id: value.account_id,
            asset_id: value.asset_id,
            bucket_id: value.bucket_id,
            created_at: text_to_datetime(&value.created_at),
            updated_at: text_to_datetime(&value.updated_at),
        }
    }
}

impl From<NewBucketHoldingOverride> for NewBucketHoldingOverrideDB {
    fn from(value: NewBucketHoldingOverride) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: value.id,
            account_id: value.account_id,
            asset_id: value.asset_id,
            bucket_id: value.bucket_id,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl From<BucketAssetAssignmentDB> for BucketAssetAssignment {
    fn from(value: BucketAssetAssignmentDB) -> Self {
        Self {
            id: value.id,
            asset_id: value.asset_id,
            bucket_id: value.bucket_id,
            created_at: text_to_datetime(&value.created_at),
            updated_at: text_to_datetime(&value.updated_at),
        }
    }
}

impl From<NewBucketAssetAssignment> for NewBucketAssetAssignmentDB {
    fn from(value: NewBucketAssetAssignment) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: value.id,
            asset_id: value.asset_id,
            bucket_id: value.bucket_id,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
