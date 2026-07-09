import { Button } from "@panorama/ui/components/ui/button";
import { Icons, AmountDisplay, EmptyPlaceholder } from "@panorama/ui";
import { Input } from "@panorama/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@panorama/ui/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@panorama/ui/components/ui/popover";
import { Skeleton } from "@panorama/ui/components/ui/skeleton";
import { toast } from "@panorama/ui/components/ui/use-toast";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useSaveTargetAllocation, useTargetAllocation } from "@/hooks/use-target-allocation";
import type {
  TargetAllocationAssetRef,
  TargetAllocationDisplayRow,
  TargetAllocationHoldingInput,
  TargetAllocationNode,
  TargetAllocationPlanData,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AUTOMATIC_STYLE_VALUE,
  applyNodeEditDraft,
  assetNodeMatchingHoldings,
  buildHoldingAssignmentGroups,
  canMoveNodeUnder,
  compactFolderPath,
  deleteFolderAndMoveContentsToParent,
  deleteFolderAndUntargetContents,
  deleteNodeDirectly,
  explicitUntargetHoldings,
  folderHasContents,
  holdingAccountDefaultPath,
  holdingAssignmentState,
  moveNodeUnder,
  nodeEditDraftFromNode,
  untargetAssetNode,
  type NodeEditDraft,
} from "./target-allocation-editor-utils";

const NODE_COLORS = [
  "#3b82f6",
  "#0f766e",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#64748b",
];

const NODE_ICONS = ["folder", "target", "wallet", "sparkles", "circleGauge", "pieChart"];
const TREE_LINE_WIDTH_PX = 28;
const BAR_INDENT_PX = 36;
const MAX_BAR_INDENT_PX = 144;
const HOVER_DETAILS_OPEN_DELAY_MS = 2000;
const EXCLUDED_ASSETS_NAME = "Excluded Assets";
const EMPTY_NODE_EDIT_DRAFT: NodeEditDraft = {
  name: "",
  color: AUTOMATIC_STYLE_VALUE,
  icon: AUTOMATIC_STYLE_VALUE,
};
const NODE_ICON_LABELS: Record<string, string> = {
  folder: "Folder",
  target: "Target",
  wallet: "Wallet",
  sparkles: "Sparkles",
  circleGauge: "Gauge",
  pieChart: "Pie",
};

type TargetMetricMode = "percentage" | "amount" | "both";
type AssetUntargetMode = "accountDefault" | "explicitUntargeted";

function makeId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return `${value.toFixed(1)}%`;
}

function isSameAssetRef(a?: TargetAllocationAssetRef | null, b?: TargetAllocationAssetRef | null) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "asset" && b.kind === "asset") return a.assetId === b.assetId;
  if (a.kind === "cash" && b.kind === "cash") return a.currency === b.currency;
  return false;
}

function folderOptions(nodes: TargetAllocationNode[]) {
  return nodes.filter((node) => node.nodeKind === "folder");
}

function assetRefFromHolding(holding: TargetAllocationHoldingInput): TargetAllocationAssetRef {
  if (holding.subjectType === "cash") {
    return { kind: "cash", currency: holding.currency };
  }
  return { kind: "asset", assetId: holding.assetId ?? holding.subjectKey };
}

function displayHoldingName(holding: TargetAllocationHoldingInput) {
  return holding.name || holding.symbol || holding.subjectKey;
}

function buildExcludedAssetsNode(sortOrder: number): TargetAllocationNode {
  return {
    id: makeId("folder"),
    parentId: null,
    nodeKind: "folder",
    name: EXCLUDED_ASSETS_NAME,
    targetPercent: 0,
    assetRef: null,
    color: NODE_COLORS[7],
    icon: "ellipsis",
    sortOrder,
  };
}

function buildPotTemplate(): TargetAllocationPlanData {
  const potNodes = [1, 2, 3, 4].map((number, index) => ({
    id: makeId("folder"),
    parentId: null,
    nodeKind: "folder" as const,
    name: `Pot ${number}`,
    targetPercent: null,
    assetRef: null,
    color: NODE_COLORS[index],
    icon: "folder",
    sortOrder: index,
  }));

  return {
    hasPlan: true,
    nodes: [...potNodes, buildExcludedAssetsNode(potNodes.length)],
    accountDefaults: [],
    attributions: [],
    exclusions: [],
  };
}

function buildBlankPlan(): TargetAllocationPlanData {
  return {
    hasPlan: true,
    nodes: [buildExcludedAssetsNode(0)],
    accountDefaults: [],
    attributions: [],
    exclusions: [],
  };
}

function flattenRows(row: TargetAllocationDisplayRow): TargetAllocationDisplayRow[] {
  return [row, ...row.children.flatMap(flattenRows)];
}

function rowsById(root?: TargetAllocationDisplayRow) {
  if (!root) return new Map<string, TargetAllocationDisplayRow>();
  return new Map(flattenRows(root).map((row) => [row.id, row]));
}

function compareRowsByPlannedWeight(a: TargetAllocationDisplayRow, b: TargetAllocationDisplayRow) {
  const aTarget = a.targetPercent;
  const bTarget = b.targetPercent;

  if (aTarget !== null && aTarget !== undefined && bTarget !== null && bTarget !== undefined) {
    return bTarget - aTarget;
  }
  if (aTarget !== null && aTarget !== undefined) return -1;
  if (bTarget !== null && bTarget !== undefined) return 1;
  return 0;
}

function displayChildrenByPlannedWeight(children: TargetAllocationDisplayRow[]) {
  return [...children].sort(compareRowsByPlannedWeight);
}

function displayTopLevelChildren(children: TargetAllocationDisplayRow[]) {
  return [...children].sort((a, b) => a.name.localeCompare(b.name));
}

function buildNodeTree(
  nodes: TargetAllocationNode[],
  parentId: string | null = null,
): TargetAllocationNode[] {
  return nodes
    .filter((node) => (node.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function isDescendant(nodes: TargetAllocationNode[], nodeId: string, possibleParentId: string) {
  let cursor = nodes.find((node) => node.id === nodeId)?.parentId ?? null;
  while (cursor) {
    if (cursor === possibleParentId) return true;
    cursor = nodes.find((node) => node.id === cursor)?.parentId ?? null;
  }
  return false;
}

function iconForName(name?: string | null) {
  switch (name) {
    case "target":
      return Icons.Target;
    case "wallet":
      return Icons.Wallet;
    case "sparkles":
      return Icons.SparklesOutline;
    case "circleGauge":
      return Icons.CircleGauge;
    case "pieChart":
      return Icons.PieChart;
    case "ellipsis":
      return Icons.Ellipsis;
    default:
      return Icons.Folder;
  }
}

function IconBadge({
  icon,
  color,
  className,
}: {
  icon?: string | null;
  color?: string | null;
  className?: string;
}) {
  const Icon = iconForName(icon);
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-white",
        className,
      )}
      style={{ backgroundColor: color ?? NODE_COLORS[0] }}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function effectiveFolderStyle(nodes: TargetAllocationNode[], nodeId?: string | null) {
  let color: string | null | undefined;
  let icon: string | null | undefined;
  let current = nodeId ? nodes.find((node) => node.id === nodeId) : undefined;
  const seen = new Set<string>();

  while (current && current.nodeKind === "folder" && !seen.has(current.id)) {
    seen.add(current.id);
    color ??= current.color;
    icon ??= current.icon;
    if (color && icon) break;
    current = current.parentId ? nodes.find((node) => node.id === current?.parentId) : undefined;
  }

  return {
    color: color ?? NODE_COLORS[0],
    icon: icon ?? "folder",
  };
}

function FolderStyleChoices({
  draft,
  setDraft,
}: {
  draft: NodeEditDraft;
  setDraft: (draft: NodeEditDraft) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="text-muted-foreground text-xs font-medium">Color</div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={draft.color === AUTOMATIC_STYLE_VALUE ? "secondary" : "outline"}
            size="sm"
            onClick={() => setDraft({ ...draft, color: AUTOMATIC_STYLE_VALUE })}
          >
            Automatic
          </Button>
          {NODE_COLORS.map((color) => (
            <Button
              key={color}
              type="button"
              variant="outline"
              size="icon-sm"
              title={color}
              aria-label={`Use color ${color}`}
              onClick={() => setDraft({ ...draft, color })}
              className={cn(draft.color === color && "ring-ring ring-2")}
            >
              <span
                className="size-4 rounded-full border border-black/10"
                style={{ backgroundColor: color }}
              />
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="text-muted-foreground text-xs font-medium">Symbol</div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={draft.icon === AUTOMATIC_STYLE_VALUE ? "secondary" : "outline"}
            size="sm"
            onClick={() => setDraft({ ...draft, icon: AUTOMATIC_STYLE_VALUE })}
          >
            Automatic
          </Button>
          {NODE_ICONS.map((icon) => {
            const Icon = iconForName(icon);
            return (
              <Button
                key={icon}
                type="button"
                variant="outline"
                size="sm"
                title={NODE_ICON_LABELS[icon] ?? icon}
                aria-label={`Use ${NODE_ICON_LABELS[icon] ?? icon} symbol`}
                onClick={() => setDraft({ ...draft, icon })}
                className={cn("gap-1.5", draft.icon === icon && "ring-ring ring-2")}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{NODE_ICON_LABELS[icon] ?? icon}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function statusClass(symbol?: string | null) {
  if (!symbol) return "text-muted-foreground";
  if (symbol.startsWith("-")) return "text-rose-600 dark:text-rose-400";
  if (symbol.startsWith("+")) return "text-emerald-600 dark:text-emerald-400";
  return "text-sky-600 dark:text-sky-400";
}

function treeBarIndent(depth: number) {
  return Math.min(depth * BAR_INDENT_PX, MAX_BAR_INDENT_PX);
}

function nextMetricMode(mode: TargetMetricMode): TargetMetricMode {
  if (mode === "percentage") return "amount";
  if (mode === "amount") return "both";
  return "percentage";
}

function metricModeLabel(mode: TargetMetricMode) {
  if (mode === "percentage") return "Percent";
  if (mode === "amount") return "Amount";
  return "Both";
}

function metricModeIcon(mode: TargetMetricMode) {
  if (mode === "percentage") return Icons.Percent;
  if (mode === "amount") return Icons.BadgeDollarSign;
  return Icons.ArrowLeftRight;
}

function UnassignedMark({ title = "Unassigned" }: { title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
    >
      !
    </span>
  );
}

function TreeConnector({
  isRoot,
  ancestorContinuations,
  isLast,
}: {
  isRoot: boolean;
  ancestorContinuations: boolean[];
  isLast: boolean;
}) {
  if (isRoot) return null;

  const currentDepth = ancestorContinuations.length;
  const width = (currentDepth + 1) * TREE_LINE_WIDTH_PX;
  const currentLeft = currentDepth * TREE_LINE_WIDTH_PX + TREE_LINE_WIDTH_PX / 2;

  return (
    <div className="relative -my-2 h-[58px] shrink-0" style={{ width }}>
      {ancestorContinuations.map((shouldContinue, index) =>
        shouldContinue ? (
          <span
            key={index}
            className="bg-muted-foreground/25 absolute inset-y-0 w-[2px]"
            style={{ left: index * TREE_LINE_WIDTH_PX + TREE_LINE_WIDTH_PX / 2 }}
          />
        ) : null,
      )}
      <span
        className="bg-muted-foreground/25 absolute top-0 w-[2px]"
        style={{
          left: currentLeft,
          height: isLast ? "50%" : "100%",
        }}
      />
      <span
        className="bg-muted-foreground/25 absolute h-[2px]"
        style={{
          left: currentLeft,
          right: 0,
          top: "50%",
        }}
      />
    </div>
  );
}

function TargetMetricLabel({
  percent,
  value,
  currency,
  mode,
  isBalanceHidden,
  isAuto,
}: {
  percent?: number | null;
  value?: number | null;
  currency: string;
  mode: TargetMetricMode;
  isBalanceHidden: boolean;
  isAuto?: boolean;
}) {
  const showPercent = mode === "percentage" || mode === "both";
  const showAmount = mode === "amount" || mode === "both";

  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums">
      {showPercent && percent !== null && percent !== undefined && (
        <span className="text-muted-foreground">
          {isAuto ? `auto ${formatPercent(percent)}` : formatPercent(percent)}
        </span>
      )}
      {showPercent && showAmount && value !== null && value !== undefined && (
        <span className="text-muted-foreground/70">·</span>
      )}
      {showAmount && value !== null && value !== undefined && (
        <AmountDisplay
          value={value}
          currency={currency}
          isHidden={isBalanceHidden}
          className="text-muted-foreground"
        />
      )}
    </span>
  );
}

function validatePlan(plan: TargetAllocationPlanData): string | null {
  const byParent = new Map<string, TargetAllocationNode[]>();
  for (const node of plan.nodes) {
    const key = node.parentId ?? "root";
    byParent.set(key, [...(byParent.get(key) ?? []), node]);
  }

  for (const [parentId, siblings] of byParent) {
    const targetSum = siblings.reduce((sum, node) => sum + (Number(node.targetPercent) || 0), 0);
    if (targetSum > 100.0001) {
      return `Targets under ${parentId === "root" ? "Total Assets" : "this folder"} exceed 100%.`;
    }

    const folderNames = new Set<string>();
    const assetRefs: TargetAllocationAssetRef[] = [];
    for (const node of siblings) {
      if (node.nodeKind === "folder") {
        const key = node.name.trim().toLowerCase();
        if (folderNames.has(key)) return "Sibling folder names must be unique.";
        folderNames.add(key);
      }
      if (node.nodeKind === "asset" && node.assetRef) {
        if (assetRefs.some((assetRef) => isSameAssetRef(assetRef, node.assetRef))) {
          return "The same asset can only appear once under a folder.";
        }
        assetRefs.push(node.assetRef);
      }
    }
  }

  for (const node of plan.nodes) {
    if (!node.parentId || node.targetPercent === null || node.targetPercent === undefined) continue;
    const parent = plan.nodes.find((candidate) => candidate.id === node.parentId);
    if (parent && (parent.targetPercent === null || parent.targetPercent === undefined)) {
      return "A targeted child needs its parent folder to have a target.";
    }
  }

  return null;
}

function normalizeDraft(plan: TargetAllocationPlanData): TargetAllocationPlanData {
  const nodes = plan.nodes.map((node) => ({ ...node }));
  const byParent = new Map<string, TargetAllocationNode[]>();
  for (const node of nodes) {
    const key = node.parentId ?? "root";
    byParent.set(key, [...(byParent.get(key) ?? []), node]);
  }
  for (const siblings of byParent.values()) {
    const targetSum = siblings.reduce((sum, node) => sum + (Number(node.targetPercent) || 0), 0);
    if (targetSum <= 100 || targetSum <= 0) continue;
    for (const node of siblings) {
      if (node.targetPercent !== null && node.targetPercent !== undefined) {
        node.targetPercent = Number(((node.targetPercent / targetSum) * 100).toFixed(1));
      }
    }
  }
  return { ...plan, nodes };
}

interface TargetRowProps {
  row: TargetAllocationDisplayRow;
  depth: number;
  ancestorContinuations: boolean[];
  isLast: boolean;
  metricMode: TargetMetricMode;
  inheritedColor?: string;
  currency: string;
  expandedIds: string[];
  setExpandedIds: (ids: string[]) => void;
  query: string;
  isBalanceHidden: boolean;
}

function TargetRow({
  row,
  depth,
  ancestorContinuations,
  isLast,
  metricMode,
  inheritedColor,
  currency,
  expandedIds,
  setExpandedIds,
  query,
  isBalanceHidden,
}: TargetRowProps) {
  const navigate = useNavigate();
  const rowColor =
    row.kind === "root"
      ? "#52525b"
      : row.kind === "other" || row.kind === "untargeted"
        ? "#8a8f98"
        : row.color || inheritedColor || NODE_COLORS[0];
  const isRoot = row.kind === "root";
  const isFolderRow = row.kind === "folder";
  const hasChildren = row.children.length > 0;
  const displayChildren = isRoot
    ? displayTopLevelChildren(row.children)
    : displayChildrenByPlannedWeight(row.children);
  const isExpanded = expandedIds.includes(row.id);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsAnchor, setDetailsAnchor] = useState<{ x: number; y: number } | null>(null);
  const openDetailsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDetailsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = isRoot
    ? Icons.CircleGauge
    : row.kind === "asset"
      ? Icons.File
      : iconForName(row.icon);
  const matchesQuery = query.trim()
    ? row.name.toLowerCase().includes(query.toLowerCase()) ||
      row.breakdown.some((holding) =>
        `${holding.symbol} ${holding.name ?? ""} ${holding.accountName ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : true;
  const childMatches = displayChildren.some((child) =>
    flattenRows(child).some((nested) =>
      `${nested.name} ${nested.breakdown.map((holding) => holding.symbol).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
  const assetDetailId =
    row.kind === "asset"
      ? row.assetRef?.kind === "asset"
        ? row.assetRef.assetId
        : row.breakdown.find((holding) => holding.assetId)?.assetId
      : null;
  const canNavigateToAsset = row.kind === "asset" && !!assetDetailId;
  const canToggleRow = hasChildren && row.kind !== "asset";
  const isClickableRow = canNavigateToAsset || canToggleRow;

  const clearCloseDetailsTimer = () => {
    if (!closeDetailsTimeoutRef.current) return;
    clearTimeout(closeDetailsTimeoutRef.current);
    closeDetailsTimeoutRef.current = null;
  };

  const clearOpenDetailsTimer = () => {
    if (!openDetailsTimeoutRef.current) return;
    clearTimeout(openDetailsTimeoutRef.current);
    openDetailsTimeoutRef.current = null;
  };

  const updateDetailsAnchor = (x: number, y: number) => {
    setDetailsAnchor((previousAnchor) => {
      if (
        previousAnchor &&
        Math.abs(previousAnchor.x - x) < 16 &&
        Math.abs(previousAnchor.y - y) < 16
      ) {
        return previousAnchor;
      }
      return { x, y };
    });
  };

  const openDetailsAt = (x: number, y: number) => {
    clearOpenDetailsTimer();
    clearCloseDetailsTimer();
    updateDetailsAnchor(x, y);
    setDetailsOpen(true);
  };

  const scheduleOpenDetailsAt = (x: number, y: number) => {
    clearCloseDetailsTimer();
    updateDetailsAnchor(x, y);
    if (detailsOpen || openDetailsTimeoutRef.current) return;
    openDetailsTimeoutRef.current = setTimeout(() => {
      openDetailsTimeoutRef.current = null;
      setDetailsOpen(true);
    }, HOVER_DETAILS_OPEN_DELAY_MS);
  };

  const openDetailsAtRowCenter = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    openDetailsAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const scheduleCloseDetails = () => {
    clearOpenDetailsTimer();
    clearCloseDetailsTimer();
    closeDetailsTimeoutRef.current = setTimeout(() => setDetailsOpen(false), 100);
  };

  const toggleRow = () => {
    if (!canToggleRow) return;
    setExpandedIds(
      isExpanded ? expandedIds.filter((id) => id !== row.id) : [...expandedIds, row.id],
    );
  };

  const runRowAction = () => {
    if (canNavigateToAsset && assetDetailId) {
      navigate(`/holdings/${encodeURIComponent(assetDetailId)}`);
      return;
    }
    toggleRow();
  };

  useEffect(() => {
    return () => {
      if (openDetailsTimeoutRef.current) {
        clearTimeout(openDetailsTimeoutRef.current);
      }
      if (closeDetailsTimeoutRef.current) {
        clearTimeout(closeDetailsTimeoutRef.current);
      }
    };
  }, []);

  if (!matchesQuery && !childMatches) return null;

  return (
    <div>
      <Popover open={detailsOpen} onOpenChange={setDetailsOpen}>
        {detailsAnchor && (
          <PopoverAnchor asChild>
            <span
              aria-hidden="true"
              className="pointer-events-none fixed h-px w-px"
              style={{ left: detailsAnchor.x, top: detailsAnchor.y }}
            />
          </PopoverAnchor>
        )}
        <div
          role={isClickableRow ? "button" : undefined}
          tabIndex={isClickableRow ? 0 : undefined}
          onPointerEnter={(event) => scheduleOpenDetailsAt(event.clientX, event.clientY)}
          onPointerMove={(event) => scheduleOpenDetailsAt(event.clientX, event.clientY)}
          onPointerLeave={scheduleCloseDetails}
          onFocus={(event) => openDetailsAtRowCenter(event.currentTarget)}
          onBlur={scheduleCloseDetails}
          onClick={runRowAction}
          onKeyDown={(event) => {
            if (!isClickableRow || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            runRowAction();
          }}
          className={cn(
            "hover:bg-muted/45 group grid min-h-[58px] grid-cols-[minmax(220px,1fr)_minmax(240px,2fr)] items-center gap-3 px-3 py-2 transition-colors max-md:grid-cols-1",
            isClickableRow ? "cursor-pointer" : "cursor-default",
            !isFolderRow && "border-b last:border-b-0",
            isRoot && "bg-muted/20",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <TreeConnector
              isRoot={isRoot}
              ancestorContinuations={ancestorContinuations}
              isLast={isLast}
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className={cn("size-6 shrink-0", !hasChildren && "invisible")}
              onClick={(event) => {
                event.stopPropagation();
                toggleRow();
              }}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label={isExpanded ? "Collapse row" : "Expand row"}
            >
              {isExpanded ? (
                <Icons.ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <Icons.ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: rowColor }}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium">{row.name}</span>
                {!isRoot && row.statusSymbol && (
                  <span
                    className={cn("shrink-0 text-xs font-semibold", statusClass(row.statusSymbol))}
                  >
                    {row.statusSymbol}
                  </span>
                )}
              </span>
              {isRoot && (
                <AmountDisplay
                  value={row.currentValue}
                  currency={currency}
                  isHidden={isBalanceHidden}
                  className="text-muted-foreground block truncate text-xs"
                />
              )}
            </span>
          </div>

          {!isRoot ? (
            <div
              className="min-w-0 rounded-md text-left"
              style={{ paddingLeft: treeBarIndent(depth) }}
            >
              <div className="space-y-1.5">
                {row.targetPercent !== null && row.targetPercent !== undefined && (
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="bg-muted-foreground/40 h-1.5 min-w-0 shrink rounded-full"
                      style={{ width: `${Math.min(Math.max(row.targetPercent, 0), 100)}%` }}
                    />
                    <TargetMetricLabel
                      percent={row.targetPercent}
                      value={row.targetValue}
                      currency={currency}
                      mode={metricMode}
                      isBalanceHidden={isBalanceHidden}
                      isAuto={row.isAutoTarget}
                    />
                  </div>
                )}
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className="h-3 min-w-0 shrink rounded-full"
                    style={{
                      width: `${Math.min(Math.max(row.currentPercent, 0), 100)}%`,
                      backgroundColor: rowColor,
                    }}
                  />
                  <TargetMetricLabel
                    percent={row.currentPercent}
                    value={row.currentValue}
                    currency={currency}
                    mode={metricMode}
                    isBalanceHidden={isBalanceHidden}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div />
          )}
        </div>
        <PopoverContent
          align="start"
          className="w-80"
          onPointerEnter={() => {
            clearOpenDetailsTimer();
            clearCloseDetailsTimer();
            setDetailsOpen(true);
          }}
          onPointerLeave={scheduleCloseDetails}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-muted-foreground text-xs">Current</div>
                <div className="font-medium">{formatPercent(row.currentPercent)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Plan</div>
                <div className="font-medium">
                  {row.targetPercent !== null && row.targetPercent !== undefined
                    ? formatPercent(row.targetPercent)
                    : "Blank"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Effective current</div>
                <div className="font-medium">{formatPercent(row.effectiveCurrentPercent)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Effective plan</div>
                <div className="font-medium">
                  {row.effectiveTargetPercent !== null && row.effectiveTargetPercent !== undefined
                    ? formatPercent(row.effectiveTargetPercent)
                    : "Blank"}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-muted-foreground text-xs">Current value</div>
                <AmountDisplay
                  value={row.currentValue}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Target value</div>
                {row.targetValue !== null && row.targetValue !== undefined ? (
                  <AmountDisplay
                    value={row.targetValue}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                ) : (
                  <span className="text-muted-foreground">Blank</span>
                )}
              </div>
            </div>
            {row.breakdown.length > 0 && (
              <div>
                <div className="text-muted-foreground mb-1 text-xs">Included holdings/accounts</div>
                <div className="max-h-32 space-y-1 overflow-auto">
                  {row.breakdown.slice(0, 8).map((holding) => (
                    <div
                      key={holding.subjectKey}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{holding.symbol}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {holding.accountName ?? "Standalone"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {hasChildren && isExpanded && (
        <div>
          {displayChildren.map((child, index) => (
            <TargetRow
              key={child.id}
              row={child}
              depth={depth + 1}
              ancestorContinuations={[...ancestorContinuations, !isLast]}
              isLast={index === displayChildren.length - 1}
              metricMode={metricMode}
              inheritedColor={rowColor}
              currency={currency}
              expandedIds={expandedIds}
              setExpandedIds={setExpandedIds}
              query={query}
              isBalanceHidden={isBalanceHidden}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  draft: TargetAllocationPlanData;
  setDraft: (draft: TargetAllocationPlanData) => void;
  viewHoldings: TargetAllocationHoldingInput[];
  dashboardRows: Map<string, TargetAllocationDisplayRow>;
}

function TargetAllocationEditor({ draft, setDraft, viewHoldings, dashboardRows }: EditorProps) {
  const folders = useMemo(() => folderOptions(draft.nodes), [draft.nodes]);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [nodeEditDraft, setNodeEditDraft] = useState<NodeEditDraft>(EMPTY_NODE_EDIT_DRAFT);
  const [movingNodeId, setMovingNodeId] = useState<string | null>(null);
  const [movingHoldingKey, setMovingHoldingKey] = useState<string | null>(null);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null | undefined>();
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [untargetingAssetId, setUntargetingAssetId] = useState<string | null>(null);
  const editingNode = editingNodeId
    ? draft.nodes.find((node) => node.id === editingNodeId)
    : undefined;
  const movingNode = movingNodeId
    ? draft.nodes.find((node) => node.id === movingNodeId)
    : undefined;
  const movingHolding = movingHoldingKey
    ? viewHoldings.find((holding) => holding.subjectKey === movingHoldingKey)
    : undefined;
  const deletingFolder = deletingFolderId
    ? draft.nodes.find((node) => node.id === deletingFolderId && node.nodeKind === "folder")
    : undefined;
  const untargetingAsset = untargetingAssetId
    ? draft.nodes.find((node) => node.id === untargetingAssetId && node.nodeKind === "asset")
    : undefined;
  const canCommitMove =
    moveDestinationId !== undefined &&
    (movingHolding
      ? Boolean(moveDestinationId)
      : Boolean(movingNode && canMoveNodeUnder(draft.nodes, movingNode.id, moveDestinationId)));
  const assignmentGroups = useMemo(
    () => buildHoldingAssignmentGroups(viewHoldings, draft),
    [draft, viewHoldings],
  );
  const untargetedGroups = useMemo(
    () =>
      assignmentGroups
        .map((group) => ({
          ...group,
          holdings: group.holdings.filter((item) => item.assignment.isUnassigned),
        }))
        .filter((group) => group.holdings.length > 0),
    [assignmentGroups],
  );
  const untargetedCount = untargetedGroups.reduce((sum, group) => sum + group.holdings.length, 0);
  const untargetingAssetHoldings = untargetingAsset
    ? assetNodeMatchingHoldings(untargetingAsset, viewHoldings, draft)
    : [];
  const untargetingAssetDefaultPath =
    untargetingAssetHoldings
      .map((holding) => holdingAccountDefaultPath(holding, draft))
      .find(Boolean) ?? null;

  useEffect(() => {
    if (!editingNodeId) return;
    const node = draft.nodes.find((candidate) => candidate.id === editingNodeId);
    if (!node) {
      setEditingNodeId(null);
      return;
    }
    setNodeEditDraft(nodeEditDraftFromNode(node));
  }, [draft.nodes, editingNodeId]);

  useEffect(() => {
    if (movingNodeId && !draft.nodes.some((node) => node.id === movingNodeId)) {
      setMovingNodeId(null);
      setMoveDestinationId(undefined);
    }
  }, [draft.nodes, movingNodeId]);

  useEffect(() => {
    if (
      movingHoldingKey &&
      !viewHoldings.some((holding) => holding.subjectKey === movingHoldingKey)
    ) {
      setMovingHoldingKey(null);
      setMoveDestinationId(undefined);
    }
  }, [movingHoldingKey, viewHoldings]);

  const updateNode = (nodeId: string, patch: Partial<TargetAllocationNode>) => {
    const descendantIds =
      patch.targetPercent === null
        ? draft.nodes
            .filter((candidate) => isDescendant(draft.nodes, candidate.id, nodeId))
            .map((candidate) => candidate.id)
        : [];
    setDraft({
      ...draft,
      nodes: draft.nodes.map((node) => {
        if (descendantIds.includes(node.id)) {
          return { ...node, targetPercent: null };
        }
        if (node.id !== nodeId) return node;
        return { ...node, ...patch };
      }),
    });
  };

  const addFolder = (parentId: string | null) => {
    const siblingCount = draft.nodes.filter((node) => (node.parentId ?? null) === parentId).length;
    const color = parentId
      ? draft.nodes.find((node) => node.id === parentId)?.color
      : NODE_COLORS[siblingCount % NODE_COLORS.length];
    const newNode: TargetAllocationNode = {
      id: makeId("folder"),
      parentId,
      nodeKind: "folder",
      name: "New folder",
      targetPercent: null,
      assetRef: null,
      color: parentId ? null : color,
      icon: parentId ? null : "folder",
      sortOrder: siblingCount,
    };
    setDraft({ ...draft, nodes: [...draft.nodes, newNode] });
  };

  const openNodeEditDialog = (node: TargetAllocationNode) => {
    setNodeEditDraft(nodeEditDraftFromNode(node));
    setEditingNodeId(node.id);
  };

  const saveNodeEditDialog = () => {
    if (!editingNode) return;
    const name = nodeEditDraft.name.trim();
    if (!name) {
      toast({ title: "Name is required.", variant: "destructive" });
      return;
    }

    setDraft({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === editingNode.id ? applyNodeEditDraft(node, { ...nodeEditDraft, name }) : node,
      ),
    });
    setEditingNodeId(null);
  };

  const openMoveDialog = (node: TargetAllocationNode) => {
    setMovingNodeId(node.id);
    setMovingHoldingKey(null);
    setMoveDestinationId(undefined);
  };

  const openHoldingMoveDialog = (holding: TargetAllocationHoldingInput) => {
    setMovingHoldingKey(holding.subjectKey);
    setMovingNodeId(null);
    setMoveDestinationId(undefined);
  };

  const closeMoveDialog = () => {
    setMovingNodeId(null);
    setMovingHoldingKey(null);
    setMoveDestinationId(undefined);
  };

  const getSameAssetHoldings = (holding: TargetAllocationHoldingInput) => {
    const assetRef = assetRefFromHolding(holding);
    return viewHoldings.filter(
      (candidate) =>
        candidate.subjectKey !== holding.subjectKey &&
        isSameAssetRef(assetRefFromHolding(candidate), assetRef),
    );
  };

  const getHoldingsForAttribution = (
    holding: TargetAllocationHoldingInput,
    folderNodeId: string,
  ) => {
    if (!folderNodeId) return [holding];
    const sameAssetHoldings = getSameAssetHoldings(holding);
    if (sameAssetHoldings.length === 0) return [holding];

    const folderName =
      folders.find((folder) => folder.id === folderNodeId)?.name ?? "this target folder";
    const sample = sameAssetHoldings
      .slice(0, 3)
      .map(
        (candidate) =>
          `${displayHoldingName(candidate)} in ${candidate.accountName ?? "Standalone"}`,
      )
      .join(", ");
    const more = sameAssetHoldings.length > 3 ? ` and ${sameAssetHoldings.length - 3} more` : "";
    const confirmed =
      globalThis.confirm?.(
        `You also have ${sample}${more}. Apply the same target folder "${folderName}"?`,
      ) ?? false;

    return confirmed ? [holding, ...sameAssetHoldings] : [holding];
  };

  const collectHoldingsForAttribution = (
    holdings: TargetAllocationHoldingInput[],
    folderNodeId: string,
  ) => {
    const next = new Map<string, TargetAllocationHoldingInput>();
    for (const holding of holdings) {
      for (const candidate of getHoldingsForAttribution(holding, folderNodeId)) {
        next.set(candidate.subjectKey, candidate);
      }
    }
    return Array.from(next.values());
  };

  const withMissingAssetTargets = (
    nodes: TargetAllocationNode[],
    holdings: TargetAllocationHoldingInput[],
    folderNodeId: string,
  ) => {
    const nextNodes = [...nodes];
    const siblingCount = nextNodes.filter((node) => node.parentId === folderNodeId).length;
    let addedCount = 0;

    for (const holding of holdings) {
      const assetRef = assetRefFromHolding(holding);
      const alreadyTargeted = nextNodes.some(
        (node) =>
          node.parentId === folderNodeId &&
          node.nodeKind === "asset" &&
          isSameAssetRef(node.assetRef, assetRef),
      );
      if (alreadyTargeted) continue;

      nextNodes.push({
        id: makeId("asset"),
        parentId: folderNodeId,
        nodeKind: "asset",
        name: displayHoldingName(holding),
        targetPercent: null,
        assetRef,
        color: null,
        icon: null,
        sortOrder: siblingCount + addedCount,
      });
      addedCount += 1;
    }

    return nextNodes;
  };

  const applyAttributionsToPlan = (
    plan: TargetAllocationPlanData,
    holdings: TargetAllocationHoldingInput[],
    folderNodeId: string,
  ): TargetAllocationPlanData => {
    const subjectKeys = new Set(holdings.map((holding) => holding.subjectKey));
    return {
      ...plan,
      attributions: [
        ...plan.attributions.filter((attribution) => !subjectKeys.has(attribution.subjectKey)),
        ...holdings.map((holding) => ({
          subjectKey: holding.subjectKey,
          subjectType: holding.subjectType,
          folderNodeId,
        })),
      ],
      exclusions: plan.exclusions.filter((exclusion) => !subjectKeys.has(exclusion.subjectKey)),
    };
  };

  const targetHoldingsToFolder = (
    plan: TargetAllocationPlanData,
    holdings: TargetAllocationHoldingInput[],
    folderNodeId: string,
  ) => {
    const nodes = withMissingAssetTargets(plan.nodes, holdings, folderNodeId);
    return applyAttributionsToPlan({ ...plan, nodes }, holdings, folderNodeId);
  };

  const saveMoveDialog = () => {
    if (moveDestinationId === undefined || !canCommitMove) return;

    if (movingHolding && moveDestinationId) {
      const holdings = collectHoldingsForAttribution([movingHolding], moveDestinationId);
      setDraft(targetHoldingsToFolder(draft, holdings, moveDestinationId));
      closeMoveDialog();
      return;
    }

    if (!movingNode) return;
    const matchingHoldings =
      movingNode.nodeKind === "asset"
        ? assetNodeMatchingHoldings(movingNode, viewHoldings, draft)
        : [];
    const movedDraft = {
      ...draft,
      nodes: moveNodeUnder(draft.nodes, movingNode.id, moveDestinationId),
    };

    if (movingNode.nodeKind === "asset" && matchingHoldings.length > 0) {
      setDraft(
        moveDestinationId
          ? applyAttributionsToPlan(movedDraft, matchingHoldings, moveDestinationId)
          : explicitUntargetHoldings(movedDraft, matchingHoldings),
      );
    } else {
      setDraft(movedDraft);
    }
    closeMoveDialog();
  };

  const deleteNode = (node: TargetAllocationNode) => {
    if (node.nodeKind === "asset") {
      const matchingHoldings = assetNodeMatchingHoldings(node, viewHoldings, draft);
      if (matchingHoldings.length === 0) {
        setDraft(deleteNodeDirectly(draft, node.id));
        return;
      }

      const canUseAccountDefault = matchingHoldings.some(
        (holding) =>
          holdingAssignmentState(holding, draft).source === "explicit" &&
          holdingAccountDefaultPath(holding, draft),
      );
      if (canUseAccountDefault) {
        setUntargetingAssetId(node.id);
        return;
      }

      setDraft(untargetAssetNode(draft, node.id, viewHoldings, "explicitUntargeted"));
      return;
    }

    if (folderHasContents(draft, node.id, viewHoldings)) {
      setDeletingFolderId(node.id);
      return;
    }

    setDraft(deleteNodeDirectly(draft, node.id));
  };

  const resolveAssetUntarget = (mode: AssetUntargetMode) => {
    if (!untargetingAsset) return;
    setDraft(untargetAssetNode(draft, untargetingAsset.id, viewHoldings, mode));
    setUntargetingAssetId(null);
  };

  const useAccountDefaultForUntargetingAsset = () => {
    resolveAssetUntarget("accountDefault");
  };

  const explicitlyUntargetAsset = () => {
    resolveAssetUntarget("explicitUntargeted");
  };

  const moveDeletingFolderContentsToParent = () => {
    if (!deletingFolder) return;
    setDraft(deleteFolderAndMoveContentsToParent(draft, deletingFolder.id, viewHoldings));
    setDeletingFolderId(null);
  };

  const untargetDeletingFolderContents = () => {
    if (!deletingFolder) return;
    setDraft(deleteFolderAndUntargetContents(draft, deletingFolder.id, viewHoldings));
    setDeletingFolderId(null);
  };

  const renderMoveDestination = (node: TargetAllocationNode, depth: number) => {
    const children = buildNodeTree(draft.nodes, node.id);
    const canChooseDestination = movingHolding
      ? node.nodeKind === "folder"
      : movingNode
        ? canMoveNodeUnder(draft.nodes, movingNode.id, node.id)
        : false;
    const isSelectedDestination = moveDestinationId === node.id;
    const folderStyle =
      node.nodeKind === "folder" ? effectiveFolderStyle(draft.nodes, node.id) : null;

    return (
      <div key={node.id}>
        <button
          type="button"
          disabled={!canChooseDestination}
          onClick={() => setMoveDestinationId(node.id)}
          className={cn(
            "hover:bg-muted/60 flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            isSelectedDestination && "bg-muted",
          )}
          style={{ paddingLeft: 8 + depth * 18 }}
        >
          {node.nodeKind === "folder" ? (
            <IconBadge icon={folderStyle?.icon} color={folderStyle?.color} className="size-6" />
          ) : (
            <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
              <Icons.File className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {children.map((child) => renderMoveDestination(child, depth + 1))}
      </div>
    );
  };

  const renderNodeEditor = (node: TargetAllocationNode, depth: number) => {
    const dashboardRow = dashboardRows.get(node.id);
    const children = buildNodeTree(draft.nodes, node.id);
    const folderStyle =
      node.nodeKind === "folder" ? effectiveFolderStyle(draft.nodes, node.id) : null;
    return (
      <div key={node.id}>
        <div className="grid grid-cols-[minmax(220px,1fr)_110px] items-center gap-2 px-3 py-2 max-lg:grid-cols-1">
          <div
            className="group flex min-w-0 items-center gap-2"
            style={{ paddingLeft: depth * 20 }}
          >
            <button
              type="button"
              onClick={() => openNodeEditDialog(node)}
              className={cn(
                "hover:bg-muted/60 focus-visible:ring-ring flex min-w-0 flex-none items-center gap-2 rounded-md py-1 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2",
                node.nodeKind === "folder"
                  ? "max-w-[calc(100%-7rem)]"
                  : "max-w-[calc(100%-4.75rem)]",
              )}
            >
              {node.nodeKind === "folder" ? (
                <IconBadge icon={folderStyle?.icon} color={folderStyle?.color} className="size-6" />
              ) : (
                <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
                  <Icons.File className="h-3.5 w-3.5" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</span>
            </button>
            <div className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => openMoveDialog(node)}
                aria-label="Move"
                title="Move"
              >
                <Icons.ArrowRightLeft className="h-3.5 w-3.5" />
              </Button>
              {node.nodeKind === "folder" && (
                <>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => addFolder(node.id)}
                    aria-label="Add child folder"
                    title="Add child folder"
                  >
                    <Icons.Plus className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => deleteNode(node)}
                aria-label={node.nodeKind === "asset" ? "Untarget" : "Delete folder"}
                title={node.nodeKind === "asset" ? "Untarget" : "Delete folder"}
              >
                <Icons.Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={node.targetPercent ?? ""}
            placeholder={
              node.nodeKind === "asset" && dashboardRow
                ? String(dashboardRow.currentPercent)
                : "blank"
            }
            onChange={(event) =>
              updateNode(node.id, {
                targetPercent:
                  event.target.value === "" ? null : Number(Number(event.target.value).toFixed(1)),
              })
            }
            className="h-8"
          />
        </div>
        {children.map((child) => renderNodeEditor(child, depth + 1))}
      </div>
    );
  };

  return (
    <>
      <div
        className={cn("grid gap-4", untargetedCount > 0 && "xl:grid-cols-[minmax(0,1fr)_360px]")}
      >
        <div className="min-w-0 rounded-md border">
          <div className="text-muted-foreground grid grid-cols-[minmax(220px,1fr)_110px] gap-2 border-b px-3 py-2 text-xs font-medium max-lg:hidden">
            <span>Name</span>
            <span>Plan</span>
          </div>
          {buildNodeTree(draft.nodes).map((node) => renderNodeEditor(node, 0))}
          <div className="flex gap-2 px-3 py-3">
            <Button type="button" size="sm" variant="outline" onClick={() => addFolder(null)}>
              <Icons.Folder className="h-4 w-4" />
              Folder
            </Button>
          </div>
        </div>

        {untargetedCount > 0 && (
          <div className="min-w-0 rounded-md border">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Icons.ListChecks className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-medium">Untargeted</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800">
                  <span>!</span>
                  {untargetedCount}
                </span>
              </div>
            </div>

            <div className="max-h-[min(68vh,720px)] divide-y overflow-auto">
              {untargetedGroups.map((group) => (
                <div key={group.accountId ?? "standalone"}>
                  <div className="bg-muted/30 flex items-center gap-2 px-3 py-2">
                    <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
                      <Icons.Wallet className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{group.accountName}</span>
                        <UnassignedMark title={`${group.holdings.length} untargeted holdings`} />
                      </div>
                    </div>
                  </div>
                  <div className="border-muted-foreground/20 ml-[22px] border-l-2">
                    {group.holdings.map(({ holding, assignment }) => {
                      const holdingLabel =
                        holding.symbol && holding.name && holding.symbol !== holding.name
                          ? `${holding.symbol} - ${holding.name}`
                          : holding.name || holding.symbol || holding.subjectKey;
                      return (
                        <div
                          key={holding.subjectKey}
                          className="hover:bg-muted/60 flex items-center gap-2 px-3 py-2 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <UnassignedMark />
                              <span className="truncate text-sm font-medium">{holdingLabel}</span>
                            </div>
                            <div
                              className="text-muted-foreground truncate text-xs"
                              title={assignment.folderPath ?? undefined}
                            >
                              {compactFolderPath(assignment.folderPath)}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => openHoldingMoveDialog(holding)}
                            aria-label={`Move ${holdingLabel}`}
                            title="Move"
                          >
                            <Icons.ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(editingNode)}
        onOpenChange={(open) => {
          if (!open) setEditingNodeId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit target</DialogTitle>
            <DialogDescription className="sr-only">
              Rename this target and choose its folder style.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-muted-foreground text-xs font-medium" htmlFor="target-name">
                Name
              </label>
              <Input
                id="target-name"
                value={nodeEditDraft.name}
                onChange={(event) =>
                  setNodeEditDraft({ ...nodeEditDraft, name: event.target.value })
                }
                autoFocus
              />
            </div>

            {editingNode?.nodeKind === "folder" && (
              <FolderStyleChoices draft={nodeEditDraft} setDraft={setNodeEditDraft} />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingNodeId(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveNodeEditDialog}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(movingNode || movingHolding)}
        onOpenChange={(open) => {
          if (!open) closeMoveDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{movingHolding ? "Move holding" : "Move target"}</DialogTitle>
            <DialogDescription className="sr-only">
              Choose where this item should move in the target tree.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[min(62vh,520px)] overflow-auto rounded-md border p-2">
            {movingNode && (
              <button
                type="button"
                disabled={!canMoveNodeUnder(draft.nodes, movingNode.id, null)}
                onClick={() => setMoveDestinationId(null)}
                className={cn(
                  "hover:bg-muted/60 flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  moveDestinationId === null && "bg-muted",
                )}
              >
                <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
                  <Icons.CircleGauge className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">Top level</span>
              </button>
            )}
            {buildNodeTree(draft.nodes).map((node) => renderMoveDestination(node, 0))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeMoveDialog}>
              Cancel
            </Button>
            <Button type="button" onClick={saveMoveDialog} disabled={!canCommitMove}>
              Move under
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(untargetingAsset)}
        onOpenChange={(open) => {
          if (!open) setUntargetingAssetId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Untarget holding?</DialogTitle>
            <DialogDescription>
              This holding belongs to an account that defaults to{" "}
              {untargetingAssetDefaultPath ?? "another target route"}. Should it use that route
              instead?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setUntargetingAssetId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={explicitlyUntargetAsset}>
              Explicitly Untarget
            </Button>
            <Button type="button" onClick={useAccountDefaultForUntargetingAsset}>
              Use Account Default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletingFolder)}
        onOpenChange={(open) => {
          if (!open) setDeletingFolderId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete folder?</DialogTitle>
            <DialogDescription>
              Choose what should happen to everything inside {deletingFolder?.name ?? "this folder"}
              . This will not delete any real holdings from your portfolio.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDeletingFolderId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={untargetDeletingFolderContents}>
              Untarget contents
            </Button>
            <Button type="button" onClick={moveDeletingFolderContentsToParent}>
              Move contents to parent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function TargetAllocationPage() {
  const { data, isLoading, error } = useTargetAllocation();
  const saveMutation = useSaveTargetAllocation();
  const { isBalanceHidden } = useBalancePrivacy();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<TargetAllocationPlanData>(buildBlankPlan());
  const [query, setQuery] = useState("");
  const [metricMode, setMetricMode] = usePersistentState<TargetMetricMode>(
    "target-allocation-metric-mode",
    "both",
  );
  const [expandedIds, setExpandedIds] = usePersistentState<string[]>("target-allocation-expanded", [
    "root",
  ]);
  const MetricModeIcon = metricModeIcon(metricMode);

  useEffect(() => {
    if (data?.plan && !isEditing) setDraft(data.plan);
  }, [data?.plan, isEditing]);

  const rowMap = useMemo(() => rowsById(data?.dashboard.root), [data?.dashboard.root]);

  const saveDraft = async () => {
    const validationError = validatePlan(draft);
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }
    await saveMutation.mutateAsync({ ...draft, hasPlan: true });
    setIsEditing(false);
  };

  const startPlan = async (plan: TargetAllocationPlanData) => {
    await saveMutation.mutateAsync(plan);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="text-destructive text-sm">Failed to load target allocation.</div>;
  }

  const hasPlan = data.plan.hasPlan;

  if (!hasPlan) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <EmptyPlaceholder
          icon={<Icons.Target className="h-10 w-10" />}
          title="No target allocation"
          description=""
        >
          <div className="flex gap-2">
            <Button onClick={() => startPlan(buildPotTemplate())}>
              <Icons.Folder className="h-4 w-4" />
              Pot template
            </Button>
            <Button variant="outline" onClick={() => startPlan(buildBlankPlan())}>
              <Icons.Plus className="h-4 w-4" />
              Blank plan
            </Button>
          </div>
        </EmptyPlaceholder>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Icons.Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMetricMode(nextMetricMode(metricMode))}
            title="Toggle rail and bar labels"
          >
            <MetricModeIcon className="h-4 w-4" />
            {metricModeLabel(metricMode)}
          </Button>
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(normalizeDraft(draft));
                  toast({ title: "Targets scaled to fit 100%.", variant: "success" });
                }}
              >
                <Icons.Percent className="h-4 w-4" />
                Normalize
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={saveDraft} disabled={saveMutation.isPending}>
                <Icons.Save className="h-4 w-4" />
                Save
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => setIsEditing(true)}>
              <Icons.Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <TargetAllocationEditor
          draft={draft}
          setDraft={setDraft}
          viewHoldings={data.availableHoldings}
          dashboardRows={rowMap}
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <TargetRow
            row={data.dashboard.root}
            depth={0}
            ancestorContinuations={[]}
            isLast
            metricMode={metricMode}
            currency={data.dashboard.currency}
            expandedIds={expandedIds}
            setExpandedIds={setExpandedIds}
            query={query}
            isBalanceHidden={isBalanceHidden}
          />
        </div>
      )}
    </div>
  );
}
