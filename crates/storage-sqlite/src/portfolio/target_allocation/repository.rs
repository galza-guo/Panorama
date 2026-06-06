use std::collections::HashSet;
use std::sync::Arc;

use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;

use panorama_core::errors::{Result, ValidationError};
use panorama_core::portfolio::target_allocation::{
    TargetAllocationPlanData, TargetAllocationRepositoryTrait,
};

use super::model::{
    TargetAllocationAccountDefaultDB, TargetAllocationAttributionDB, TargetAllocationExclusionDB,
    TargetAllocationNodeDB, TargetAllocationPlanDB,
};
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{
    target_allocation_account_defaults, target_allocation_attributions,
    target_allocation_exclusions, target_allocation_nodes, target_allocation_plan,
};

const DEFAULT_PLAN_ID: &str = "default";

pub struct TargetAllocationRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl TargetAllocationRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl TargetAllocationRepositoryTrait for TargetAllocationRepository {
    fn get_plan_data(&self) -> Result<TargetAllocationPlanData> {
        let mut conn = get_connection(&self.pool)?;
        let has_plan = target_allocation_plan::table
            .find(DEFAULT_PLAN_ID)
            .first::<TargetAllocationPlanDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?
            .is_some();

        if !has_plan {
            return Ok(TargetAllocationPlanData::empty());
        }

        let nodes = target_allocation_nodes::table
            .order((
                target_allocation_nodes::parent_id.asc(),
                target_allocation_nodes::sort_order.asc(),
                target_allocation_nodes::name.asc(),
            ))
            .load::<TargetAllocationNodeDB>(&mut conn)
            .map_err(StorageError::from)?
            .into_iter()
            .map(TargetAllocationNodeDB::to_domain)
            .collect::<Result<Vec<_>>>()?;

        let account_defaults = target_allocation_account_defaults::table
            .order(target_allocation_account_defaults::account_id.asc())
            .load::<TargetAllocationAccountDefaultDB>(&mut conn)
            .map_err(StorageError::from)?
            .into_iter()
            .map(Into::into)
            .collect();

        let attributions = target_allocation_attributions::table
            .order(target_allocation_attributions::subject_key.asc())
            .load::<TargetAllocationAttributionDB>(&mut conn)
            .map_err(StorageError::from)?
            .into_iter()
            .map(TargetAllocationAttributionDB::to_domain)
            .collect::<Result<Vec<_>>>()?;

        let exclusions = target_allocation_exclusions::table
            .order(target_allocation_exclusions::subject_key.asc())
            .load::<TargetAllocationExclusionDB>(&mut conn)
            .map_err(StorageError::from)?
            .into_iter()
            .map(TargetAllocationExclusionDB::to_domain)
            .collect::<Result<Vec<_>>>()?;

        Ok(TargetAllocationPlanData {
            has_plan,
            nodes,
            account_defaults,
            attributions,
            exclusions,
        })
    }

    async fn save_plan_data(&self, plan: TargetAllocationPlanData) -> Result<()> {
        self.writer
            .exec_tx(move |tx| -> Result<()> {
                let now = chrono::Utc::now().to_rfc3339();
                let plan_db = TargetAllocationPlanDB {
                    id: DEFAULT_PLAN_ID.to_string(),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };

                diesel::insert_into(target_allocation_plan::table)
                    .values(&plan_db)
                    .on_conflict(target_allocation_plan::id)
                    .do_update()
                    .set(target_allocation_plan::updated_at.eq(&now))
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;

                delete_existing_plan_rows(tx)?;

                let node_rows: Vec<TargetAllocationNodeDB> = plan
                    .nodes
                    .into_iter()
                    .map(|node| TargetAllocationNodeDB::from_domain(node, &now))
                    .collect();
                insert_nodes_topologically(tx, node_rows)?;

                for default in plan.account_defaults {
                    let row = TargetAllocationAccountDefaultDB::from_domain(default, &now);
                    diesel::insert_into(target_allocation_account_defaults::table)
                        .values(&row)
                        .execute(tx.conn())
                        .map_err(StorageError::from)?;
                    tx.insert(&row)?;
                }

                for attribution in plan.attributions {
                    let row = TargetAllocationAttributionDB::from_domain(attribution, &now);
                    diesel::insert_into(target_allocation_attributions::table)
                        .values(&row)
                        .execute(tx.conn())
                        .map_err(StorageError::from)?;
                    tx.insert(&row)?;
                }

                for exclusion in plan.exclusions {
                    let row = TargetAllocationExclusionDB::from_domain(exclusion, &now);
                    diesel::insert_into(target_allocation_exclusions::table)
                        .values(&row)
                        .execute(tx.conn())
                        .map_err(StorageError::from)?;
                    tx.insert(&row)?;
                }

                tx.update(&plan_db)?;
                Ok(())
            })
            .await
    }

    async fn set_account_default(
        &self,
        account_id: &str,
        folder_node_id: Option<String>,
    ) -> Result<()> {
        let account_id = account_id.to_string();
        self.writer
            .exec_tx(move |tx| -> Result<()> {
                let now = chrono::Utc::now().to_rfc3339();
                if let Some(folder_node_id) = folder_node_id {
                    let plan_db = TargetAllocationPlanDB {
                        id: DEFAULT_PLAN_ID.to_string(),
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    };
                    diesel::insert_into(target_allocation_plan::table)
                        .values(&plan_db)
                        .on_conflict(target_allocation_plan::id)
                        .do_update()
                        .set(target_allocation_plan::updated_at.eq(&now))
                        .execute(tx.conn())
                        .map_err(StorageError::from)?;
                    tx.update(&plan_db)?;

                    let row = TargetAllocationAccountDefaultDB {
                        account_id,
                        folder_node_id,
                        created_at: now.clone(),
                        updated_at: now,
                    };
                    diesel::insert_into(target_allocation_account_defaults::table)
                        .values(&row)
                        .on_conflict(target_allocation_account_defaults::account_id)
                        .do_update()
                        .set((
                            target_allocation_account_defaults::folder_node_id
                                .eq(&row.folder_node_id),
                            target_allocation_account_defaults::updated_at.eq(&row.updated_at),
                        ))
                        .execute(tx.conn())
                        .map_err(StorageError::from)?;
                    tx.update(&row)?;
                } else {
                    let deleted = diesel::delete(
                        target_allocation_account_defaults::table.find(account_id.clone()),
                    )
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;
                    if deleted > 0 {
                        tx.delete::<TargetAllocationAccountDefaultDB>(account_id);
                    }
                }
                Ok(())
            })
            .await
    }
}

fn delete_existing_plan_rows(tx: &mut crate::db::write_actor::DbWriteTx<'_>) -> Result<()> {
    let default_ids = target_allocation_account_defaults::table
        .select(target_allocation_account_defaults::account_id)
        .load::<String>(tx.conn())
        .map_err(StorageError::from)?;
    diesel::delete(target_allocation_account_defaults::table)
        .execute(tx.conn())
        .map_err(StorageError::from)?;
    for id in default_ids {
        tx.delete::<TargetAllocationAccountDefaultDB>(id);
    }

    let attribution_ids = target_allocation_attributions::table
        .select(target_allocation_attributions::subject_key)
        .load::<String>(tx.conn())
        .map_err(StorageError::from)?;
    diesel::delete(target_allocation_attributions::table)
        .execute(tx.conn())
        .map_err(StorageError::from)?;
    for id in attribution_ids {
        tx.delete::<TargetAllocationAttributionDB>(id);
    }

    let exclusion_ids = target_allocation_exclusions::table
        .select(target_allocation_exclusions::subject_key)
        .load::<String>(tx.conn())
        .map_err(StorageError::from)?;
    diesel::delete(target_allocation_exclusions::table)
        .execute(tx.conn())
        .map_err(StorageError::from)?;
    for id in exclusion_ids {
        tx.delete::<TargetAllocationExclusionDB>(id);
    }

    let node_ids = target_allocation_nodes::table
        .select(target_allocation_nodes::id)
        .load::<String>(tx.conn())
        .map_err(StorageError::from)?;
    diesel::delete(target_allocation_nodes::table)
        .execute(tx.conn())
        .map_err(StorageError::from)?;
    for id in node_ids {
        tx.delete::<TargetAllocationNodeDB>(id);
    }

    Ok(())
}

fn insert_nodes_topologically(
    tx: &mut crate::db::write_actor::DbWriteTx<'_>,
    nodes: Vec<TargetAllocationNodeDB>,
) -> Result<()> {
    let mut pending = nodes;
    let mut inserted = HashSet::new();

    while !pending.is_empty() {
        let mut progress = false;
        let mut next_pending = Vec::new();

        for node in pending {
            let parent_ready = node
                .parent_id
                .as_ref()
                .is_none_or(|parent_id| inserted.contains(parent_id));
            if parent_ready {
                diesel::insert_into(target_allocation_nodes::table)
                    .values(&node)
                    .execute(tx.conn())
                    .map_err(StorageError::from)?;
                tx.insert(&node)?;
                inserted.insert(node.id.clone());
                progress = true;
            } else {
                next_pending.push(node);
            }
        }

        if !progress {
            return Err(ValidationError::InvalidInput(
                "Target allocation tree contains a missing or circular parent".to_string(),
            )
            .into());
        }

        pending = next_pending;
    }

    Ok(())
}
