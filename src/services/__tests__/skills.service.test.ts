import { describe, expect, it, vi } from "vitest";
import { logToConsole } from "../consoleLog";
import { hasTauriRuntime, invokeTauriOrNull } from "../tauriInvoke";
import {
  skillImportLocal,
  skillReturnToLocal,
  skillInstall,
  skillRepoDelete,
  skillRepoUpsert,
  skillReposList,
  skillSetEnabled,
  skillUninstall,
  skillsDiscoverAvailable,
  skillsImportLocalBatch,
  skillsInstalledList,
  skillsLocalList,
  skillsPathsGet,
} from "../skills";

vi.mock("../tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../tauriInvoke")>("../tauriInvoke");
  return {
    ...actual,
    hasTauriRuntime: vi.fn(),
    invokeTauriOrNull: vi.fn(),
  };
});

vi.mock("../consoleLog", async () => {
  const actual = await vi.importActual<typeof import("../consoleLog")>("../consoleLog");
  return {
    ...actual,
    logToConsole: vi.fn(),
  };
});

describe("services/skills", () => {
  it("returns null without tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);

    await expect(skillReposList()).resolves.toBeNull();
    await expect(skillsInstalledList(1)).resolves.toBeNull();
    await expect(skillsPathsGet("claude")).resolves.toBeNull();

    expect(logToConsole).not.toHaveBeenCalled();
  });

  it("rethrows invoke errors and logs", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockRejectedValueOnce(new Error("skills boom"));

    await expect(skillReposList()).rejects.toThrow("skills boom");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "读取技能仓库列表失败",
      expect.objectContaining({
        cmd: "skill_repos_list",
        error: expect.stringContaining("skills boom"),
      })
    );
  });

  it("treats null invoke result as error with runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValueOnce(null);

    await expect(skillReposList()).rejects.toThrow("IPC_NULL_RESULT: skill_repos_list");
  });

  it("keeps argument mapping unchanged", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValue({ id: 1 } as any);

    await skillRepoUpsert({
      repo_id: null,
      git_url: "https://example.com/repo.git",
      branch: "main",
      enabled: true,
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skill_repo_upsert", {
      repoId: null,
      gitUrl: "https://example.com/repo.git",
      branch: "main",
      enabled: true,
    });

    await skillRepoDelete(1);
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skill_repo_delete", { repoId: 1 });

    await skillsDiscoverAvailable(true);
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skills_discover_available", {
      refresh: true,
    });

    await skillInstall({
      workspace_id: 1,
      git_url: "https://example.com/repo.git",
      branch: "main",
      source_subdir: "skills/a",
      enabled: true,
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skill_install", {
      workspaceId: 1,
      gitUrl: "https://example.com/repo.git",
      branch: "main",
      sourceSubdir: "skills/a",
      enabled: true,
    });

    await skillSetEnabled({ workspace_id: 1, skill_id: 2, enabled: false });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skill_set_enabled", {
      workspaceId: 1,
      skillId: 2,
      enabled: false,
    });

    await skillUninstall(2);
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skill_uninstall", { skillId: 2 });

    await skillReturnToLocal({ workspace_id: 1, skill_id: 2 });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skill_return_to_local", {
      workspaceId: 1,
      skillId: 2,
    });

    await skillsLocalList(1);
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skills_local_list", { workspaceId: 1 });

    await skillImportLocal({ workspace_id: 1, dir_name: "my-skill" });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skill_import_local", {
      workspaceId: 1,
      dirName: "my-skill",
    });

    await skillsImportLocalBatch({ workspace_id: 1, dir_names: ["a", "b"] });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skills_import_local_batch", {
      workspaceId: 1,
      dirNames: ["a", "b"],
    });

    await skillsPathsGet("claude");
    expect(invokeTauriOrNull).toHaveBeenCalledWith("skills_paths_get", { cliKey: "claude" });
  });
});
