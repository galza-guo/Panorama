import {
  createFilmRoll,
  deleteFilmRoll,
  listFilmRolls,
  updateFilmRoll,
  type DeleteFilmRollMode,
  type NewFilmRoll,
  type UpdateFilmRoll,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useFilmRolls() {
  return useQuery({
    queryKey: [QueryKeys.FILM_ROLLS],
    queryFn: listFilmRolls,
  });
}

export function useCreateFilmRoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewFilmRoll) => createFilmRoll(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.FILM_ROLLS] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.TRAY_ITEMS] });
    },
  });
}

export function useUpdateFilmRoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ filmRollId, patch }: { filmRollId: string; patch: UpdateFilmRoll }) =>
      updateFilmRoll(filmRollId, patch),
    onSuccess: (_roll, variables) => {
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.FILM_ROLLS] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.TRAY_ITEMS] });
      void queryClient.invalidateQueries({
        queryKey: QueryKeys.filmRollPhotos(variables.filmRollId),
      });
    },
  });
}

export function useDeleteFilmRoll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ filmRollId, mode }: { filmRollId: string; mode: DeleteFilmRollMode }) =>
      deleteFilmRoll(filmRollId, mode),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.FILM_ROLLS] });
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.TRAY_ITEMS] });
      void queryClient.invalidateQueries({
        queryKey: QueryKeys.filmRollPhotos(variables.filmRollId),
      });
    },
  });
}
