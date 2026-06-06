//! Adapter namespace for entity-specific sync serialization/apply logic.
//!
//! In v2, most replay is handled by a generic rowset applier in `AppSyncRepository`.
//! This module is the stable extension point for richer per-entity semantics.

use panorama_core::sync::SyncEntity;

#[derive(Debug, Clone)]
pub struct EntityAdapterDescriptor {
    pub entity: SyncEntity,
    pub table_name: &'static str,
}

pub fn default_adapter_descriptors() -> Vec<EntityAdapterDescriptor> {
    vec![
        EntityAdapterDescriptor {
            entity: SyncEntity::Taxonomy,
            table_name: "taxonomies",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::TaxonomyCategory,
            table_name: "taxonomy_categories",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::Account,
            table_name: "accounts",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::Asset,
            table_name: "assets",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::Quote,
            table_name: "quotes",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::AssetTaxonomyAssignment,
            table_name: "asset_taxonomy_assignments",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::Activity,
            table_name: "activities",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::ActivityImportProfile,
            table_name: "activity_import_profiles",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::Goal,
            table_name: "goals",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::GoalsAllocation,
            table_name: "goals_allocation",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::AiThread,
            table_name: "ai_threads",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::AiMessage,
            table_name: "ai_messages",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::AiThreadTag,
            table_name: "ai_thread_tags",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::ContributionLimit,
            table_name: "contribution_limits",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::Platform,
            table_name: "platforms",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::Snapshot,
            table_name: "holdings_snapshots",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::TargetAllocationPlan,
            table_name: "target_allocation_plan",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::TargetAllocationNode,
            table_name: "target_allocation_nodes",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::TargetAllocationAccountDefault,
            table_name: "target_allocation_account_defaults",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::TargetAllocationAttribution,
            table_name: "target_allocation_attributions",
        },
        EntityAdapterDescriptor {
            entity: SyncEntity::TargetAllocationExclusion,
            table_name: "target_allocation_exclusions",
        },
    ]
}
