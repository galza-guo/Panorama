import type { FilmRoll, NewFilmRoll } from "@/adapters";
import { Button } from "@panorama/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@panorama/ui/components/ui/dialog";
import { Input } from "@panorama/ui/components/ui/input";
import { Label } from "@panorama/ui/components/ui/label";
import { useEffect, useState } from "react";
import { FILM_ROLL_DEFAULT_ARTWORK_KEY, filmTypeOptions } from "./film-roll-options";

interface FilmRollEditorSheetProps {
  open: boolean;
  filmRoll?: FilmRoll | null;
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: NewFilmRoll) => void;
}

export function FilmRollEditorSheet({
  open,
  filmRoll,
  isSaving = false,
  onOpenChange,
  onSave,
}: FilmRollEditorSheetProps) {
  const [name, setName] = useState("");
  const [artworkKey, setArtworkKey] = useState(FILM_ROLL_DEFAULT_ARTWORK_KEY);

  useEffect(() => {
    if (!open) return;
    setName(filmRoll?.name ?? "");
    setArtworkKey(filmRoll?.artworkKey ?? FILM_ROLL_DEFAULT_ARTWORK_KEY);
  }, [filmRoll, open]);

  const canSave = name.trim().length > 0 && !isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{filmRoll ? "Edit Film Roll" : "New Film Roll"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="film-roll-name">Name</Label>
            <Input
              id="film-roll-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Trip to Europe"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="film-roll-type">Film type</Label>
            <select
              id="film-roll-type"
              value={artworkKey}
              onChange={(event) => setArtworkKey(event.target.value)}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {filmTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                name: name.trim(),
                filmTypeKey: artworkKey,
                artworkKey,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
