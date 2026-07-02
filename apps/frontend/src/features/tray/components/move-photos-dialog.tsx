import type { FilmRollSummary } from "@/adapters";
import { Button } from "@panorama/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@panorama/ui/components/ui/dialog";

interface MovePhotosDialogProps {
  open: boolean;
  currentFilmRollId?: string;
  filmRolls: FilmRollSummary[];
  selectedCount: number;
  onOpenChange: (open: boolean) => void;
  onMove: (destinationFilmRollId: string | null) => void;
}

export function MovePhotosDialog({
  open,
  currentFilmRollId,
  filmRolls,
  selectedCount,
  onOpenChange,
  onMove,
}: MovePhotosDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move {selectedCount === 1 ? "Photo" : "Photos"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {currentFilmRollId && (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => onMove(null)}
            >
              Tray
            </Button>
          )}

          {filmRolls.map((roll) => (
            <Button
              key={roll.id}
              type="button"
              variant="outline"
              className="w-full justify-start"
              disabled={roll.id === currentFilmRollId}
              onClick={() => onMove(roll.id)}
            >
              {roll.name}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
