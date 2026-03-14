import { DataTable } from "@wealthfolio/ui/components/ui/data-table";
import { DataTableColumnHeader } from "@wealthfolio/ui/components/ui/data-table/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { EmptyPlaceholder, GainPercent, AmountDisplay, Badge } from "@wealthfolio/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import type { AlternativeAssetHolding } from "@/lib/types";
import { ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES } from "@/lib/types";
import {
  getInsuranceDisplaySnapshot,
  getInsurancePaymentReminderLabel,
  getPanoramaAssetKindDisplayLabel,
  getTimeDepositDisplaySnapshot,
  isInsuranceAsset,
  isMpfAsset,
  isTimeDepositAsset,
} from "@/lib/panorama-asset-attributes";

interface AlternativeHoldingsTableProps {
  holdings: AlternativeAssetHolding[];
  isLoading: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onEdit?: (holding: AlternativeAssetHolding) => void;
  onUpdateValue?: (holding: AlternativeAssetHolding) => void;
  onViewHistory?: (holding: AlternativeAssetHolding) => void;
  onDelete?: (holding: AlternativeAssetHolding) => void;
  onRowClick?: (holding: AlternativeAssetHolding) => void;
  isDeleting?: boolean;
}

export function AlternativeHoldingsTable({
  holdings,
  isLoading,
  emptyTitle = "No assets yet",
  emptyDescription = "Add your first asset using the button above.",
  onEdit,
  onUpdateValue,
  onViewHistory,
  onDelete,
  onRowClick,
  isDeleting = false,
}: AlternativeHoldingsTableProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const [assetToDelete, setAssetToDelete] = useState<AlternativeAssetHolding | null>(null);
  const asOfDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const handleConfirmDelete = () => {
    if (assetToDelete && onDelete) {
      onDelete(assetToDelete);
      setAssetToDelete(null);
    }
  };

  const columns: ColumnDef<AlternativeAssetHolding>[] = useMemo(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Asset" />,
        cell: ({ row }) => {
          const holding = row.original;
          const timeDepositDisplay = getTimeDepositDisplaySnapshot(holding, asOfDate);
          const insuranceDisplay = getInsuranceDisplaySnapshot(holding, asOfDate);
          const reminderLabel =
            timeDepositDisplay?.daysLeft !== undefined
              ? `${timeDepositDisplay.daysLeft}d left`
              : getInsurancePaymentReminderLabel(insuranceDisplay?.daysUntilNextPayment);
          const kindDisplay =
            getPanoramaAssetKindDisplayLabel(holding) ??
            ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES[
              holding.kind.toUpperCase() as keyof typeof ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES
            ] ??
            holding.kind;

          const handleClick = () => {
            if (onRowClick) {
              onRowClick(holding);
            }
          };

          return (
            <div
              className={`flex items-center gap-3 ${onRowClick ? "cursor-pointer" : ""}`}
              onClick={handleClick}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleClick();
                      }
                    }
                  : undefined
              }
            >
              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
                <AssetKindIcon holding={holding} size={20} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{holding.name}</span>
                  {reminderLabel ? (
                    <Badge variant="outline" className="text-[10px]">
                      {reminderLabel}
                    </Badge>
                  ) : insuranceDisplay?.paymentStatus === "paid_up" ? (
                    <Badge variant="outline" className="text-[10px]">
                      Paid-up
                    </Badge>
                  ) : null}
                </div>
                <span className="text-muted-foreground text-xs">{kindDisplay}</span>
              </div>
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "marketValue",
        accessorKey: "marketValue",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Value" className="justify-end" />
        ),
        cell: ({ row }) => {
          const holding = row.original;
          const timeDepositDisplay = getTimeDepositDisplaySnapshot(holding, asOfDate);
          const insuranceDisplay = getInsuranceDisplaySnapshot(holding, asOfDate);
          const value =
            timeDepositDisplay?.currentValue ??
            insuranceDisplay?.cashValue ??
            parseFloat(holding.marketValue);

          return (
            <div
              data-testid={`desktop-time-deposit-value-${holding.id}`}
              className="flex items-center justify-end gap-1.5 text-right"
            >
              {timeDepositDisplay?.isEstimatedValue ? (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Est.
                </Badge>
              ) : insuranceDisplay ? (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Cash Value
                </Badge>
              ) : null}
              <AmountDisplay
                value={value}
                currency={holding.currency}
                isHidden={isBalanceHidden}
                displayCurrency={true}
              />
            </div>
          );
        },
        enableSorting: true,
        sortingFn: (rowA, rowB) => {
          const valueA =
            getTimeDepositDisplaySnapshot(rowA.original, asOfDate)?.currentValue ??
            getInsuranceDisplaySnapshot(rowA.original, asOfDate)?.cashValue ??
            parseFloat(rowA.original.marketValue);
          const valueB =
            getTimeDepositDisplaySnapshot(rowB.original, asOfDate)?.currentValue ??
            getInsuranceDisplaySnapshot(rowB.original, asOfDate)?.cashValue ??
            parseFloat(rowB.original.marketValue);
          return valueA - valueB;
        },
      },
      {
        id: "gain",
        accessorKey: "unrealizedGain",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Gain" className="justify-end" />
        ),
        cell: ({ row }) => {
          const holding = row.original;
          const timeDepositDisplay = getTimeDepositDisplaySnapshot(holding, asOfDate);
          const gain = timeDepositDisplay?.gain ?? (holding.unrealizedGain ? parseFloat(holding.unrealizedGain) : null);
          const gainPct =
            timeDepositDisplay?.gainPct ??
            (holding.unrealizedGainPct ? parseFloat(holding.unrealizedGainPct) : null);

          if (gain === null || gainPct === null) {
            return <div className="text-muted-foreground text-right text-sm">—</div>;
          }

          return (
            <div className="flex flex-col items-end">
              <AmountDisplay
                value={gain}
                currency={holding.currency}
                isHidden={isBalanceHidden}
                displayCurrency={false}
                colorFormat={true}
              />
              <GainPercent value={gainPct} animated={false} className="text-xs" />
            </div>
          );
        },
        enableSorting: true,
        sortingFn: (rowA, rowB) => {
          const valueA =
            getTimeDepositDisplaySnapshot(rowA.original, asOfDate)?.gain ??
            parseFloat(rowA.original.unrealizedGain ?? "0");
          const valueB =
            getTimeDepositDisplaySnapshot(rowB.original, asOfDate)?.gain ??
            parseFloat(rowB.original.unrealizedGain ?? "0");
          return valueA - valueB;
        },
      },
      {
        id: "valuationDate",
        accessorFn: (row) => getTimeDepositDisplaySnapshot(row, asOfDate)?.valuationDate ?? row.valuationDate,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Last Valued" className="justify-end" />
        ),
        cell: ({ row }) => {
          const holding = row.original;
          const timeDepositDisplay = getTimeDepositDisplaySnapshot(holding, asOfDate);
          const date = new Date(timeDepositDisplay?.valuationDate ?? holding.valuationDate);
          const formatted = date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

          return <div className="text-muted-foreground text-right text-sm">{formatted}</div>;
        },
        enableSorting: true,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const holding = row.original;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hover:bg-muted text-muted-foreground inline-flex h-9 w-9 items-center justify-center rounded-md border transition"
                    aria-label="Open actions"
                  >
                    <Icons.MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onUpdateValue && (
                    <DropdownMenuItem onClick={() => onUpdateValue(holding)}>
                      <Icons.DollarSign className="mr-2 h-4 w-4" />
                      Update Value
                    </DropdownMenuItem>
                  )}
                  {onViewHistory && (
                    <DropdownMenuItem onClick={() => onViewHistory(holding)}>
                      <Icons.History className="mr-2 h-4 w-4" />
                      Value History
                    </DropdownMenuItem>
                  )}
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(holding)}>
                      <Icons.Pencil className="mr-2 h-4 w-4" />
                      Edit Details
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setAssetToDelete(holding)}
                      >
                        <Icons.Trash className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [asOfDate, isBalanceHidden, onEdit, onUpdateValue, onViewHistory, onDelete, onRowClick],
  );

  if (isLoading) {
    return (
      <div className="space-y-4 pt-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!holdings || holdings.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <EmptyPlaceholder
          icon={<Icons.Wallet className="text-muted-foreground h-10 w-10" />}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    );
  }

  return (
    <>
      <DataTable
        data={holdings}
        columns={columns}
        searchBy="name"
        defaultSorting={[{ id: "marketValue", desc: true }]}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={assetToDelete !== null}
        onOpenChange={(open) => !open && setAssetToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{assetToDelete?.name}</span>? This will remove all
              valuation history and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Icon component for alternative asset kinds (duotone style)
 */
function AssetKindIcon({ holding, size = 20 }: { holding: AlternativeAssetHolding; size?: number }) {
  if (isTimeDepositAsset(holding)) {
    return <Icons.BadgeDollarSign size={size} />;
  }

  if (isInsuranceAsset(holding)) {
    return <Icons.Shield size={size} />;
  }

  if (isMpfAsset(holding)) {
    return <Icons.Briefcase size={size} />;
  }

  switch (holding.kind.toLowerCase()) {
    case "property":
      return <Icons.RealEstateDuotone size={size} />;
    case "vehicle":
      return <Icons.VehicleDuotone size={size} />;
    case "collectible":
      return <Icons.CollectibleDuotone size={size} />;
    case "precious":
      return <Icons.PreciousDuotone size={size} />;
    case "liability":
      return <Icons.LiabilityDuotone size={size} />;
    default:
      return <Icons.OtherAssetDuotone size={size} />;
  }
}

export default AlternativeHoldingsTable;
