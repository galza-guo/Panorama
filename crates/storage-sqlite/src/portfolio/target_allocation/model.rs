use std::str::FromStr;

use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use panorama_core::errors::{Result, ValidationError};
use panorama_core::portfolio::target_allocation::{
    TargetAllocationAccountDefault, TargetAllocationAssetRef, TargetAllocationAttribution,
    TargetAllocationExclusion, TargetAllocationNode, TargetAllocationNodeKind,
    TargetAllocationSubjectType,
};

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(table_name = crate::schema::target_allocation_plan)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct TargetAllocationPlanDB {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(table_name = crate::schema::target_allocation_nodes)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct TargetAllocationNodeDB {
    pub id: String,
    pub parent_id: Option<String>,
    pub node_kind: String,
    pub name: String,
    pub target_percent: Option<String>,
    pub asset_id: Option<String>,
    pub cash_currency: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(account_id))]
#[diesel(table_name = crate::schema::target_allocation_account_defaults)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct TargetAllocationAccountDefaultDB {
    pub account_id: String,
    pub folder_node_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(subject_key))]
#[diesel(table_name = crate::schema::target_allocation_attributions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct TargetAllocationAttributionDB {
    pub subject_key: String,
    pub subject_type: String,
    pub folder_node_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Debug,
    Clone,
    Serialize,
    Deserialize,
)]
#[diesel(primary_key(subject_key))]
#[diesel(table_name = crate::schema::target_allocation_exclusions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct TargetAllocationExclusionDB {
    pub subject_key: String,
    pub subject_type: String,
    pub created_at: String,
}

impl TargetAllocationNodeDB {
    pub fn from_domain(node: TargetAllocationNode, now: &str) -> Self {
        let (asset_id, cash_currency) = match node.asset_ref {
            Some(TargetAllocationAssetRef::Asset { asset_id }) => (Some(asset_id), None),
            Some(TargetAllocationAssetRef::Cash { currency }) => (None, Some(currency)),
            None => (None, None),
        };

        Self {
            id: if node.id.trim().is_empty() {
                Uuid::new_v4().to_string()
            } else {
                node.id
            },
            parent_id: node.parent_id,
            node_kind: node_kind_to_db(&node.node_kind).to_string(),
            name: node.name,
            target_percent: node.target_percent.map(|value| value.to_string()),
            asset_id,
            cash_currency,
            color: node.color,
            icon: node.icon,
            sort_order: node.sort_order,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        }
    }

    pub fn to_domain(self) -> Result<TargetAllocationNode> {
        let node_kind = node_kind_from_db(&self.node_kind)?;
        let asset_ref = match (self.asset_id, self.cash_currency) {
            (Some(asset_id), _) => Some(TargetAllocationAssetRef::Asset { asset_id }),
            (None, Some(currency)) => Some(TargetAllocationAssetRef::Cash { currency }),
            (None, None) => None,
        };

        Ok(TargetAllocationNode {
            id: self.id,
            parent_id: self.parent_id,
            node_kind,
            name: self.name,
            target_percent: self
                .target_percent
                .map(|value| Decimal::from_str(&value))
                .transpose()?,
            asset_ref,
            color: self.color,
            icon: self.icon,
            sort_order: self.sort_order,
        })
    }
}

impl TargetAllocationAccountDefaultDB {
    pub fn from_domain(value: TargetAllocationAccountDefault, now: &str) -> Self {
        Self {
            account_id: value.account_id,
            folder_node_id: value.folder_node_id,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        }
    }
}

impl From<TargetAllocationAccountDefaultDB> for TargetAllocationAccountDefault {
    fn from(value: TargetAllocationAccountDefaultDB) -> Self {
        Self {
            account_id: value.account_id,
            folder_node_id: value.folder_node_id,
        }
    }
}

impl TargetAllocationAttributionDB {
    pub fn from_domain(value: TargetAllocationAttribution, now: &str) -> Self {
        Self {
            subject_key: value.subject_key,
            subject_type: subject_type_to_db(&value.subject_type).to_string(),
            folder_node_id: value.folder_node_id,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        }
    }

    pub fn to_domain(self) -> Result<TargetAllocationAttribution> {
        Ok(TargetAllocationAttribution {
            subject_key: self.subject_key,
            subject_type: subject_type_from_db(&self.subject_type)?,
            folder_node_id: self.folder_node_id,
        })
    }
}

impl TargetAllocationExclusionDB {
    pub fn from_domain(value: TargetAllocationExclusion, now: &str) -> Self {
        Self {
            subject_key: value.subject_key,
            subject_type: subject_type_to_db(&value.subject_type).to_string(),
            created_at: now.to_string(),
        }
    }

    pub fn to_domain(self) -> Result<TargetAllocationExclusion> {
        Ok(TargetAllocationExclusion {
            subject_key: self.subject_key,
            subject_type: subject_type_from_db(&self.subject_type)?,
        })
    }
}

fn node_kind_to_db(kind: &TargetAllocationNodeKind) -> &'static str {
    match kind {
        TargetAllocationNodeKind::Folder => "FOLDER",
        TargetAllocationNodeKind::Asset => "ASSET",
    }
}

fn node_kind_from_db(value: &str) -> Result<TargetAllocationNodeKind> {
    match value {
        "FOLDER" => Ok(TargetAllocationNodeKind::Folder),
        "ASSET" => Ok(TargetAllocationNodeKind::Asset),
        _ => Err(ValidationError::InvalidInput(format!(
            "Unknown target allocation node kind: {value}"
        ))
        .into()),
    }
}

fn subject_type_to_db(subject_type: &TargetAllocationSubjectType) -> &'static str {
    match subject_type {
        TargetAllocationSubjectType::Position => "POSITION",
        TargetAllocationSubjectType::Cash => "CASH",
        TargetAllocationSubjectType::StandaloneAsset => "STANDALONE_ASSET",
    }
}

fn subject_type_from_db(value: &str) -> Result<TargetAllocationSubjectType> {
    match value {
        "POSITION" => Ok(TargetAllocationSubjectType::Position),
        "CASH" => Ok(TargetAllocationSubjectType::Cash),
        "STANDALONE_ASSET" => Ok(TargetAllocationSubjectType::StandaloneAsset),
        _ => Err(ValidationError::InvalidInput(format!(
            "Unknown target allocation subject type: {value}"
        ))
        .into()),
    }
}
