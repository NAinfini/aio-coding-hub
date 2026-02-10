import { describe, expect, it, vi } from "vitest";
import { settingsGet, settingsSet } from "../settings";
import { logToConsole } from "../consoleLog";
import { hasTauriRuntime, invokeTauriOrNull } from "../tauriInvoke";

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

describe("services/settings (error semantics)", () => {
  it("returns null without tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);

    await expect(settingsGet()).resolves.toBeNull();
    await expect(
      settingsSet({
        preferredPort: 37123,
        autoStart: false,
        logRetentionDays: 30,
        enableCacheAnomalyMonitor: false,
        failoverMaxAttemptsPerProvider: 5,
        failoverMaxProvidersToTry: 5,
      })
    ).resolves.toBeNull();
  });

  it("rethrows invoke errors and logs", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockRejectedValueOnce(new Error("settings boom"));

    await expect(settingsGet()).rejects.toThrow("settings boom");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "读取设置失败",
      expect.objectContaining({
        cmd: "settings_get",
        error: expect.stringContaining("settings boom"),
      })
    );
  });

  it("treats null invoke result as error with runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValueOnce(null);

    await expect(settingsGet()).rejects.toThrow("IPC_NULL_RESULT: settings_get");
  });
});
