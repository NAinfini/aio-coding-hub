import { describe, expect, it, vi } from "vitest";
import { logToConsole } from "../consoleLog";
import { hasTauriRuntime, invokeTauriOrNull } from "../tauriInvoke";
import {
  workspaceApply,
  workspaceCreate,
  workspaceDelete,
  workspacePreview,
  workspaceRename,
  workspacesList,
} from "../workspaces";

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

describe("services/workspaces", () => {
  it("returns null without tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);

    await expect(workspacesList("claude")).resolves.toBeNull();
    await expect(workspacePreview(1)).resolves.toBeNull();
    await expect(workspaceApply(1)).resolves.toBeNull();

    expect(logToConsole).not.toHaveBeenCalled();
  });

  it("rethrows invoke errors and logs", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockRejectedValueOnce(new Error("workspaces boom"));

    await expect(workspacesList("claude")).rejects.toThrow("workspaces boom");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "读取工作区列表失败",
      expect.objectContaining({
        cmd: "workspaces_list",
        error: expect.stringContaining("workspaces boom"),
      })
    );
  });

  it("treats null invoke result as error with runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValueOnce(null);

    await expect(workspacesList("claude")).rejects.toThrow("IPC_NULL_RESULT: workspaces_list");
  });

  it("keeps argument mapping unchanged", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValue({ id: 1 } as any);

    await workspaceCreate({
      cli_key: "claude",
      name: "W1",
      clone_from_active: true,
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("workspace_create", {
      cliKey: "claude",
      name: "W1",
      cloneFromActive: true,
    });

    await workspaceRename({ workspace_id: 9, name: "W9" });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("workspace_rename", {
      workspaceId: 9,
      name: "W9",
    });

    await workspaceDelete(9);
    expect(invokeTauriOrNull).toHaveBeenCalledWith("workspace_delete", {
      workspaceId: 9,
    });
  });
});
