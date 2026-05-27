use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TargetAllocationNodeKind {
    Folder,
    Asset,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TargetAllocationAssetRef {
    Asset { asset_id: String },
    Cash { currency: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TargetAllocationSubjectType {
    Position,
    Cash,
    StandaloneAsset,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationPlan {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub node_kind: TargetAllocationNodeKind,
    pub name: String,
    pub target_percent: Option<Decimal>,
    pub asset_ref: Option<TargetAllocationAssetRef>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationAccountDefault {
    pub account_id: String,
    pub folder_node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationAttribution {
    pub subject_key: String,
    pub subject_type: TargetAllocationSubjectType,
    pub folder_node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationExclusion {
    pub subject_key: String,
    pub subject_type: TargetAllocationSubjectType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationHoldingInput {
    pub subject_key: String,
    pub subject_type: TargetAllocationSubjectType,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub asset_id: Option<String>,
    pub currency: String,
    pub symbol: String,
    pub name: Option<String>,
    pub value_base: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationInput {
    pub currency: String,
    pub nodes: Vec<TargetAllocationNode>,
    pub account_defaults: Vec<TargetAllocationAccountDefault>,
    pub attributions: Vec<TargetAllocationAttribution>,
    pub exclusions: Vec<TargetAllocationExclusion>,
    pub holdings: Vec<TargetAllocationHoldingInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationPlanData {
    pub has_plan: bool,
    pub nodes: Vec<TargetAllocationNode>,
    pub account_defaults: Vec<TargetAllocationAccountDefault>,
    pub attributions: Vec<TargetAllocationAttribution>,
    pub exclusions: Vec<TargetAllocationExclusion>,
}

impl TargetAllocationPlanData {
    pub fn empty() -> Self {
        Self {
            has_plan: false,
            nodes: Vec::new(),
            account_defaults: Vec::new(),
            attributions: Vec::new(),
            exclusions: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TargetAllocationRowKind {
    Root,
    Folder,
    Asset,
    Other,
    Untargeted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationHoldingBreakdown {
    pub subject_key: String,
    pub subject_type: TargetAllocationSubjectType,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub asset_id: Option<String>,
    pub currency: String,
    pub symbol: String,
    pub name: Option<String>,
    pub value_base: Decimal,
}

impl From<&TargetAllocationHoldingInput> for TargetAllocationHoldingBreakdown {
    fn from(holding: &TargetAllocationHoldingInput) -> Self {
        Self {
            subject_key: holding.subject_key.clone(),
            subject_type: holding.subject_type.clone(),
            account_id: holding.account_id.clone(),
            account_name: holding.account_name.clone(),
            asset_id: holding.asset_id.clone(),
            currency: holding.currency.clone(),
            symbol: holding.symbol.clone(),
            name: holding.name.clone(),
            value_base: holding.value_base,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationDisplayRow {
    pub id: String,
    pub kind: TargetAllocationRowKind,
    pub node_kind: Option<TargetAllocationNodeKind>,
    pub name: String,
    pub target_percent: Option<Decimal>,
    pub current_percent: Decimal,
    pub effective_current_percent: Decimal,
    pub effective_target_percent: Option<Decimal>,
    pub current_value: Decimal,
    pub target_value: Option<Decimal>,
    pub value_gap: Option<Decimal>,
    pub percent_gap: Option<Decimal>,
    pub status_symbol: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub asset_ref: Option<TargetAllocationAssetRef>,
    pub is_virtual: bool,
    pub is_auto_target: bool,
    pub breakdown: Vec<TargetAllocationHoldingBreakdown>,
    pub children: Vec<TargetAllocationDisplayRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationDashboard {
    pub currency: String,
    pub has_plan: bool,
    pub root: TargetAllocationDisplayRow,
    pub excluded_holdings: Vec<TargetAllocationHoldingBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocationView {
    pub plan: TargetAllocationPlanData,
    pub dashboard: TargetAllocationDashboard,
    pub available_holdings: Vec<TargetAllocationHoldingInput>,
}
