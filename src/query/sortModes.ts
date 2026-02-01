import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CliKey } from "../services/providers";
import {
  sortModeActiveList,
  sortModeActiveSet,
  sortModesList,
  type SortModeActiveRow,
} from "../services/sortModes";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { sortModesKeys } from "./keys";

export function useSortModesListQuery() {
  return useQuery({
    queryKey: sortModesKeys.list(),
    queryFn: () => sortModesList(),
    enabled: hasTauriRuntime(),
  });
}

export function useSortModeActiveListQuery() {
  return useQuery({
    queryKey: sortModesKeys.activeList(),
    queryFn: () => sortModeActiveList(),
    enabled: hasTauriRuntime(),
  });
}

export function useSortModeActiveSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { cliKey: CliKey; modeId: number | null }) =>
      sortModeActiveSet({ cli_key: input.cliKey, mode_id: input.modeId }),
    onMutate: (input) => {
      void queryClient.cancelQueries({ queryKey: sortModesKeys.activeList() });

      const previous =
        queryClient.getQueryData<SortModeActiveRow[] | null>(sortModesKeys.activeList()) ?? null;

      if (previous) {
        const next = previous.map((row) =>
          row.cli_key === input.cliKey ? { ...row, mode_id: input.modeId } : row
        );
        queryClient.setQueryData(sortModesKeys.activeList(), next);
      }

      return { previous };
    },
    onSuccess: (res, _input, ctx) => {
      if (!res) {
        if (ctx?.previous) {
          queryClient.setQueryData(sortModesKeys.activeList(), ctx.previous);
        }
        return;
      }

      queryClient.setQueryData<SortModeActiveRow[] | null>(sortModesKeys.activeList(), (prev) => {
        if (!prev) return prev;
        return prev.map((row) => (row.cli_key === res.cli_key ? res : row));
      });
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(sortModesKeys.activeList(), ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sortModesKeys.activeList() });
    },
  });
}
