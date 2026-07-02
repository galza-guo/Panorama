import type { FilmRollSummary } from "@/adapters";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@panorama/ui/components/ui/dropdown-menu";
import { Icons } from "@panorama/ui/components/ui/icons";

const filmLooks: Record<string, { body: string; label: string; accent: string; text: string }> = {
  "classic-color": {
    body: "from-amber-300 via-yellow-400 to-amber-500",
    label: "Color 400",
    accent: "bg-stone-950",
    text: "text-stone-950",
  },
  "mono-400": {
    body: "from-zinc-200 via-zinc-400 to-zinc-700",
    label: "Mono 400",
    accent: "bg-zinc-950",
    text: "text-zinc-950",
  },
  "chrome-200": {
    body: "from-sky-300 via-cyan-400 to-blue-500",
    label: "Chrome 200",
    accent: "bg-slate-950",
    text: "text-slate-950",
  },
  "warm-800": {
    body: "from-rose-300 via-orange-300 to-yellow-300",
    label: "Warm 800",
    accent: "bg-neutral-950",
    text: "text-neutral-950",
  },
};

interface FilmRollCardProps {
  filmRoll: FilmRollSummary;
  selected?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDropPhotos?: () => void;
}

export function FilmRollCard({
  filmRoll,
  selected = false,
  onOpen,
  onEdit,
  onDelete,
  onDropPhotos,
}: FilmRollCardProps) {
  const look = filmLooks[filmRoll.artworkKey] ?? filmLooks["classic-color"];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      onDragOver={(event) => {
        if (onDropPhotos) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (onDropPhotos) {
          event.preventDefault();
          onDropPhotos();
        }
      }}
      className={cn(
        "bg-background hover:bg-muted/40 group relative flex aspect-[4/3] cursor-pointer flex-col justify-between rounded-md border p-4 text-left transition-colors",
        selected && "border-primary bg-primary/5",
      )}
    >
      <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="text-muted-foreground hover:bg-background flex size-8 items-center justify-center rounded-md"
            onClick={(event) => event.stopPropagation()}
            aria-label="Film roll actions"
          >
            <Icons.MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              Rename / edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="relative h-24 w-32">
          <div className="absolute inset-y-3 left-1 w-5 rounded-l-full bg-neutral-950 shadow-inner" />
          <div className="absolute inset-y-3 right-1 w-5 rounded-r-full bg-neutral-950 shadow-inner" />
          <div
            className={cn(
              "absolute inset-x-3 inset-y-1 rounded-md bg-gradient-to-r shadow-sm",
              look.body,
            )}
          >
            <div className={cn("absolute inset-y-0 left-4 w-3", look.accent)} />
            <div className={cn("absolute inset-y-0 right-5 w-1.5 opacity-70", look.accent)} />
            <div
              className={cn(
                "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap text-xs font-semibold tracking-normal",
                look.text,
              )}
            >
              {look.label}
            </div>
          </div>
          <div className="absolute inset-x-8 top-0 h-2 rounded-full bg-neutral-950" />
          <div className="absolute inset-x-8 bottom-0 h-2 rounded-full bg-neutral-950" />
        </div>
      </div>

      <div>
        <div className="truncate text-sm font-medium">{filmRoll.name}</div>
        <div className="text-muted-foreground text-xs">
          {filmRoll.photoCount === 1 ? "1 photo" : `${filmRoll.photoCount} photos`}
        </div>
      </div>
    </div>
  );
}
