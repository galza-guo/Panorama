import { Button } from "@panorama/ui/components/ui/button";
import { Icons } from "@panorama/ui/components/ui/icons";

interface TraySelectionToolbarProps {
  selectedCount: number;
  onMove: () => void;
  onClear: () => void;
}

export function TraySelectionToolbar({
  selectedCount,
  onMove,
  onClear,
}: TraySelectionToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="border-border bg-background/95 sticky top-0 z-20 mb-4 flex items-center justify-between rounded-md border px-3 py-2 shadow-sm backdrop-blur">
      <span className="text-muted-foreground text-sm">
        {selectedCount === 1 ? "1 photo selected" : `${selectedCount} photos selected`}
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onMove}>
          <Icons.FolderOpen className="mr-2 size-4" />
          Move
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
