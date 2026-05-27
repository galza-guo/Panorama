use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use wealthfolio_core::portfolio::target_allocation::{
    TargetAllocationAccountDefault, TargetAllocationAssetRef, TargetAllocationAttribution,
    TargetAllocationCalculator, TargetAllocationDisplayRow, TargetAllocationHoldingInput,
    TargetAllocationInput, TargetAllocationNode, TargetAllocationNodeKind, TargetAllocationRowKind,
    TargetAllocationSubjectType,
};

fn folder(
    id: &str,
    parent_id: Option<&str>,
    name: &str,
    target: Option<Decimal>,
) -> TargetAllocationNode {
    TargetAllocationNode {
        id: id.to_string(),
        parent_id: parent_id.map(str::to_string),
        node_kind: TargetAllocationNodeKind::Folder,
        name: name.to_string(),
        target_percent: target,
        asset_ref: None,
        color: None,
        icon: None,
        sort_order: 0,
    }
}

fn asset(
    id: &str,
    parent_id: &str,
    name: &str,
    asset_id: &str,
    target: Option<Decimal>,
) -> TargetAllocationNode {
    TargetAllocationNode {
        id: id.to_string(),
        parent_id: Some(parent_id.to_string()),
        node_kind: TargetAllocationNodeKind::Asset,
        name: name.to_string(),
        target_percent: target,
        asset_ref: Some(TargetAllocationAssetRef::Asset {
            asset_id: asset_id.to_string(),
        }),
        color: None,
        icon: None,
        sort_order: 0,
    }
}

fn holding(
    account_id: &str,
    asset_id: &str,
    symbol: &str,
    value: Decimal,
) -> TargetAllocationHoldingInput {
    TargetAllocationHoldingInput {
        subject_key: format!("position:{account_id}:{asset_id}"),
        subject_type: TargetAllocationSubjectType::Position,
        account_id: Some(account_id.to_string()),
        account_name: Some(account_id.to_string()),
        asset_id: Some(asset_id.to_string()),
        currency: "HKD".to_string(),
        symbol: symbol.to_string(),
        name: Some(symbol.to_string()),
        value_base: value,
    }
}

fn default_input() -> TargetAllocationInput {
    TargetAllocationInput {
        currency: "HKD".to_string(),
        nodes: Vec::new(),
        account_defaults: Vec::new(),
        attributions: Vec::new(),
        exclusions: Vec::new(),
        holdings: Vec::new(),
    }
}

fn child<'a>(row: &'a TargetAllocationDisplayRow, name: &str) -> &'a TargetAllocationDisplayRow {
    row.children
        .iter()
        .find(|child| child.name == name)
        .unwrap_or_else(|| panic!("expected child {name} under {}", row.name))
}

#[test]
fn calculates_other_only_from_leftover_target_capacity() {
    let input = TargetAllocationInput {
        nodes: vec![
            folder("pot", None, "Pot", Some(dec!(100))),
            folder("hk", Some("pot"), "HK Core", Some(dec!(100))),
            asset("hk-2800", "hk", "2800.HK", "asset-2800", Some(dec!(60))),
        ],
        account_defaults: vec![TargetAllocationAccountDefault {
            account_id: "acct-a".to_string(),
            folder_node_id: "hk".to_string(),
        }],
        holdings: vec![
            holding("acct-a", "asset-2800", "2800.HK", dec!(60)),
            holding("acct-a", "asset-1211", "1211.HK", dec!(40)),
        ],
        ..default_input()
    };

    let dashboard = TargetAllocationCalculator::calculate(input).expect("calculation succeeds");
    let hk_core = child(child(&dashboard.root, "Pot"), "HK Core");
    let hk_2800 = child(hk_core, "2800.HK");
    let other = child(hk_core, "Other");

    assert_eq!(hk_2800.current_value, dec!(60));
    assert_eq!(hk_2800.current_percent, dec!(60.0));
    assert_eq!(hk_2800.target_percent, Some(dec!(60)));
    assert_eq!(hk_2800.status_symbol.as_deref(), Some("~"));

    assert_eq!(other.kind, TargetAllocationRowKind::Other);
    assert_eq!(other.current_value, dec!(40));
    assert_eq!(other.current_percent, dec!(40.0));
    assert_eq!(other.target_percent, Some(dec!(40)));
    assert_eq!(other.status_symbol.as_deref(), Some("~"));
}

#[test]
fn puts_current_value_in_untargeted_when_children_already_target_100_percent() {
    let input = TargetAllocationInput {
        nodes: vec![
            folder("pot", None, "Pot", Some(dec!(100))),
            folder("hk", Some("pot"), "HK Core", Some(dec!(100))),
            asset("hk-2800", "hk", "2800.HK", "asset-2800", Some(dec!(60))),
            asset("hk-3033", "hk", "3033.HK", "asset-3033", Some(dec!(40))),
        ],
        account_defaults: vec![TargetAllocationAccountDefault {
            account_id: "acct-a".to_string(),
            folder_node_id: "hk".to_string(),
        }],
        holdings: vec![
            holding("acct-a", "asset-2800", "2800.HK", dec!(60)),
            holding("acct-a", "asset-3033", "3033.HK", dec!(20)),
            holding("acct-a", "asset-1211", "1211.HK", dec!(20)),
        ],
        ..default_input()
    };

    let dashboard = TargetAllocationCalculator::calculate(input).expect("calculation succeeds");
    let hk_core = child(child(&dashboard.root, "Pot"), "HK Core");
    let untargeted = child(hk_core, "Untargeted");

    assert!(hk_core.children.iter().all(|row| row.name != "Other"));
    assert_eq!(untargeted.kind, TargetAllocationRowKind::Untargeted);
    assert_eq!(untargeted.current_value, dec!(20));
    assert_eq!(untargeted.target_percent, None);
    assert_eq!(untargeted.status_symbol, None);
}

#[test]
fn holding_override_wins_over_account_default() {
    let input = TargetAllocationInput {
        nodes: vec![
            folder("pot-2", None, "Pot 2", Some(dec!(40))),
            folder("pot-3", None, "Pot 3", Some(dec!(60))),
        ],
        account_defaults: vec![TargetAllocationAccountDefault {
            account_id: "acct-a".to_string(),
            folder_node_id: "pot-3".to_string(),
        }],
        attributions: vec![TargetAllocationAttribution {
            subject_key: "position:acct-a:asset-2800".to_string(),
            subject_type: TargetAllocationSubjectType::Position,
            folder_node_id: "pot-2".to_string(),
        }],
        holdings: vec![
            holding("acct-a", "asset-2800", "2800.HK", dec!(30)),
            holding("acct-a", "asset-1211", "1211.HK", dec!(70)),
        ],
        ..default_input()
    };

    let dashboard = TargetAllocationCalculator::calculate(input).expect("calculation succeeds");

    assert_eq!(child(&dashboard.root, "Pot 2").current_value, dec!(30));
    assert_eq!(child(&dashboard.root, "Pot 3").current_value, dec!(70));
}

#[test]
fn aggregates_same_asset_positions_only_within_their_assigned_folder() {
    let input = TargetAllocationInput {
        nodes: vec![
            folder("hk", None, "HK Core", Some(dec!(60))),
            folder("growth", None, "Growth", Some(dec!(40))),
            asset("hk-2800", "hk", "2800.HK", "asset-2800", Some(dec!(100))),
            asset(
                "growth-2800",
                "growth",
                "2800.HK",
                "asset-2800",
                Some(dec!(100)),
            ),
        ],
        account_defaults: vec![
            TargetAllocationAccountDefault {
                account_id: "acct-a".to_string(),
                folder_node_id: "hk".to_string(),
            },
            TargetAllocationAccountDefault {
                account_id: "acct-c".to_string(),
                folder_node_id: "growth".to_string(),
            },
        ],
        attributions: vec![TargetAllocationAttribution {
            subject_key: "position:acct-b:asset-2800".to_string(),
            subject_type: TargetAllocationSubjectType::Position,
            folder_node_id: "hk".to_string(),
        }],
        holdings: vec![
            holding("acct-a", "asset-2800", "2800.HK", dec!(30)),
            holding("acct-b", "asset-2800", "2800.HK", dec!(20)),
            holding("acct-c", "asset-2800", "2800.HK", dec!(40)),
        ],
        ..default_input()
    };

    let dashboard = TargetAllocationCalculator::calculate(input).expect("calculation succeeds");

    assert_eq!(
        child(child(&dashboard.root, "HK Core"), "2800.HK").current_value,
        dec!(50)
    );
    assert_eq!(
        child(child(&dashboard.root, "Growth"), "2800.HK").current_value,
        dec!(40)
    );
}
