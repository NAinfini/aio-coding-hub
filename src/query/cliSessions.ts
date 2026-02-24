import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  cliSessionsMessagesGet,
  cliSessionsProjectsList,
  cliSessionsSessionsList,
  type CliSessionsSource,
} from "../services/cliSessions";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { cliSessionsKeys } from "./keys";

export function useCliSessionsProjectsListQuery(source: CliSessionsSource) {
  return useQuery({
    queryKey: cliSessionsKeys.projectsList(source),
    queryFn: () => cliSessionsProjectsList(source),
    enabled: hasTauriRuntime(),
    placeholderData: keepPreviousData,
  });
}

export function useCliSessionsSessionsListQuery(
  source: CliSessionsSource,
  projectId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: cliSessionsKeys.sessionsList(source, projectId),
    queryFn: () => cliSessionsSessionsList(source, projectId),
    enabled: hasTauriRuntime() && Boolean(projectId.trim()) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useCliSessionsMessagesInfiniteQuery(
  source: CliSessionsSource,
  filePath: string,
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery({
    queryKey: cliSessionsKeys.messages(source, filePath),
    queryFn: ({ pageParam = 0 }) =>
      cliSessionsMessagesGet({
        source,
        file_path: filePath,
        page: pageParam,
        page_size: 50,
        from_end: true,
      }),
    enabled: hasTauriRuntime() && Boolean(filePath.trim()) && (options?.enabled ?? true),
    getNextPageParam: (lastPage) => (lastPage?.has_more ? lastPage.page + 1 : undefined),
    initialPageParam: 0,
  });
}
