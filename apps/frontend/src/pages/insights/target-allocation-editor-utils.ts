import type {
  TargetAllocationAssetRef,
  TargetAllocationHoldingInput,
  TargetAllocationNode,
  TargetAllocationPlanData,
} from "@/lib/types";

export type HoldingAssignmentSource =
  | "explicit"
  | "accountDefault"
  | "unassigned"
  | "explicitUntargeted";

export interface HoldingAssignmentState {
  source: HoldingAssignmentSource;
  folderNodeId: string | null;
  folderPath: string | null;
  isUnassigned: boolean;
}

export interface HoldingAssignmentItem {
  holding: TargetAllocationHoldingInput;
  assignment: HoldingAssignmentState;
}

export interface HoldingAssignmentTreeLeaf extends HoldingAssignmentItem {
  rowKind: "holding";
  rowKey: string;
  label: string;
}

export interface HoldingAssignmentTreeAccount {
  rowKind: "account";
  rowKey: string;
  accountId: string | null;
  label: string;
  assignment: HoldingAssignmentState;
  hasUnassigned: boolean;
  unassignedCount: number;
  holdings: HoldingAssignmentTreeLeaf[];
}

export interface HoldingAssignmentGroup {
  accountId: string | null;
  accountName: string;
  hasUnassigned: boolean;
  unassignedCount: number;
  holdings: HoldingAssignmentItem[];
}

export const AUTOMATIC_STYLE_VALUE = "automatic";

export interface NodeEditDraft {
  name: string;
  color: string;
  icon: string;
}

function folderNodeById(nodes: TargetAllocationNode[], folderNodeId: string) {
  return nodes.find((node) => node.id === folderNodeId && node.nodeKind === "folder");
}

export function folderPath(nodes: TargetAllocationNode[], folderNodeId: string | null) {
  if (!folderNodeId) return "Unassigned";

  const path: string[] = [];
  const seen = new Set<string>();
  let current = folderNodeById(nodes, folderNodeId);

  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? folderNodeById(nodes, current.parentId) : undefined;
  }

  return path.length > 0 ? path.join(" > ") : "Unknown folder";
}

export function compactFolderPath(path: string | null | undefined) {
  if (!path) return "Unassigned";

  const parts = path.split(" > ");
  if (parts.length <= 3) return path;

  return `${parts[0]} > ... > ${parts[parts.length - 1]}`;
}

function resolveFolder(
  plan: TargetAllocationPlanData,
  source: HoldingAssignmentSource,
  folderNodeId?: string | null,
): HoldingAssignmentState | null {
  if (!folderNodeId || !folderNodeById(plan.nodes, folderNodeId)) return null;

  return {
    source,
    folderNodeId,
    folderPath: folderPath(plan.nodes, folderNodeId),
    isUnassigned: false,
  };
}

function subjectKeySet(holdings: TargetAllocationHoldingInput[]) {
  return new Set(holdings.map((holding) => holding.subjectKey));
}

function sameSubject(a: TargetAllocationHoldingInput, b: TargetAllocationHoldingInput) {
  return a.subjectKey === b.subjectKey;
}

function holdingMatchesAssetRef(
  holding: TargetAllocationHoldingInput,
  assetRef?: TargetAllocationAssetRef | null,
) {
  if (!assetRef) return false;
  if (assetRef.kind === "cash") {
    return holding.subjectType === "cash" && holding.currency === assetRef.currency;
  }
  return holding.assetId === assetRef.assetId;
}

function descendantNodeIds(nodes: TargetAllocationNode[], nodeId: string) {
  return new Set([
    nodeId,
    ...nodes.filter((node) => isNodeDescendant(nodes, node.id, nodeId)).map((node) => node.id),
  ]);
}

function validAccountDefaultForHolding(
  holding: TargetAllocationHoldingInput,
  plan: TargetAllocationPlanData,
) {
  if (!holding.accountId) return null;
  const accountDefault = plan.accountDefaults.find(
    (candidate) => candidate.accountId === holding.accountId,
  );
  if (!accountDefault) return null;
  return resolveFolder(plan, "accountDefault", accountDefault.folderNodeId);
}

export function holdingAssignmentState(
  holding: TargetAllocationHoldingInput,
  plan: TargetAllocationPlanData,
): HoldingAssignmentState {
  const exclusion = plan.exclusions.find(
    (candidate) => candidate.subjectKey === holding.subjectKey,
  );
  if (exclusion) {
    return {
      source: "explicitUntargeted",
      folderNodeId: null,
      folderPath: "Untargeted",
      isUnassigned: true,
    };
  }

  const explicit = plan.attributions.find(
    (candidate) => candidate.subjectKey === holding.subjectKey,
  );
  const explicitState = resolveFolder(plan, "explicit", explicit?.folderNodeId);
  if (explicitState) return explicitState;

  const accountDefault = holding.accountId
    ? plan.accountDefaults.find((candidate) => candidate.accountId === holding.accountId)
    : undefined;
  const defaultState = resolveFolder(plan, "accountDefault", accountDefault?.folderNodeId);
  if (defaultState) return defaultState;

  return {
    source: "unassigned",
    folderNodeId: null,
    folderPath: "Unassigned",
    isUnassigned: true,
  };
}

export function holdingAccountDefaultPath(
  holding: TargetAllocationHoldingInput,
  plan: TargetAllocationPlanData,
) {
  return validAccountDefaultForHolding(holding, plan)?.folderPath ?? null;
}

export function removeHoldingOverrides(
  plan: TargetAllocationPlanData,
  holdings: TargetAllocationHoldingInput[],
): TargetAllocationPlanData {
  const subjectKeys = subjectKeySet(holdings);
  return {
    ...plan,
    attributions: plan.attributions.filter(
      (attribution) => !subjectKeys.has(attribution.subjectKey),
    ),
    exclusions: plan.exclusions.filter((exclusion) => !subjectKeys.has(exclusion.subjectKey)),
  };
}

export function explicitUntargetHoldings(
  plan: TargetAllocationPlanData,
  holdings: TargetAllocationHoldingInput[],
): TargetAllocationPlanData {
  const subjectKeys = subjectKeySet(holdings);
  const existingExclusions = plan.exclusions.filter(
    (exclusion) => !subjectKeys.has(exclusion.subjectKey),
  );
  return {
    ...plan,
    attributions: plan.attributions.filter(
      (attribution) => !subjectKeys.has(attribution.subjectKey),
    ),
    exclusions: [
      ...existingExclusions,
      ...holdings.map((holding) => ({
        subjectKey: holding.subjectKey,
        subjectType: holding.subjectType,
      })),
    ],
  };
}

export function buildHoldingAssignmentGroups(
  holdings: TargetAllocationHoldingInput[],
  plan: TargetAllocationPlanData,
): HoldingAssignmentGroup[] {
  const groupMap = new Map<string, HoldingAssignmentGroup>();

  for (const holding of holdings) {
    const accountId = holding.accountId ?? null;
    const groupKey = accountId ?? "standalone";
    const assignment = holdingAssignmentState(holding, plan);
    const group =
      groupMap.get(groupKey) ??
      ({
        accountId,
        accountName: holding.accountName ?? "Standalone",
        hasUnassigned: false,
        unassignedCount: 0,
        holdings: [],
      } satisfies HoldingAssignmentGroup);

    if (assignment.isUnassigned) {
      group.hasUnassigned = true;
      group.unassignedCount += 1;
    }
    group.holdings.push({ holding, assignment });
    groupMap.set(groupKey, group);
  }

  return Array.from(groupMap.values());
}

function accountAssignmentState(
  accountId: string | null,
  plan: TargetAllocationPlanData,
): HoldingAssignmentState {
  if (!accountId) {
    return {
      source: "unassigned",
      folderNodeId: null,
      folderPath: "Unassigned",
      isUnassigned: true,
    };
  }

  const accountDefault = plan.accountDefaults.find(
    (candidate) => candidate.accountId === accountId,
  );
  const defaultState = resolveFolder(plan, "accountDefault", accountDefault?.folderNodeId);
  if (defaultState) return defaultState;

  return {
    source: "unassigned",
    folderNodeId: null,
    folderPath: "Unassigned",
    isUnassigned: true,
  };
}

export function buildHoldingAssignmentTree(
  holdings: TargetAllocationHoldingInput[],
  plan: TargetAllocationPlanData,
): HoldingAssignmentTreeAccount[] {
  return buildHoldingAssignmentGroups(holdings, plan).map((group) => ({
    rowKind: "account",
    rowKey: `account:${group.accountId ?? "standalone"}`,
    accountId: group.accountId,
    label: group.accountName,
    assignment: accountAssignmentState(group.accountId, plan),
    hasUnassigned: group.hasUnassigned,
    unassignedCount: group.unassignedCount,
    holdings: group.holdings.map((item) => ({
      rowKind: "holding",
      rowKey: `holding:${item.holding.subjectKey}`,
      label: item.holding.name || item.holding.symbol || item.holding.subjectKey,
      holding: item.holding,
      assignment: item.assignment,
    })),
  }));
}

export function nodeEditDraftFromNode(node: TargetAllocationNode): NodeEditDraft {
  return {
    name: node.name,
    color: node.color ?? AUTOMATIC_STYLE_VALUE,
    icon: node.icon ?? AUTOMATIC_STYLE_VALUE,
  };
}

export function applyNodeEditDraft(
  node: TargetAllocationNode,
  draft: NodeEditDraft,
): TargetAllocationNode {
  if (node.nodeKind !== "folder") {
    return {
      ...node,
      name: draft.name,
      color: node.color,
      icon: node.icon,
    };
  }

  return {
    ...node,
    name: draft.name,
    color: draft.color === AUTOMATIC_STYLE_VALUE ? null : draft.color,
    icon: draft.icon === AUTOMATIC_STYLE_VALUE ? null : draft.icon,
  };
}

function isNodeDescendant(
  nodes: TargetAllocationNode[],
  nodeId: string,
  possibleAncestorId: string,
) {
  let cursor = nodes.find((node) => node.id === nodeId)?.parentId ?? null;
  const seen = new Set<string>();

  while (cursor) {
    if (cursor === possibleAncestorId) return true;
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = nodes.find((node) => node.id === cursor)?.parentId ?? null;
  }

  return false;
}

export function canMoveNodeUnder(
  nodes: TargetAllocationNode[],
  nodeId: string,
  destinationParentId: string | null,
) {
  const movingNode = nodes.find((node) => node.id === nodeId);
  if (!movingNode) return false;
  if ((movingNode.parentId ?? null) === destinationParentId) return false;
  if (!destinationParentId) return true;
  if (destinationParentId === nodeId) return false;

  const destination = nodes.find((node) => node.id === destinationParentId);
  if (!destination || destination.nodeKind !== "folder") return false;

  return !isNodeDescendant(nodes, destinationParentId, nodeId);
}

export function moveNodeUnder(
  nodes: TargetAllocationNode[],
  nodeId: string,
  destinationParentId: string | null,
) {
  if (!canMoveNodeUnder(nodes, nodeId, destinationParentId)) return nodes;

  const sortOrder = nodes.filter(
    (node) => node.id !== nodeId && (node.parentId ?? null) === destinationParentId,
  ).length;

  return nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          parentId: destinationParentId,
          sortOrder,
        }
      : node,
  );
}

export function assetNodeMatchingHoldings(
  node: TargetAllocationNode,
  holdings: TargetAllocationHoldingInput[],
  plan: TargetAllocationPlanData,
) {
  if (node.nodeKind !== "asset") return [];
  const parentId = node.parentId ?? null;
  return holdings.filter((holding) => {
    const assignment = holdingAssignmentState(holding, plan);
    return (
      assignment.folderNodeId === parentId && holdingMatchesAssetRef(holding, node.assetRef)
    );
  });
}

function removeNodeAndDescendants(
  plan: TargetAllocationPlanData,
  nodeId: string,
): [TargetAllocationPlanData, Set<string>] {
  const deletedIds = descendantNodeIds(plan.nodes, nodeId);
  return [
    {
      ...plan,
      nodes: plan.nodes.filter((node) => !deletedIds.has(node.id)),
      accountDefaults: plan.accountDefaults.filter(
        (accountDefault) => !deletedIds.has(accountDefault.folderNodeId),
      ),
      attributions: plan.attributions.filter(
        (attribution) => !deletedIds.has(attribution.folderNodeId),
      ),
    },
    deletedIds,
  ];
}

export function deleteNodeDirectly(
  plan: TargetAllocationPlanData,
  nodeId: string,
): TargetAllocationPlanData {
  return removeNodeAndDescendants(plan, nodeId)[0];
}

export function untargetAssetNode(
  plan: TargetAllocationPlanData,
  nodeId: string,
  holdings: TargetAllocationHoldingInput[],
  mode: "accountDefault" | "explicitUntargeted",
) {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  const matchingHoldings = node ? assetNodeMatchingHoldings(node, holdings, plan) : [];
  const [withoutNode] = removeNodeAndDescendants(plan, nodeId);

  if (mode === "explicitUntargeted") {
    return explicitUntargetHoldings(withoutNode, matchingHoldings);
  }

  const fallbackHoldings = matchingHoldings.filter((holding) =>
    Boolean(validAccountDefaultForHolding(holding, withoutNode)),
  );
  const explicitUntargetedHoldings = matchingHoldings.filter(
    (holding) => !fallbackHoldings.some((candidate) => sameSubject(candidate, holding)),
  );

  return explicitUntargetHoldings(
    removeHoldingOverrides(withoutNode, fallbackHoldings),
    explicitUntargetedHoldings,
  );
}

function rebaseTargetPercent(
  parentTargetPercent?: number | null,
  childTargetPercent?: number | null,
) {
  if (parentTargetPercent === null || parentTargetPercent === undefined) {
    return childTargetPercent ?? null;
  }
  if (childTargetPercent === null || childTargetPercent === undefined) return null;
  return Number(((parentTargetPercent * childTargetPercent) / 100).toFixed(1));
}

export function deleteFolderAndMoveContentsToParent(
  plan: TargetAllocationPlanData,
  folderNodeId: string,
  holdings: TargetAllocationHoldingInput[],
): TargetAllocationPlanData {
  const folder = plan.nodes.find((node) => node.id === folderNodeId && node.nodeKind === "folder");
  if (!folder) return plan;
  const parentId = folder.parentId ?? null;
  const childNodes = plan.nodes.filter((node) => (node.parentId ?? null) === folderNodeId);
  const movedChildIds = new Set(childNodes.map((node) => node.id));
  const directHoldings = holdings.filter(
    (holding) => holdingAssignmentState(holding, plan).folderNodeId === folderNodeId,
  );

  const nodes = plan.nodes
    .filter((node) => node.id !== folderNodeId)
    .map((node) => {
      if (!movedChildIds.has(node.id)) return node;
      return {
        ...node,
        parentId,
        targetPercent: rebaseTargetPercent(folder.targetPercent, node.targetPercent),
      };
    });

  const nextPlan: TargetAllocationPlanData = {
    ...plan,
    nodes,
    accountDefaults: plan.accountDefaults.flatMap((accountDefault) => {
      if (accountDefault.folderNodeId !== folderNodeId) return [accountDefault];
      return parentId ? [{ ...accountDefault, folderNodeId: parentId }] : [];
    }),
    attributions: plan.attributions.flatMap((attribution) => {
      if (attribution.folderNodeId !== folderNodeId) return [attribution];
      return parentId ? [{ ...attribution, folderNodeId: parentId }] : [];
    }),
  };

  return parentId ? nextPlan : explicitUntargetHoldings(nextPlan, directHoldings);
}

export function deleteFolderAndUntargetContents(
  plan: TargetAllocationPlanData,
  folderNodeId: string,
  holdings: TargetAllocationHoldingInput[],
): TargetAllocationPlanData {
  const deletedIds = descendantNodeIds(plan.nodes, folderNodeId);
  const affectedHoldings = holdings.filter((holding) => {
    const assignment = holdingAssignmentState(holding, plan);
    return Boolean(assignment.folderNodeId && deletedIds.has(assignment.folderNodeId));
  });
  const [withoutSubtree] = removeNodeAndDescendants(plan, folderNodeId);
  return explicitUntargetHoldings(withoutSubtree, affectedHoldings);
}

export function folderHasContents(
  plan: TargetAllocationPlanData,
  folderNodeId: string,
  holdings: TargetAllocationHoldingInput[],
) {
  const hasChildNodes = plan.nodes.some((node) => (node.parentId ?? null) === folderNodeId);
  if (hasChildNodes) return true;
  const hasAccountDefaults = plan.accountDefaults.some(
    (accountDefault) => accountDefault.folderNodeId === folderNodeId,
  );
  if (hasAccountDefaults) return true;
  return holdings.some(
    (holding) => holdingAssignmentState(holding, plan).folderNodeId === folderNodeId,
  );
}
