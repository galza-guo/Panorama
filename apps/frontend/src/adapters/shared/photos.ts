import { invoke } from "./platform";

export interface FilmRoll {
  id: string;
  name: string;
  filmTypeKey: string;
  artworkKey: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FilmRollSummary extends FilmRoll {
  photoCount: number;
}

export interface NewFilmRoll {
  id?: string;
  name: string;
  filmTypeKey?: string;
  artworkKey?: string;
  sortOrder?: number;
}

export interface UpdateFilmRoll {
  name?: string;
  filmTypeKey?: string;
  artworkKey?: string;
  sortOrder?: number;
}

export type DeleteFilmRollMode = "MovePhotosToTray" | "DeletePhotos";

export interface Photo {
  id: string;
  filePath: string;
  originalFileName?: string | null;
  thumbnailPath?: string | null;
  filmRollId?: string | null;
  sortOrder: number;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewPhoto {
  id?: string;
  filePath: string;
  originalFileName?: string | null;
  thumbnailPath?: string | null;
  filmRollId?: string | null;
  sortOrder?: number;
}

export type TrayItem = { type: "FilmRoll"; item: FilmRollSummary } | { type: "Photo"; item: Photo };

export const listTrayItems = async (): Promise<TrayItem[]> => {
  return invoke<TrayItem[]>("list_tray_items");
};

export const listFilmRolls = async (): Promise<FilmRollSummary[]> => {
  return invoke<FilmRollSummary[]>("list_film_rolls");
};

export const getFilmRoll = async (filmRollId: string): Promise<FilmRoll | null> => {
  return invoke<FilmRoll | null>("get_film_roll", { filmRollId });
};

export const listFilmRollPhotos = async (filmRollId: string): Promise<Photo[]> => {
  return invoke<Photo[]>("list_film_roll_photos", { filmRollId });
};

export const createPhoto = async (input: NewPhoto): Promise<Photo> => {
  return invoke<Photo>("create_photo", { input });
};

export const createFilmRoll = async (input: NewFilmRoll): Promise<FilmRoll> => {
  return invoke<FilmRoll>("create_film_roll", { input });
};

export const updateFilmRoll = async (
  filmRollId: string,
  patch: UpdateFilmRoll,
): Promise<FilmRoll> => {
  return invoke<FilmRoll>("update_film_roll", { filmRollId, patch });
};

export const deleteFilmRoll = async (
  filmRollId: string,
  mode: DeleteFilmRollMode = "MovePhotosToTray",
): Promise<void> => {
  await invoke<void>("delete_film_roll", { filmRollId, mode });
};

export const movePhotos = async (
  photoIds: string[],
  destinationFilmRollId: string | null,
): Promise<void> => {
  await invoke<void>("move_photos", { photoIds, destinationFilmRollId });
};
