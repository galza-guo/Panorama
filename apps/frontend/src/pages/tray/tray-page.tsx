import {
  createPhoto,
  getFilmRoll,
  listFilmRollPhotos,
  listTrayItems,
  type FilmRoll,
  type NewPhoto,
  type Photo,
} from "@/adapters";
import { FilmRollCard } from "@/features/tray/components/film-roll-card";
import { FilmRollEditorSheet } from "@/features/tray/components/film-roll-editor-sheet";
import { MovePhotosDialog } from "@/features/tray/components/move-photos-dialog";
import { TraySelectionToolbar } from "@/features/tray/components/tray-selection-toolbar";
import {
  useCreateFilmRoll,
  useDeleteFilmRoll,
  useFilmRolls,
  useUpdateFilmRoll,
} from "@/features/tray/hooks/use-film-rolls";
import { useMovePhotos } from "@/features/tray/hooks/use-move-photos";
import { QueryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Button } from "@panorama/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@panorama/ui/components/ui/dialog";
import { Icons } from "@panorama/ui/components/ui/icons";
import { Input } from "@panorama/ui/components/ui/input";
import { Label } from "@panorama/ui/components/ui/label";
import { toast } from "@panorama/ui/components/ui/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type TrayScope = "tray" | "filmRoll";

export default function TrayPage() {
  const { filmRollId } = useParams();
  const navigate = useNavigate();
  const scope: TrayScope = filmRollId ? "filmRoll" : "tray";
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRoll, setEditingRoll] = useState<FilmRoll | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const trayQuery = useQuery({
    queryKey: [QueryKeys.TRAY_ITEMS],
    queryFn: listTrayItems,
    enabled: scope === "tray",
  });
  const rollQuery = useQuery({
    queryKey: QueryKeys.filmRollPhotos(filmRollId ?? ""),
    queryFn: () => listFilmRollPhotos(filmRollId!),
    enabled: scope === "filmRoll" && Boolean(filmRollId),
  });
  const filmRollQuery = useQuery({
    queryKey: [QueryKeys.FILM_ROLLS, filmRollId],
    queryFn: () => getFilmRoll(filmRollId!),
    enabled: scope === "filmRoll" && Boolean(filmRollId),
  });
  const filmRollsQuery = useFilmRolls();
  const createFilmRollMutation = useCreateFilmRoll();
  const updateFilmRollMutation = useUpdateFilmRoll();
  const deleteFilmRollMutation = useDeleteFilmRoll();
  const movePhotosMutation = useMovePhotos();
  const createPhotoMutation = useMutation({
    mutationFn: (input: NewPhoto) => createPhoto(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.TRAY_ITEMS] });
      if (filmRollId) {
        void queryClient.invalidateQueries({ queryKey: QueryKeys.filmRollPhotos(filmRollId) });
      }
    },
  });

  const trayItems = trayQuery.data ?? [];
  const rollPhotos = rollQuery.data ?? [];
  const filmRolls = filmRollsQuery.data ?? [];
  const currentRoll = filmRollQuery.data;
  const title = scope === "filmRoll" ? (currentRoll?.name ?? "Film Roll") : "Tray";
  const isLoading = scope === "filmRoll" ? rollQuery.isLoading : trayQuery.isLoading;

  const togglePhoto = (photoId: string) => {
    setSelectedPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((selectedId) => selectedId !== photoId)
        : [...current, photoId],
    );
  };

  const handleMove = async (destinationFilmRollId: string | null) => {
    if (selectedPhotoIds.length === 0) return;
    try {
      await movePhotosMutation.mutateAsync({ photoIds: selectedPhotoIds, destinationFilmRollId });
      setSelectedPhotoIds([]);
      setMoveOpen(false);
    } catch {
      toast({
        title: "Could not move photos",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRoll = async (roll: FilmRoll) => {
    try {
      await deleteFilmRollMutation.mutateAsync({
        filmRollId: roll.id,
        mode: "MovePhotosToTray",
      });
      if (filmRollId === roll.id) {
        navigate("/tray");
      }
    } catch {
      toast({
        title: "Could not delete film roll",
        description: "Your photos were kept where they are.",
        variant: "destructive",
      });
    }
  };

  const handleDropOnRoll = async (rollId: string) => {
    if (selectedPhotoIds.length === 0) return;
    await handleMove(rollId);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {scope === "filmRoll" && (
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/tray")}>
              <Icons.ArrowLeft className="size-4" />
              <span className="sr-only">Back to Tray</span>
            </Button>
          )}
          <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {scope === "filmRoll" && (
            <Button type="button" variant="outline" onClick={() => navigate("/tray")}>
              Back to Tray
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditingRoll(null);
              setEditorOpen(true);
            }}
          >
            <Icons.Plus className="mr-2 size-4" />
            Film Roll
          </Button>
          <Button type="button" onClick={() => setPhotoDialogOpen(true)}>
            <Icons.FileImage className="mr-2 size-4" />
            Photo
          </Button>
        </div>
      </div>

      <TraySelectionToolbar
        selectedCount={selectedPhotoIds.length}
        onMove={() => setMoveOpen(true)}
        onClear={() => setSelectedPhotoIds([])}
      />

      {isLoading ? (
        <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {scope === "tray" &&
            trayItems.map((item) =>
              item.type === "FilmRoll" ? (
                <FilmRollCard
                  key={`roll-${item.item.id}`}
                  filmRoll={item.item}
                  onOpen={() => navigate(`/tray/rolls/${item.item.id}`)}
                  onEdit={() => {
                    setEditingRoll(item.item);
                    setEditorOpen(true);
                  }}
                  onDelete={() => void handleDeleteRoll(item.item)}
                  onDropPhotos={
                    selectedPhotoIds.length > 0
                      ? () => void handleDropOnRoll(item.item.id)
                      : undefined
                  }
                />
              ) : (
                <PhotoTile
                  key={`photo-${item.item.id}`}
                  photo={item.item}
                  selected={selectedPhotoIds.includes(item.item.id)}
                  onToggle={() => togglePhoto(item.item.id)}
                />
              ),
            )}

          {scope === "filmRoll" &&
            rollPhotos.map((photo) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                selected={selectedPhotoIds.includes(photo.id)}
                onToggle={() => togglePhoto(photo.id)}
              />
            ))}
        </div>
      )}

      {!isLoading &&
        ((scope === "tray" && trayItems.length === 0) ||
          (scope === "filmRoll" && rollPhotos.length === 0)) && (
          <div className="text-muted-foreground mt-16 flex flex-col items-center text-center">
            <Icons.FileImage className="mb-3 size-8" />
            <p className="text-sm">
              {scope === "tray" ? "No photos or film rolls yet." : "No photos in this film roll."}
            </p>
          </div>
        )}

      <FilmRollEditorSheet
        open={editorOpen}
        filmRoll={editingRoll}
        isSaving={createFilmRollMutation.isPending || updateFilmRollMutation.isPending}
        onOpenChange={setEditorOpen}
        onSave={(input) => {
          if (editingRoll) {
            updateFilmRollMutation.mutate(
              { filmRollId: editingRoll.id, patch: input },
              { onSuccess: () => setEditorOpen(false) },
            );
            return;
          }
          createFilmRollMutation.mutate(input, { onSuccess: () => setEditorOpen(false) });
        }}
      />

      <MovePhotosDialog
        open={moveOpen}
        currentFilmRollId={filmRollId}
        filmRolls={filmRolls}
        selectedCount={selectedPhotoIds.length}
        onOpenChange={setMoveOpen}
        onMove={(destination) => void handleMove(destination)}
      />

      <PhotoCreateDialog
        open={photoDialogOpen}
        currentFilmRollId={filmRollId}
        isSaving={createPhotoMutation.isPending}
        onOpenChange={setPhotoDialogOpen}
        onSave={(input) =>
          createPhotoMutation.mutate(input, {
            onSuccess: () => setPhotoDialogOpen(false),
          })
        }
      />
    </div>
  );
}

function PhotoTile({
  photo,
  selected,
  onToggle,
}: {
  photo: Photo;
  selected: boolean;
  onToggle: () => void;
}) {
  const src = photo.thumbnailPath ?? photo.filePath;
  const label = photo.originalFileName ?? photo.filePath.split("/").pop() ?? "Photo";

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", photo.id);
      }}
      onClick={onToggle}
      className={cn(
        "bg-muted hover:bg-muted/70 group relative aspect-square overflow-hidden rounded-md border text-left transition-colors",
        selected && "border-primary ring-primary/30 ring-2",
      )}
    >
      <img
        src={src}
        alt={label}
        className="h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div className="truncate text-xs text-white">{label}</div>
      </div>
      <div
        className={cn(
          "bg-background/80 absolute left-2 top-2 flex size-5 items-center justify-center rounded-full border opacity-0 transition-opacity group-hover:opacity-100",
          selected && "bg-primary text-primary-foreground opacity-100",
        )}
      >
        {selected && <Icons.Check className="size-3" />}
      </div>
    </button>
  );
}

function PhotoCreateDialog({
  open,
  currentFilmRollId,
  isSaving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  currentFilmRollId?: string;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: NewPhoto) => void;
}) {
  const [filePath, setFilePath] = useState("");
  const [name, setName] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Photo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="photo-path">Image URL or file path</Label>
            <Input
              id="photo-path"
              value={filePath}
              onChange={(event) => setFilePath(event.target.value)}
              placeholder="https://example.com/photo.jpg"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="photo-name">Name</Label>
            <Input
              id="photo-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Scan 001"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={filePath.trim().length === 0 || isSaving}
            onClick={() =>
              onSave({
                filePath: filePath.trim(),
                originalFileName: name.trim() || null,
                filmRollId: currentFilmRollId ?? null,
              })
            }
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
