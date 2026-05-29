use std::collections::{HashMap, HashSet};

use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use crate::errors::{Result, ValidationError};

use super::{
    TargetAllocationAssetRef, TargetAllocationDashboard, TargetAllocationDisplayRow,
    TargetAllocationHoldingBreakdown, TargetAllocationHoldingInput, TargetAllocationInput,
    TargetAllocationNode, TargetAllocationNodeKind, TargetAllocationRowKind,
};

const ROOT_ID: &str = "root";

pub struct TargetAllocationCalculator;

#[derive(Clone)]
struct OrderedNode {
    index: usize,
    node: TargetAllocationNode,
}

struct CalculationContext {
    currency: String,
    nodes_by_id: HashMap<String, TargetAllocationNode>,
    ordered_children: HashMap<Option<String>, Vec<OrderedNode>>,
    direct_holdings: HashMap<Option<String>, Vec<TargetAllocationHoldingInput>>,
    folder_current_values: HashMap<String, Decimal>,
    excluded_holdings: Vec<TargetAllocationHoldingInput>,
}

impl TargetAllocationCalculator {
    pub fn calculate(input: TargetAllocationInput) -> Result<TargetAllocationDashboard> {
        validate_sibling_targets(&input.nodes)?;

        let explicit_untargeted_keys: HashSet<&str> = input
            .exclusions
            .iter()
            .map(|exclusion| exclusion.subject_key.as_str())
            .collect();

        let nodes_by_id: HashMap<String, TargetAllocationNode> = input
            .nodes
            .iter()
            .map(|node| (node.id.clone(), node.clone()))
            .collect();

        let mut ordered_children: HashMap<Option<String>, Vec<OrderedNode>> = HashMap::new();
        for (index, node) in input.nodes.iter().cloned().enumerate() {
            ordered_children
                .entry(node.parent_id.clone())
                .or_default()
                .push(OrderedNode { index, node });
        }
        for children in ordered_children.values_mut() {
            children.sort_by(|a, b| {
                a.node
                    .sort_order
                    .cmp(&b.node.sort_order)
                    .then_with(|| a.index.cmp(&b.index))
            });
        }

        let folder_ids: HashSet<&str> = input
            .nodes
            .iter()
            .filter(|node| node.node_kind == TargetAllocationNodeKind::Folder)
            .map(|node| node.id.as_str())
            .collect();

        let attributions_by_subject: HashMap<&str, &str> = input
            .attributions
            .iter()
            .map(|attribution| {
                (
                    attribution.subject_key.as_str(),
                    attribution.folder_node_id.as_str(),
                )
            })
            .collect();

        let account_defaults: HashMap<&str, &str> = input
            .account_defaults
            .iter()
            .map(|default| (default.account_id.as_str(), default.folder_node_id.as_str()))
            .collect();

        let mut direct_holdings: HashMap<Option<String>, Vec<TargetAllocationHoldingInput>> =
            HashMap::new();
        let mut explicit_untargeted_holdings = Vec::new();
        for holding in input.holdings {
            let is_explicit_untargeted =
                explicit_untargeted_keys.contains(holding.subject_key.as_str());
            if is_explicit_untargeted {
                explicit_untargeted_holdings.push(holding.clone());
            }

            let folder_id = if is_explicit_untargeted {
                None
            } else {
                let explicit_folder = attributions_by_subject
                    .get(holding.subject_key.as_str())
                    .copied()
                    .filter(|folder_id| folder_ids.contains(*folder_id));

                let default_folder = holding
                    .account_id
                    .as_deref()
                    .and_then(|account_id| account_defaults.get(account_id).copied())
                    .filter(|folder_id| folder_ids.contains(*folder_id));

                explicit_folder.or(default_folder).map(str::to_string)
            };
            direct_holdings.entry(folder_id).or_default().push(holding);
        }

        let total_current_value = sum_holdings(direct_holdings.values().flatten());
        let mut context = CalculationContext {
            currency: input.currency,
            nodes_by_id,
            ordered_children,
            direct_holdings,
            folder_current_values: HashMap::new(),
            excluded_holdings: explicit_untargeted_holdings,
        };

        let folder_ids_to_compute: Vec<String> = context
            .nodes_by_id
            .values()
            .filter(|node| node.node_kind == TargetAllocationNodeKind::Folder)
            .map(|node| node.id.clone())
            .collect();
        for folder_id in folder_ids_to_compute {
            let _ = compute_folder_current_value(&folder_id, &mut context);
        }

        let root_children = build_display_children(
            None,
            total_current_value,
            Some(total_current_value),
            total_current_value,
            &context,
        );

        let root = TargetAllocationDisplayRow {
            id: ROOT_ID.to_string(),
            kind: TargetAllocationRowKind::Root,
            node_kind: None,
            name: "Total Assets".to_string(),
            target_percent: Some(dec!(100)),
            current_percent: if total_current_value > Decimal::ZERO {
                dec!(100.0)
            } else {
                Decimal::ZERO
            },
            effective_current_percent: if total_current_value > Decimal::ZERO {
                dec!(100.0)
            } else {
                Decimal::ZERO
            },
            effective_target_percent: Some(dec!(100.0)),
            current_value: total_current_value,
            target_value: Some(total_current_value),
            value_gap: Some(Decimal::ZERO),
            percent_gap: Some(Decimal::ZERO),
            status_symbol: Some("~".to_string()),
            color: None,
            icon: None,
            asset_ref: None,
            is_virtual: true,
            is_auto_target: false,
            breakdown: context
                .direct_holdings
                .values()
                .flatten()
                .map(TargetAllocationHoldingBreakdown::from)
                .collect(),
            children: root_children,
        };

        Ok(TargetAllocationDashboard {
            currency: context.currency,
            has_plan: !context.nodes_by_id.is_empty(),
            root,
            excluded_holdings: context
                .excluded_holdings
                .iter()
                .map(TargetAllocationHoldingBreakdown::from)
                .collect(),
        })
    }
}

fn validate_sibling_targets(nodes: &[TargetAllocationNode]) -> Result<()> {
    let mut sums: HashMap<Option<&str>, Decimal> = HashMap::new();
    for node in nodes {
        if let Some(target) = node.target_percent {
            if target < Decimal::ZERO || target > dec!(100) {
                return Err(ValidationError::InvalidInput(format!(
                    "Target percentage for '{}' must be between 0 and 100",
                    node.name
                ))
                .into());
            }
            *sums.entry(node.parent_id.as_deref()).or_default() += target;
        }
    }

    for (parent_id, sum) in sums {
        if sum > dec!(100) {
            let scope = parent_id.unwrap_or(ROOT_ID);
            return Err(ValidationError::InvalidInput(format!(
                "Target percentages under {scope} exceed 100%"
            ))
            .into());
        }
    }

    Ok(())
}

fn compute_folder_current_value(folder_id: &str, context: &mut CalculationContext) -> Decimal {
    if let Some(value) = context.folder_current_values.get(folder_id) {
        return *value;
    }

    let mut value = sum_holdings(
        context
            .direct_holdings
            .get(&Some(folder_id.to_string()))
            .into_iter()
            .flatten(),
    );

    let child_folder_ids: Vec<String> = context
        .ordered_children
        .get(&Some(folder_id.to_string()))
        .into_iter()
        .flatten()
        .filter(|child| child.node.node_kind == TargetAllocationNodeKind::Folder)
        .map(|child| child.node.id.clone())
        .collect();

    for child_folder_id in child_folder_ids {
        value += compute_folder_current_value(&child_folder_id, context);
    }

    context
        .folder_current_values
        .insert(folder_id.to_string(), value);
    value
}

fn build_display_children(
    parent_id: Option<&str>,
    parent_current_value: Decimal,
    parent_target_value: Option<Decimal>,
    root_current_value: Decimal,
    context: &CalculationContext,
) -> Vec<TargetAllocationDisplayRow> {
    let parent_key = parent_id.map(str::to_string);
    let children = context
        .ordered_children
        .get(&parent_key)
        .cloned()
        .unwrap_or_default();

    let direct_holdings = context
        .direct_holdings
        .get(&parent_key)
        .cloned()
        .unwrap_or_default();

    let mut matched_subjects = HashSet::new();
    let mut child_rows = Vec::new();

    for child in children {
        let row = build_node_row(
            &child.node,
            parent_current_value,
            parent_target_value,
            root_current_value,
            &direct_holdings,
            &mut matched_subjects,
            context,
        );
        child_rows.push(row);
    }

    let unmatched_holdings: Vec<TargetAllocationHoldingInput> = direct_holdings
        .into_iter()
        .filter(|holding| !matched_subjects.contains(holding.subject_key.as_str()))
        .collect();
    let unmatched_current_value = sum_holdings(unmatched_holdings.iter());

    let explicit_target_sum: Decimal = child_rows.iter().filter_map(|row| row.target_percent).sum();
    let has_explicit_child_target = child_rows.iter().any(|row| row.target_percent.is_some());

    if has_explicit_child_target {
        let mut planned_rows = Vec::new();
        let mut blank_rows = Vec::new();
        for row in child_rows {
            if row.target_percent.is_some() {
                planned_rows.push(row);
            } else {
                blank_rows.push(row);
            }
        }

        if explicit_target_sum < dec!(100) {
            let other_current_value = unmatched_current_value
                + blank_rows
                    .iter()
                    .map(|row| row.current_value)
                    .sum::<Decimal>();
            let other_target_percent = dec!(100) - explicit_target_sum;
            let mut other = build_virtual_row(
                parent_id,
                TargetAllocationRowKind::Other,
                "Other",
                other_current_value,
                parent_current_value,
                Some(other_target_percent),
                parent_target_value,
                root_current_value,
                true,
                unmatched_holdings,
                blank_rows,
            );
            rebase_children(&mut other, root_current_value);
            planned_rows.push(other);
        } else if unmatched_current_value > Decimal::ZERO || !blank_rows.is_empty() {
            let untargeted_current_value = unmatched_current_value
                + blank_rows
                    .iter()
                    .map(|row| row.current_value)
                    .sum::<Decimal>();
            let mut untargeted = build_virtual_row(
                parent_id,
                TargetAllocationRowKind::Untargeted,
                "Untargeted",
                untargeted_current_value,
                parent_current_value,
                None,
                None,
                root_current_value,
                false,
                unmatched_holdings,
                blank_rows,
            );
            rebase_children(&mut untargeted, root_current_value);
            planned_rows.push(untargeted);
        }

        sort_rows_by_planned_weight(&mut planned_rows);
        return planned_rows;
    }

    let mut rows = child_rows;
    if unmatched_current_value > Decimal::ZERO {
        rows.push(build_virtual_row(
            parent_id,
            TargetAllocationRowKind::Untargeted,
            "Untargeted",
            unmatched_current_value,
            parent_current_value,
            None,
            None,
            root_current_value,
            false,
            unmatched_holdings,
            Vec::new(),
        ));
    }
    sort_rows_by_planned_weight(&mut rows);

    rows
}

fn sort_rows_by_planned_weight(rows: &mut [TargetAllocationDisplayRow]) {
    rows.sort_by(|a, b| match (a.target_percent, b.target_percent) {
        (Some(a_target), Some(b_target)) => b_target.cmp(&a_target),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    });
}

fn build_node_row(
    node: &TargetAllocationNode,
    parent_current_value: Decimal,
    parent_target_value: Option<Decimal>,
    root_current_value: Decimal,
    direct_parent_holdings: &[TargetAllocationHoldingInput],
    matched_subjects: &mut HashSet<String>,
    context: &CalculationContext,
) -> TargetAllocationDisplayRow {
    let (current_value, breakdown, children) = match node.node_kind {
        TargetAllocationNodeKind::Folder => {
            let current_value = context
                .folder_current_values
                .get(&node.id)
                .copied()
                .unwrap_or(Decimal::ZERO);
            let target_value = target_value(parent_target_value, node.target_percent);
            let children = build_display_children(
                Some(&node.id),
                current_value,
                target_value,
                root_current_value,
                context,
            );
            let breakdown = collect_folder_breakdown(&node.id, context);
            (current_value, breakdown, children)
        }
        TargetAllocationNodeKind::Asset => {
            let matching: Vec<TargetAllocationHoldingInput> = direct_parent_holdings
                .iter()
                .filter(|holding| {
                    node.asset_ref
                        .as_ref()
                        .is_some_and(|asset_ref| holding_matches_asset_ref(holding, asset_ref))
                })
                .cloned()
                .collect();
            for holding in &matching {
                matched_subjects.insert(holding.subject_key.clone());
            }
            let current_value = sum_holdings(matching.iter());
            let breakdown = matching
                .iter()
                .map(TargetAllocationHoldingBreakdown::from)
                .collect();
            (current_value, breakdown, Vec::new())
        }
    };

    build_row(
        node.id.clone(),
        match node.node_kind {
            TargetAllocationNodeKind::Folder => TargetAllocationRowKind::Folder,
            TargetAllocationNodeKind::Asset => TargetAllocationRowKind::Asset,
        },
        Some(node.node_kind.clone()),
        node.name.clone(),
        current_value,
        parent_current_value,
        node.target_percent,
        parent_target_value,
        root_current_value,
        node.color.clone(),
        node.icon.clone(),
        node.asset_ref.clone(),
        false,
        false,
        breakdown,
        children,
    )
}

#[allow(clippy::too_many_arguments)]
fn build_virtual_row(
    parent_id: Option<&str>,
    kind: TargetAllocationRowKind,
    name: &str,
    current_value: Decimal,
    parent_current_value: Decimal,
    target_percent: Option<Decimal>,
    parent_target_value: Option<Decimal>,
    root_current_value: Decimal,
    is_auto_target: bool,
    unmatched_holdings: Vec<TargetAllocationHoldingInput>,
    children: Vec<TargetAllocationDisplayRow>,
) -> TargetAllocationDisplayRow {
    let virtual_id = format!(
        "{}:{}",
        match kind {
            TargetAllocationRowKind::Other => "other",
            TargetAllocationRowKind::Untargeted => "untargeted",
            _ => "virtual",
        },
        parent_id.unwrap_or(ROOT_ID)
    );
    let mut breakdown: Vec<TargetAllocationHoldingBreakdown> = unmatched_holdings
        .iter()
        .map(TargetAllocationHoldingBreakdown::from)
        .collect();
    for child in &children {
        breakdown.extend(child.breakdown.clone());
    }

    build_row(
        virtual_id,
        kind,
        None,
        name.to_string(),
        current_value,
        parent_current_value,
        target_percent,
        parent_target_value,
        root_current_value,
        Some("#8a8f98".to_string()),
        Some("ellipsis".to_string()),
        None,
        true,
        is_auto_target,
        breakdown,
        children,
    )
}

#[allow(clippy::too_many_arguments)]
fn build_row(
    id: String,
    kind: TargetAllocationRowKind,
    node_kind: Option<TargetAllocationNodeKind>,
    name: String,
    current_value: Decimal,
    parent_current_value: Decimal,
    target_percent: Option<Decimal>,
    parent_target_value: Option<Decimal>,
    root_current_value: Decimal,
    color: Option<String>,
    icon: Option<String>,
    asset_ref: Option<TargetAllocationAssetRef>,
    is_virtual: bool,
    is_auto_target: bool,
    breakdown: Vec<TargetAllocationHoldingBreakdown>,
    children: Vec<TargetAllocationDisplayRow>,
) -> TargetAllocationDisplayRow {
    let current_percent = percentage(current_value, parent_current_value);
    let effective_current_percent = percentage(current_value, root_current_value);
    let target_value = target_value(parent_target_value, target_percent);
    let effective_target_percent = target_value.map(|value| percentage(value, root_current_value));
    let value_gap = target_value.map(|value| current_value - value);
    let percent_gap = target_percent.map(|target| current_percent - target);
    let status_symbol = percent_gap.map(status_symbol);

    TargetAllocationDisplayRow {
        id,
        kind,
        node_kind,
        name,
        target_percent,
        current_percent,
        effective_current_percent,
        effective_target_percent,
        current_value,
        target_value,
        value_gap,
        percent_gap,
        status_symbol,
        color,
        icon,
        asset_ref,
        is_virtual,
        is_auto_target,
        breakdown,
        children,
    }
}

fn rebase_children(row: &mut TargetAllocationDisplayRow, root_current_value: Decimal) {
    let parent_current_value = row.current_value;
    for child in &mut row.children {
        child.current_percent = percentage(child.current_value, parent_current_value);
        child.effective_current_percent = percentage(child.current_value, root_current_value);
        if let Some(target_percent) = child.target_percent {
            child.target_value = target_value(row.target_value, Some(target_percent));
            child.effective_target_percent = child
                .target_value
                .map(|value| percentage(value, root_current_value));
            child.value_gap = child.target_value.map(|value| child.current_value - value);
            child.percent_gap = Some(child.current_percent - target_percent);
            child.status_symbol = child.percent_gap.map(status_symbol);
        }
    }
}

fn collect_folder_breakdown(
    folder_id: &str,
    context: &CalculationContext,
) -> Vec<TargetAllocationHoldingBreakdown> {
    let mut breakdown: Vec<TargetAllocationHoldingBreakdown> = context
        .direct_holdings
        .get(&Some(folder_id.to_string()))
        .into_iter()
        .flatten()
        .map(TargetAllocationHoldingBreakdown::from)
        .collect();

    if let Some(children) = context.ordered_children.get(&Some(folder_id.to_string())) {
        for child in children {
            if child.node.node_kind == TargetAllocationNodeKind::Folder {
                breakdown.extend(collect_folder_breakdown(&child.node.id, context));
            }
        }
    }

    breakdown
}

fn holding_matches_asset_ref(
    holding: &TargetAllocationHoldingInput,
    asset_ref: &TargetAllocationAssetRef,
) -> bool {
    match asset_ref {
        TargetAllocationAssetRef::Asset { asset_id } => {
            holding.asset_id.as_deref() == Some(asset_id.as_str())
        }
        TargetAllocationAssetRef::Cash { currency } => {
            holding.currency.eq_ignore_ascii_case(currency)
                && matches!(
                    holding.subject_type,
                    super::TargetAllocationSubjectType::Cash
                )
        }
    }
}

fn target_value(
    parent_target_value: Option<Decimal>,
    target_percent: Option<Decimal>,
) -> Option<Decimal> {
    match (parent_target_value, target_percent) {
        (Some(parent_value), Some(target)) => Some(parent_value * target / dec!(100)),
        _ => None,
    }
}

fn percentage(value: Decimal, denominator: Decimal) -> Decimal {
    if denominator <= Decimal::ZERO {
        Decimal::ZERO
    } else {
        (value / denominator * dec!(100)).round_dp(1)
    }
}

fn status_symbol(gap: Decimal) -> String {
    if gap.abs() <= dec!(5) {
        "~".to_string()
    } else if gap > Decimal::ZERO {
        if gap <= dec!(10) {
            "+".to_string()
        } else if gap <= dec!(20) {
            "++".to_string()
        } else {
            "+++".to_string()
        }
    } else if gap >= dec!(-10) {
        "-".to_string()
    } else if gap >= dec!(-20) {
        "--".to_string()
    } else {
        "---".to_string()
    }
}

fn sum_holdings<'a>(
    holdings: impl IntoIterator<Item = &'a TargetAllocationHoldingInput>,
) -> Decimal {
    holdings.into_iter().map(|holding| holding.value_base).sum()
}

#[cfg(test)]
mod tests {
    use rust_decimal_macros::dec;

    use super::*;
    use crate::portfolio::target_allocation::{
        TargetAllocationAccountDefault, TargetAllocationExclusion, TargetAllocationSubjectType,
    };

    fn folder(id: &str, name: &str) -> TargetAllocationNode {
        TargetAllocationNode {
            id: id.to_string(),
            parent_id: None,
            node_kind: TargetAllocationNodeKind::Folder,
            name: name.to_string(),
            target_percent: None,
            asset_ref: None,
            color: None,
            icon: None,
            sort_order: 0,
        }
    }

    fn holding(subject_key: &str, account_id: &str, value_base: Decimal) -> TargetAllocationHoldingInput {
        TargetAllocationHoldingInput {
            subject_key: subject_key.to_string(),
            subject_type: TargetAllocationSubjectType::Position,
            account_id: Some(account_id.to_string()),
            account_name: Some("Account A".to_string()),
            asset_id: Some("asset-2840".to_string()),
            currency: "HKD".to_string(),
            symbol: "2840".to_string(),
            name: Some("SPDR Gold Trust".to_string()),
            value_base,
        }
    }

    #[test]
    fn explicit_untargeted_holding_stays_in_total_and_overrides_account_default() {
        let subject_key = "position:account-a:asset-2840";
        let dashboard = TargetAllocationCalculator::calculate(TargetAllocationInput {
            currency: "HKD".to_string(),
            nodes: vec![folder("pot-3", "Pot 3")],
            account_defaults: vec![TargetAllocationAccountDefault {
                account_id: "account-a".to_string(),
                folder_node_id: "pot-3".to_string(),
            }],
            attributions: Vec::new(),
            exclusions: vec![TargetAllocationExclusion {
                subject_key: subject_key.to_string(),
                subject_type: TargetAllocationSubjectType::Position,
            }],
            holdings: vec![holding(subject_key, "account-a", dec!(100))],
        })
        .expect("calculation should succeed");

        assert_eq!(dashboard.root.current_value, dec!(100));
        assert_eq!(dashboard.root.breakdown.len(), 1);
        assert_eq!(dashboard.root.children.len(), 2);
        let untargeted = dashboard
            .root
            .children
            .iter()
            .find(|row| row.kind == TargetAllocationRowKind::Untargeted)
            .expect("explicitly untargeted holding should appear in Untargeted");
        let pot = dashboard
            .root
            .children
            .iter()
            .find(|row| row.name == "Pot 3")
            .expect("account default folder should still render");

        assert_eq!(untargeted.current_value, dec!(100));
        assert_eq!(pot.current_value, dec!(0));
    }
}
