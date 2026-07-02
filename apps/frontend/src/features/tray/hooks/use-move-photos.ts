import { movePhotos } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useMovePhotos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      photoIds,
      destinationFilmRollId,
    }: {
      photoIds: string[];
      destinationFilmRollId: string | null;
    }) => movePhotos(photoIds, destinationFilmRollId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.TRAY_ITEMS] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.FILM_ROLLS] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.FILM_ROLL_PHOTOS] });
    },
  });
}
