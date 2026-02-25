import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { CliKey } from "../services/providers";
import {
  sortModeActiveList,
  sortModeActiveSet,
  sortModeCreate,
  sortModeDelete,
  sortModeRename,
  sortModesList,
  type SortModeActiveRow,
} from "../services/sortModes";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { sortModesKeys } from "./keys";

function invalidateSortModesQueries(
  queryClient: QueryClient,
  options: { includeActiveList?: boolean } = {}
) {
  void queryClient.invalidateQueries({ queryKey: sortModesKeys.list() });
  if (options.includeActiveList) {
    void queryClient.invalidateQueries({ queryKey: sortModesKeys.activeList() });
  }
}

export function useSortModesListQuery() {
  return useQuery({
    queryKey: sortModesKeys.list(),
    queryFn: () => sortModesList(),
    enabled: hasTauriRuntime(),
    placeholderData: keepPreviousData,
  });
}

export function useSortModeActiveListQuery() {
  return useQuery({
    queryKey: sortModesKeys.activeList(),
    queryFn: () => sortModeActiveList(),
    enabled: hasTauriRuntime(),
    placeholderData: keepPreviousData,
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
      void queryClient.invalidateQueries({ queryKey: sortModesKeys.activeList() });
    },
  });
}

export function useSortModeCreateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string }) => sortModeCreate({ name: input.name }),
    onSettled: () => {
      invalidateSortModesQueries(queryClient);
    },
  });
}

export function useSortModeRenameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { modeId: number; name: string }) =>
      sortModeRename({ mode_id: input.modeId, name: input.name }),
    onSettled: () => {
      invalidateSortModesQueries(queryClient);
    },
  });
}

export function useSortModeDeleteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { modeId: number }) => sortModeDelete({ mode_id: input.modeId }),
    onSettled: () => {
      invalidateSortModesQueries(queryClient, { includeActiveList: true });
    },
  });
}
