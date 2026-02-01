// Usage:
// - Query adapters for `src/services/skills.ts`, used by skills pages/views.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CliKey } from "../services/providers";
import {
  skillInstall,
  skillRepoDelete,
  skillRepoUpsert,
  skillReposList,
  skillSetEnabled,
  skillUninstall,
  skillsDiscoverAvailable,
  skillsInstalledList,
  skillsLocalList,
  skillsPathsGet,
  skillImportLocal,
  type AvailableSkillSummary,
  type InstalledSkillSummary,
  type LocalSkillSummary,
  type SkillRepoSummary,
  type SkillsPaths,
} from "../services/skills";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { skillsKeys } from "./keys";

export function useSkillReposListQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: skillsKeys.reposList(),
    queryFn: () => skillReposList(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
  });
}

export function useSkillsInstalledListQuery(
  workspaceId: number | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: skillsKeys.installedList(workspaceId),
    queryFn: () => {
      if (!workspaceId) return null;
      return skillsInstalledList(workspaceId);
    },
    enabled: hasTauriRuntime() && Boolean(workspaceId) && (options?.enabled ?? true),
  });
}

export function useSkillsLocalListQuery(
  workspaceId: number | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: skillsKeys.localList(workspaceId),
    queryFn: () => {
      if (!workspaceId) return null;
      return skillsLocalList(workspaceId);
    },
    enabled: hasTauriRuntime() && Boolean(workspaceId) && (options?.enabled ?? true),
  });
}

export function useSkillsDiscoverAvailableQuery(refresh: boolean, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: skillsKeys.discoverAvailable(refresh),
    queryFn: () => skillsDiscoverAvailable(refresh),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
  });
}

export function useSkillsDiscoverAvailableMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (refresh: boolean) => skillsDiscoverAvailable(refresh),
    onSuccess: (rows, refresh) => {
      if (!rows) return;
      queryClient.setQueryData<AvailableSkillSummary[]>(
        skillsKeys.discoverAvailable(refresh),
        rows
      );
      queryClient.setQueryData<AvailableSkillSummary[]>(skillsKeys.discoverAvailable(false), rows);
    },
    onSettled: (_res, _err, refresh) => {
      queryClient.invalidateQueries({ queryKey: skillsKeys.discoverAvailable(refresh ?? false) });
      queryClient.invalidateQueries({ queryKey: skillsKeys.discoverAvailable(false) });
    },
  });
}

export function useSkillsPathsQuery(cliKey: CliKey | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: skillsKeys.paths(cliKey),
    queryFn: () => {
      if (!cliKey) return null;
      return skillsPathsGet(cliKey);
    },
    enabled: hasTauriRuntime() && Boolean(cliKey) && (options?.enabled ?? true),
  });
}

export function useSkillRepoUpsertMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      repoId: number | null;
      gitUrl: string;
      branch: string;
      enabled: boolean;
    }) =>
      skillRepoUpsert({
        repo_id: input.repoId,
        git_url: input.gitUrl,
        branch: input.branch,
        enabled: input.enabled,
      }),
    onSuccess: (next) => {
      if (!next) return;
      queryClient.setQueryData<SkillRepoSummary[]>(skillsKeys.reposList(), (cur) => {
        const prev = cur ?? [];
        const exists = prev.some((r) => r.id === next.id);
        if (exists) return prev.map((r) => (r.id === next.id ? next : r));
        return [next, ...prev];
      });
      queryClient.invalidateQueries({ queryKey: skillsKeys.discoverAvailable(false) });
    },
  });
}

export function useSkillRepoDeleteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (repoId: number) => skillRepoDelete(repoId),
    onSuccess: (ok, repoId) => {
      if (!ok) return;
      queryClient.setQueryData<SkillRepoSummary[]>(skillsKeys.reposList(), (cur) =>
        (cur ?? []).filter((r) => r.id !== repoId)
      );
      queryClient.invalidateQueries({ queryKey: skillsKeys.discoverAvailable(false) });
    },
  });
}

export function useSkillInstallMutation(workspaceId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      gitUrl: string;
      branch: string;
      sourceSubdir: string;
      enabled: boolean;
    }) =>
      skillInstall({
        workspace_id: workspaceId,
        git_url: input.gitUrl,
        branch: input.branch,
        source_subdir: input.sourceSubdir,
        enabled: input.enabled,
      }),
    onSuccess: (next) => {
      if (!next) return;
      queryClient.setQueryData<InstalledSkillSummary[]>(
        skillsKeys.installedList(workspaceId),
        (cur) => {
          const prev = cur ?? [];
          const exists = prev.some((s) => s.id === next.id);
          if (exists) return prev.map((s) => (s.id === next.id ? next : s));
          return [next, ...prev];
        }
      );
      queryClient.invalidateQueries({ queryKey: skillsKeys.discoverAvailable(false) });
    },
  });
}

export function useSkillSetEnabledMutation(workspaceId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { skillId: number; enabled: boolean }) =>
      skillSetEnabled({
        workspace_id: workspaceId,
        skill_id: input.skillId,
        enabled: input.enabled,
      }),
    onSuccess: (next) => {
      if (!next) return;
      queryClient.setQueryData<InstalledSkillSummary[]>(
        skillsKeys.installedList(workspaceId),
        (cur) => (cur ?? []).map((s) => (s.id === next.id ? next : s))
      );
    },
  });
}

export function useSkillUninstallMutation(workspaceId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (skillId: number) => skillUninstall(skillId),
    onSuccess: (ok, skillId) => {
      if (!ok) return;
      queryClient.setQueryData<InstalledSkillSummary[]>(
        skillsKeys.installedList(workspaceId),
        (cur) => (cur ?? []).filter((s) => s.id !== skillId)
      );
      queryClient.invalidateQueries({ queryKey: skillsKeys.discoverAvailable(false) });
    },
  });
}

export function useSkillImportLocalMutation(workspaceId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dirName: string) =>
      skillImportLocal({ workspace_id: workspaceId, dir_name: dirName }),
    onSuccess: (next) => {
      if (!next) return;
      queryClient.setQueryData<InstalledSkillSummary[]>(
        skillsKeys.installedList(workspaceId),
        (cur) => {
          const prev = cur ?? [];
          const exists = prev.some((s) => s.id === next.id);
          if (exists) return prev.map((s) => (s.id === next.id ? next : s));
          return [next, ...prev];
        }
      );
      queryClient.invalidateQueries({ queryKey: skillsKeys.localList(workspaceId) });
    },
  });
}

export type {
  AvailableSkillSummary,
  InstalledSkillSummary,
  LocalSkillSummary,
  SkillRepoSummary,
  SkillsPaths,
};
