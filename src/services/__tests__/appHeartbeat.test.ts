import { describe, expect, it, vi, beforeEach } from "vitest";
import { setTauriRuntime, clearTauriRuntime } from "../../test/utils/tauriRuntime";
import { tauriListen, emitTauriEvent } from "../../test/mocks/tauri";

vi.mock("../../services/tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../../services/tauriInvoke")>(
    "../../services/tauriInvoke"
  );
  return {
    ...actual,
    invokeTauriOrNull: vi.fn().mockResolvedValue(true),
  };
});

import { invokeTauriOrNull } from "../../services/tauriInvoke";

describe("services/appHeartbeat", () => {
  beforeEach(() => {
    clearTauriRuntime();
    vi.mocked(invokeTauriOrNull).mockResolvedValue(true);
  });

  async function importFresh() {
    vi.resetModules();
    return await import("../appHeartbeat");
  }

  it("returns noop when no tauri runtime", async () => {
    const { listenAppHeartbeat } = await importFresh();
    const unlisten = await listenAppHeartbeat();
    expect(typeof unlisten).toBe("function");
    unlisten(); // should not throw
    expect(tauriListen).not.toHaveBeenCalled();
  });

  it("listens to app:heartbeat with tauri runtime", async () => {
    setTauriRuntime();
    const { listenAppHeartbeat } = await importFresh();
    const unlisten = await listenAppHeartbeat();

    expect(tauriListen).toHaveBeenCalledWith("app:heartbeat", expect.any(Function));

    unlisten();
  });

  it("heartbeat event triggers invokeTauriOrNull", async () => {
    setTauriRuntime();
    const { listenAppHeartbeat } = await importFresh();
    await listenAppHeartbeat();

    emitTauriEvent("app:heartbeat", {});

    await vi.waitFor(() => {
      expect(invokeTauriOrNull).toHaveBeenCalledWith("app_heartbeat_pong", undefined, {
        timeoutMs: 3_000,
      });
    });
  });

  it("invokeTauriOrNull rejection is caught gracefully", async () => {
    setTauriRuntime();
    vi.mocked(invokeTauriOrNull).mockRejectedValueOnce(new Error("timeout"));
    const { listenAppHeartbeat } = await importFresh();
    await listenAppHeartbeat();

    emitTauriEvent("app:heartbeat", {});

    // Should not throw
    await vi.waitFor(() => {
      expect(invokeTauriOrNull).toHaveBeenCalled();
    });
  });
});
