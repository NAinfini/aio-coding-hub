import { describe, expect, it, vi } from "vitest";
import { invokeTauriOrNull } from "../tauriInvoke";
import { cliProxySetEnabled, cliProxyStatusAll, cliProxySyncEnabled } from "../cliProxy";

vi.mock("../tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../tauriInvoke")>("../tauriInvoke");
  return { ...actual, invokeTauriOrNull: vi.fn() };
});

describe("services/cliProxy", () => {
  it("invokes cli proxy commands with expected parameters", async () => {
    vi.mocked(invokeTauriOrNull).mockResolvedValue(null as any);

    await cliProxyStatusAll();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("cli_proxy_status_all");

    await cliProxySetEnabled({ cli_key: "claude" as any, enabled: true });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("cli_proxy_set_enabled", {
      cliKey: "claude",
      enabled: true,
    });

    await cliProxySyncEnabled("http://127.0.0.1:37123");
    expect(invokeTauriOrNull).toHaveBeenCalledWith("cli_proxy_sync_enabled", {
      baseOrigin: "http://127.0.0.1:37123",
    });
  });
});
