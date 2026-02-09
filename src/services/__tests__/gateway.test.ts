import { describe, expect, it, vi } from "vitest";
import { logToConsole } from "../consoleLog";
import {
  gatewayCircuitStatus,
  gatewaySessionsList,
  gatewayStatus,
  type GatewayActiveSession,
  type GatewayProviderCircuitStatus,
  type GatewayStatus,
} from "../gateway";
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

describe("services/gateway", () => {
  it("returns null without tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);

    await expect(gatewayStatus()).resolves.toBeNull();
    await expect(gatewaySessionsList(20)).resolves.toBeNull();
    await expect(gatewayCircuitStatus("claude")).resolves.toBeNull();

    expect(invokeTauriOrNull).not.toHaveBeenCalled();
    expect(logToConsole).not.toHaveBeenCalled();
  });

  it("returns invoke result with tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);

    const status: GatewayStatus = {
      running: true,
      port: 37123,
      base_url: "http://127.0.0.1:37123",
      listen_addr: "127.0.0.1:37123",
    };
    const sessions: GatewayActiveSession[] = [
      {
        cli_key: "claude",
        session_id: "session-1",
        session_suffix: "1",
        provider_id: 1,
        provider_name: "Provider-1",
        expires_at: 1,
        request_count: 2,
        total_input_tokens: 3,
        total_output_tokens: 4,
        total_cost_usd: 0.01,
        total_duration_ms: 20,
      },
    ];
    const circuits: GatewayProviderCircuitStatus[] = [
      {
        provider_id: 1,
        state: "OPEN",
        failure_count: 3,
        failure_threshold: 5,
        open_until: 100,
        cooldown_until: null,
      },
    ];

    vi.mocked(invokeTauriOrNull)
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(sessions)
      .mockResolvedValueOnce(circuits);

    await expect(gatewayStatus()).resolves.toEqual(status);
    await expect(gatewaySessionsList(20)).resolves.toEqual(sessions);
    await expect(gatewayCircuitStatus("claude")).resolves.toEqual(circuits);
  });

  it("rethrows invoke errors and logs details", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockRejectedValueOnce(new Error("boom"));

    await expect(gatewayStatus()).rejects.toThrow("boom");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "获取网关状态失败",
      expect.objectContaining({
        cmd: "gateway_status",
        error: expect.stringContaining("boom"),
      })
    );
  });

  it("treats null invoke result as error and logs", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValueOnce(null);

    await expect(gatewayStatus()).rejects.toThrow("IPC_NULL_RESULT: gateway_status");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "获取网关状态失败",
      expect.objectContaining({
        cmd: "gateway_status",
        error: expect.stringContaining("IPC_NULL_RESULT: gateway_status"),
      })
    );
  });
});
