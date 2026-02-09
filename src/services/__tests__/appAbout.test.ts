import { describe, expect, it, vi } from "vitest";
import { logToConsole } from "../consoleLog";
import { hasTauriRuntime, invokeTauriOrNull } from "../tauriInvoke";
import { appAboutGet } from "../appAbout";

vi.mock("../tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../tauriInvoke")>("../tauriInvoke");
  return { ...actual, hasTauriRuntime: vi.fn(), invokeTauriOrNull: vi.fn() };
});

vi.mock("../consoleLog", async () => {
  const actual = await vi.importActual<typeof import("../consoleLog")>("../consoleLog");
  return { ...actual, logToConsole: vi.fn() };
});

describe("services/appAbout", () => {
  it("returns about info when available", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);

    vi.mocked(invokeTauriOrNull).mockResolvedValue({
      os: "mac",
      arch: "arm64",
      profile: "dev",
      app_version: "0.0.0",
      bundle_type: null,
      run_mode: "desktop",
    } as any);

    const result = await appAboutGet();
    expect(result).toEqual(
      expect.objectContaining({ os: "mac", arch: "arm64", run_mode: "desktop" })
    );
  });

  it("returns null without tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);

    const result = await appAboutGet();
    expect(result).toBeNull();
    expect(invokeTauriOrNull).not.toHaveBeenCalled();
    expect(logToConsole).not.toHaveBeenCalled();
  });

  it("throws when invoke throws", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockRejectedValue(new Error("boom"));

    await expect(appAboutGet()).rejects.toThrow("boom");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "读取应用信息失败",
      expect.objectContaining({
        cmd: "app_about_get",
        error: expect.stringContaining("boom"),
      })
    );
  });

  it("throws when invoke returns null", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValue(null as any);

    await expect(appAboutGet()).rejects.toThrow("IPC_NULL_RESULT: app_about_get");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "读取应用信息失败",
      expect.objectContaining({
        cmd: "app_about_get",
        error: expect.stringContaining("IPC_NULL_RESULT: app_about_get"),
      })
    );
  });
});
