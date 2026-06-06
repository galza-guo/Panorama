import { describe, expect, it } from "vitest";

import {
  assetNodeMatchingHoldings,
  canMoveNodeUnder,
  buildHoldingAssignmentGroups,
  buildHoldingAssignmentTree,
  applyNodeEditDraft,
  compactFolderPath,
  deleteFolderAndMoveContentsToParent,
  deleteFolderAndUntargetContents,
  deleteNodeDirectly,
  explicitUntargetHoldings,
  folderPath,
  holdingAccountDefaultPath,
  holdingAssignmentState,
  moveNodeUnder,
  nodeEditDraftFromNode,
  removeHoldingOverrides,
  untargetAssetNode,
} from "./target-allocation-editor-utils";
import type {
  TargetAllocationHoldingInput,
  TargetAllocationNode,
  TargetAllocationPlanData,
} from "@/lib/types";

function folder(id: string, name: string, parentId: string | null = null): TargetAllocationNode {
  return {
    id,
    parentId,
    nodeKind: "folder",
    name,
    targetPercent: null,
    assetRef: null,
    color: null,
    icon: "folder",
    sortOrder: 0,
  };
}

function assetNode(
  id: string,
  name: string,
  parentId: string | null,
  assetId: string,
): TargetAllocationNode {
  return {
    id,
    parentId,
    nodeKind: "asset",
    name,
    targetPercent: null,
    assetRef: { kind: "asset", assetId },
    color: null,
    icon: null,
    sortOrder: 0,
  };
}

function holding(
  subjectKey: string,
  accountId: string | null,
  accountName: string | null,
  symbol: string,
): TargetAllocationHoldingInput {
  return {
    subjectKey,
    subjectType: symbol === "HKD" ? "cash" : "position",
    accountId,
    accountName,
    assetId: symbol === "HKD" ? null : `asset-${symbol}`,
    currency: "HKD",
    symbol,
    name: symbol,
    valueBase: 100,
  };
}

const nodes = [
  folder("pot-3", "Pot 3"),
  folder("equities", "Equities", "pot-3"),
  folder("hk", "HK", "equities"),
  folder("hk-offense", "HK Offense", "hk"),
  folder("alternatives", "Alternatives", "pot-3"),
  folder("gold", "Gold", "alternatives"),
];

const emptyPlan: TargetAllocationPlanData = {
  hasPlan: true,
  nodes,
  accountDefaults: [],
  attributions: [],
  exclusions: [],
};

describe("target allocation editor assignment helpers", () => {
  it("builds readable folder paths", () => {
    expect(folderPath(nodes, "gold")).toBe("Pot 3 > Alternatives > Gold");
    expect(folderPath(nodes, "missing")).toBe("Unknown folder");
  });

  it("compresses long folder paths from the middle", () => {
    expect(compactFolderPath("Pot 3 > Equities > HK > HK Offense")).toBe(
      "Pot 3 > ... > HK Offense",
    );
    expect(compactFolderPath("Pot 3 > Alternatives > Gold")).toBe("Pot 3 > Alternatives > Gold");
  });

  it("groups holdings by account and marks unassigned holdings and accounts", () => {
    const groups = buildHoldingAssignmentGroups(
      [
        holding("position:account-a:asset-2800", "account-a", "Account A", "2800"),
        holding("position:account-a:asset-2840", "account-a", "Account A", "2840"),
        holding("position:account-b:asset-1211", "account-b", "Account B", "1211"),
      ],
      {
        ...emptyPlan,
        accountDefaults: [{ accountId: "account-b", folderNodeId: "pot-3" }],
        attributions: [
          {
            subjectKey: "position:account-a:asset-2800",
            subjectType: "position",
            folderNodeId: "gold",
          },
        ],
      },
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      accountId: "account-a",
      accountName: "Account A",
      hasUnassigned: true,
      unassignedCount: 1,
    });
    expect(groups[0].holdings.map((item) => item.assignment.source)).toEqual([
      "explicit",
      "unassigned",
    ]);
    expect(groups[0].holdings[0].assignment.folderPath).toBe("Pot 3 > Alternatives > Gold");
    expect(groups[1]).toMatchObject({
      accountId: "account-b",
      accountName: "Account B",
      hasUnassigned: false,
      unassignedCount: 0,
    });
    expect(groups[1].holdings[0].assignment).toMatchObject({
      source: "accountDefault",
      folderPath: "Pot 3",
    });
  });

  it("treats explicit untargeting as an inbox item that overrides account default", () => {
    const groups = buildHoldingAssignmentGroups(
      [holding("position:account-a:asset-2840", "account-a", "Account A", "2840")],
      {
        ...emptyPlan,
        accountDefaults: [{ accountId: "account-a", folderNodeId: "pot-3" }],
        exclusions: [{ subjectKey: "position:account-a:asset-2840", subjectType: "position" }],
      },
    );

    expect(groups[0]).toMatchObject({
      hasUnassigned: true,
      unassignedCount: 1,
    });
    expect(groups[0].holdings[0].assignment).toMatchObject({
      source: "explicitUntargeted",
      folderNodeId: null,
      folderPath: "Untargeted",
      isUnassigned: true,
    });
  });

  it("builds an expandable account-to-holdings assignment tree", () => {
    const tree = buildHoldingAssignmentTree(
      [
        holding("position:account-a:asset-2800", "account-a", "Account A", "2800"),
        holding("position:account-a:asset-2840", "account-a", "Account A", "2840"),
        holding("standalone:gold-policy", null, null, "Gold Policy"),
      ],
      {
        ...emptyPlan,
        accountDefaults: [{ accountId: "account-a", folderNodeId: "pot-3" }],
        attributions: [
          {
            subjectKey: "position:account-a:asset-2840",
            subjectType: "position",
            folderNodeId: "gold",
          },
        ],
      },
    );

    expect(tree.map((row) => row.rowKey)).toEqual(["account:account-a", "account:standalone"]);
    expect(tree[0]).toMatchObject({
      rowKind: "account",
      accountId: "account-a",
      label: "Account A",
      assignment: {
        source: "accountDefault",
        folderPath: "Pot 3",
      },
      hasUnassigned: false,
    });
    expect(tree[0].holdings.map((row) => row.rowKey)).toEqual([
      "holding:position:account-a:asset-2800",
      "holding:position:account-a:asset-2840",
    ]);
    expect(tree[0].holdings[1].assignment.folderPath).toBe("Pot 3 > Alternatives > Gold");
    expect(tree[1]).toMatchObject({
      rowKind: "account",
      accountId: null,
      label: "Standalone",
      assignment: {
        source: "unassigned",
      },
      hasUnassigned: true,
    });
  });

  it("converts automatic style choices into inherited folder style", () => {
    const draft = nodeEditDraftFromNode({
      ...folder("folder-a", "Original"),
      color: null,
      icon: null,
    });

    expect(draft).toEqual({
      name: "Original",
      color: "automatic",
      icon: "automatic",
    });

    expect(
      applyNodeEditDraft(folder("folder-a", "Original"), {
        name: "Renamed",
        color: "automatic",
        icon: "automatic",
      }),
    ).toMatchObject({
      name: "Renamed",
      color: null,
      icon: null,
    });
  });

  it("ignores color and icon edits for asset leaves", () => {
    const assetNode: TargetAllocationNode = {
      id: "asset-a",
      parentId: "pot-3",
      nodeKind: "asset",
      name: "Original asset",
      targetPercent: null,
      assetRef: { kind: "asset", assetId: "asset-a" },
      color: null,
      icon: null,
      sortOrder: 0,
    };

    expect(
      applyNodeEditDraft(assetNode, {
        name: "Renamed asset",
        color: "#3b82f6",
        icon: "target",
      }),
    ).toMatchObject({
      name: "Renamed asset",
      color: null,
      icon: null,
    });
  });

  it("moves a node under a selected folder at the end of that folder", () => {
    const moved = moveNodeUnder(nodes, "gold", "equities");

    expect(moved.find((node) => node.id === "gold")).toMatchObject({
      parentId: "equities",
      sortOrder: 1,
    });
    expect(moved.find((node) => node.id === "alternatives")).toMatchObject({
      parentId: "pot-3",
    });
  });

  it("blocks invalid move destinations", () => {
    expect(canMoveNodeUnder(nodes, "equities", "hk")).toBe(false);
    expect(canMoveNodeUnder(nodes, "equities", "equities")).toBe(false);
    expect(canMoveNodeUnder(nodes, "gold", "gold")).toBe(false);

    const assetNode: TargetAllocationNode = {
      id: "asset-a",
      parentId: "gold",
      nodeKind: "asset",
      name: "Asset A",
      targetPercent: null,
      assetRef: { kind: "asset", assetId: "asset-a" },
      color: null,
      icon: null,
      sortOrder: 0,
    };

    expect(canMoveNodeUnder([...nodes, assetNode], "gold", "asset-a")).toBe(false);
    expect(canMoveNodeUnder(nodes, "gold", null)).toBe(true);
    expect(moveNodeUnder(nodes, "equities", "hk")).toEqual(nodes);
  });

  it("explicitly untargets holdings by removing overrides and suppressing account defaults", () => {
    const targetHolding = holding(
      "position:account-a:asset-2840",
      "account-a",
      "Account A",
      "2840",
    );
    const plan = {
      ...emptyPlan,
      accountDefaults: [{ accountId: "account-a", folderNodeId: "pot-3" }],
      attributions: [
        {
          subjectKey: targetHolding.subjectKey,
          subjectType: targetHolding.subjectType,
          folderNodeId: "gold",
        },
      ],
    };

    const updated = explicitUntargetHoldings(plan, [targetHolding]);

    expect(updated.attributions).toEqual([]);
    expect(updated.exclusions).toEqual([
      { subjectKey: targetHolding.subjectKey, subjectType: targetHolding.subjectType },
    ]);
    expect(holdingAssignmentState(targetHolding, updated)).toMatchObject({
      source: "explicitUntargeted",
      folderNodeId: null,
    });
  });

  it("can clear a holding override back to its account default", () => {
    const targetHolding = holding(
      "position:account-a:asset-2840",
      "account-a",
      "Account A",
      "2840",
    );
    const plan = {
      ...emptyPlan,
      accountDefaults: [{ accountId: "account-a", folderNodeId: "pot-3" }],
      attributions: [
        {
          subjectKey: targetHolding.subjectKey,
          subjectType: targetHolding.subjectType,
          folderNodeId: "gold",
        },
      ],
      exclusions: [
        { subjectKey: targetHolding.subjectKey, subjectType: targetHolding.subjectType },
      ],
    };

    const updated = removeHoldingOverrides(plan, [targetHolding]);

    expect(updated.attributions).toEqual([]);
    expect(updated.exclusions).toEqual([]);
    expect(holdingAssignmentState(targetHolding, updated)).toMatchObject({
      source: "accountDefault",
      folderNodeId: "pot-3",
    });
    expect(holdingAccountDefaultPath(targetHolding, updated)).toBe("Pot 3");
  });

  it("matches asset leaf holdings from the leaf parent assignment", () => {
    const goldNode = assetNode("gold-leaf", "2840", "gold", "asset-2840");
    const matching = holding("position:account-a:asset-2840", "account-a", "Account A", "2840");
    const elsewhere = holding("position:account-a:asset-2800", "account-a", "Account A", "2800");
    const plan = {
      ...emptyPlan,
      nodes: [...nodes, goldNode],
      attributions: [
        {
          subjectKey: matching.subjectKey,
          subjectType: matching.subjectType,
          folderNodeId: "gold",
        },
        {
          subjectKey: elsewhere.subjectKey,
          subjectType: elsewhere.subjectType,
          folderNodeId: "gold",
        },
      ],
    };

    expect(assetNodeMatchingHoldings(goldNode, [matching, elsewhere], plan)).toEqual([matching]);
  });

  it("untargets an asset leaf explicitly when it is removed from the tree", () => {
    const goldNode = assetNode("gold-leaf", "2840", "gold", "asset-2840");
    const matching = holding("position:account-a:asset-2840", "account-a", "Account A", "2840");
    const plan = {
      ...emptyPlan,
      nodes: [...nodes, goldNode],
      accountDefaults: [{ accountId: "account-a", folderNodeId: "pot-3" }],
      attributions: [
        {
          subjectKey: matching.subjectKey,
          subjectType: matching.subjectType,
          folderNodeId: "gold",
        },
      ],
    };

    const updated = untargetAssetNode(plan, goldNode.id, [matching], "explicitUntargeted");

    expect(updated.nodes.some((node) => node.id === goldNode.id)).toBe(false);
    expect(updated.attributions).toEqual([]);
    expect(updated.exclusions).toEqual([
      { subjectKey: matching.subjectKey, subjectType: matching.subjectType },
    ]);
  });

  it("removes an asset leaf while letting eligible holdings use account defaults", () => {
    const goldNode = assetNode("gold-leaf", "2840", "gold", "asset-2840");
    const matching = holding("position:account-a:asset-2840", "account-a", "Account A", "2840");
    const noDefault = holding("position:account-b:asset-2840", "account-b", "Account B", "2840");
    const plan = {
      ...emptyPlan,
      nodes: [...nodes, goldNode],
      accountDefaults: [{ accountId: "account-a", folderNodeId: "pot-3" }],
      attributions: [
        {
          subjectKey: matching.subjectKey,
          subjectType: matching.subjectType,
          folderNodeId: "gold",
        },
        {
          subjectKey: noDefault.subjectKey,
          subjectType: noDefault.subjectType,
          folderNodeId: "gold",
        },
      ],
    };

    const updated = untargetAssetNode(plan, goldNode.id, [matching, noDefault], "accountDefault");

    expect(updated.nodes.some((node) => node.id === goldNode.id)).toBe(false);
    expect(updated.attributions).toEqual([]);
    expect(updated.exclusions).toEqual([
      { subjectKey: noDefault.subjectKey, subjectType: noDefault.subjectType },
    ]);
    expect(holdingAssignmentState(matching, updated).source).toBe("accountDefault");
  });

  it("deletes an empty folder directly", () => {
    const updated = deleteNodeDirectly(emptyPlan, "hk-offense");

    expect(updated.nodes.some((node) => node.id === "hk-offense")).toBe(false);
  });

  it("moves a deleted folder's contents to its parent and rebases child target weights", () => {
    const plan = {
      ...emptyPlan,
      nodes: nodes.map((node) => {
        if (node.id === "alternatives") return { ...node, targetPercent: 30 };
        if (node.id === "gold") return { ...node, targetPercent: 50 };
        return node;
      }),
    };

    const updated = deleteFolderAndMoveContentsToParent(plan, "alternatives", []);

    expect(updated.nodes.some((node) => node.id === "alternatives")).toBe(false);
    expect(updated.nodes.find((node) => node.id === "gold")).toMatchObject({
      parentId: "pot-3",
      targetPercent: 15,
    });
  });

  it("untargets all holdings under a deleted folder subtree", () => {
    const matching = holding("position:account-a:asset-2840", "account-a", "Account A", "2840");
    const plan = {
      ...emptyPlan,
      accountDefaults: [{ accountId: "account-a", folderNodeId: "gold" }],
    };

    const updated = deleteFolderAndUntargetContents(plan, "alternatives", [matching]);

    expect(updated.nodes.some((node) => node.id === "alternatives")).toBe(false);
    expect(updated.nodes.some((node) => node.id === "gold")).toBe(false);
    expect(updated.accountDefaults).toEqual([]);
    expect(updated.exclusions).toEqual([
      { subjectKey: matching.subjectKey, subjectType: matching.subjectType },
    ]);
  });
});
