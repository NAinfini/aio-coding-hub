import { describe, expect, it, vi } from "vitest";
import { tauriInvoke } from "../../test/mocks/tauri";
import { clearTauriRuntime, setTauriRuntime } from "../../test/utils/tauriRuntime";
import { hasTauriRuntime, invokeTauriOrNull } from "../tauriInvoke";

describe("services/tauriInvoke", () => {
  it("hasTauriRuntime reflects __TAURI_INTERNALS__", () => {
    clearTauriRuntime();
    expect(hasTauriRuntime()).toBe(false);

    setTauriRuntime();
    expect(hasTauriRuntime()).toBe(true);
  });

  it("invokeTauriOrNull returns null without runtime", async () => {
    clearTauriRuntime();
    vi.mocked(tauriInvoke).mockResolvedValueOnce("ok");
    await expect(invokeTauriOrNull("x")).resolves.toBeNull();
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("invokeTauriOrNull calls @tauri-apps/api/core.invoke with runtime", async () => {
    setTauriRuntime();
    vi.mocked(tauriInvoke).mockResolvedValueOnce({ ok: true });

    await expect(invokeTauriOrNull("cmd", { a: 1 })).resolves.toEqual({ ok: true });
    expect(tauriInvoke).toHaveBeenCalledWith("cmd", { a: 1 });
  });
});
