import { invokeTauriOrNull } from "./tauriInvoke";
import type { CliKey } from "./providers";

export type SkillRepoSummary = {
  id: number;
  git_url: string;
  branch: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
};

export type InstalledSkillSummary = {
  id: number;
  skill_key: string;
  name: string;
  description: string;
  source_git_url: string;
  source_branch: string;
  source_subdir: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
};

export type AvailableSkillSummary = {
  name: string;
  description: string;
  source_git_url: string;
  source_branch: string;
  source_subdir: string;
  installed: boolean;
};

export type SkillsPaths = {
  ssot_dir: string;
  repos_dir: string;
  cli_dir: string;
};

export type LocalSkillSummary = {
  dir_name: string;
  path: string;
  name: string;
  description: string;
};

export async function skillReposList() {
  return invokeTauriOrNull<SkillRepoSummary[]>("skill_repos_list");
}

export async function skillRepoUpsert(input: {
  repo_id?: number | null;
  git_url: string;
  branch: string;
  enabled: boolean;
}) {
  return invokeTauriOrNull<SkillRepoSummary>("skill_repo_upsert", {
    repoId: input.repo_id ?? null,
    gitUrl: input.git_url,
    branch: input.branch,
    enabled: input.enabled,
  });
}

export async function skillRepoDelete(repoId: number) {
  return invokeTauriOrNull<boolean>("skill_repo_delete", { repoId });
}

export async function skillsInstalledList(workspaceId: number) {
  return invokeTauriOrNull<InstalledSkillSummary[]>("skills_installed_list", { workspaceId });
}

export async function skillsDiscoverAvailable(refresh: boolean) {
  return invokeTauriOrNull<AvailableSkillSummary[]>("skills_discover_available", {
    refresh,
  });
}

export async function skillInstall(input: {
  workspace_id: number;
  git_url: string;
  branch: string;
  source_subdir: string;
  enabled: boolean;
}) {
  return invokeTauriOrNull<InstalledSkillSummary>("skill_install", {
    workspaceId: input.workspace_id,
    gitUrl: input.git_url,
    branch: input.branch,
    sourceSubdir: input.source_subdir,
    enabled: input.enabled,
  });
}

export async function skillSetEnabled(input: {
  workspace_id: number;
  skill_id: number;
  enabled: boolean;
}) {
  return invokeTauriOrNull<InstalledSkillSummary>("skill_set_enabled", {
    workspaceId: input.workspace_id,
    skillId: input.skill_id,
    enabled: input.enabled,
  });
}

export async function skillUninstall(skillId: number) {
  return invokeTauriOrNull<boolean>("skill_uninstall", { skillId });
}

export async function skillsLocalList(workspaceId: number) {
  return invokeTauriOrNull<LocalSkillSummary[]>("skills_local_list", { workspaceId });
}

export async function skillImportLocal(input: { workspace_id: number; dir_name: string }) {
  return invokeTauriOrNull<InstalledSkillSummary>("skill_import_local", {
    workspaceId: input.workspace_id,
    dirName: input.dir_name,
  });
}

export async function skillsPathsGet(cliKey: CliKey) {
  return invokeTauriOrNull<SkillsPaths>("skills_paths_get", { cliKey });
}
