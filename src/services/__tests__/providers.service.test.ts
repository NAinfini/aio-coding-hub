import { describe, expect, it, vi } from "vitest";
import {
  baseUrlPingMs,
  providerDelete,
  providerSetEnabled,
  providersList,
  providersReorder,
  providerUpsert,
} from "../providers";
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

describe("services/providers", () => {
  it("returns null without tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);

    await expect(providersList("claude")).resolves.toBeNull();
    await expect(baseUrlPingMs("https://example.com")).resolves.toBeNull();
    await expect(providerSetEnabled(1, true)).resolves.toBeNull();
    await expect(providerDelete(1)).resolves.toBeNull();
    await expect(providersReorder("claude", [1])).resolves.toBeNull();

    expect(logToConsole).not.toHaveBeenCalled();
  });

  it("rethrows and logs when invoke fails", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockRejectedValueOnce(new Error("providers boom"));

    await expect(providersList("claude")).rejects.toThrow("providers boom");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "读取供应商列表失败",
      expect.objectContaining({
        cmd: "providers_list",
        error: expect.stringContaining("providers boom"),
      })
    );
  });

  it("treats null invoke result as error when runtime exists", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValueOnce(null);

    await expect(providersList("claude")).rejects.toThrow("IPC_NULL_RESULT: providers_list");
  });

  it("builds provider_upsert args as before", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValueOnce({ id: 1, cli_key: "claude" } as any);

    await providerUpsert({
      provider_id: null,
      cli_key: "claude",
      name: "P1",
      base_urls: ["https://example.com"],
      base_url_mode: "order",
      api_key: null,
      enabled: true,
      cost_multiplier: 1,
      priority: null,
      claude_models: null,
      limit_5h_usd: null,
      limit_daily_usd: null,
      daily_reset_mode: "fixed",
      daily_reset_time: "00:00:00",
      limit_weekly_usd: null,
      limit_monthly_usd: null,
      limit_total_usd: null,
    });

    expect(invokeTauriOrNull).toHaveBeenCalledWith(
      "provider_upsert",
      expect.objectContaining({
        providerId: null,
        cliKey: "claude",
        name: "P1",
      })
    );
  });
});
