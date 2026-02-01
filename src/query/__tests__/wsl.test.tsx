import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  wslConfigStatusGet,
  wslConfigureClients,
  wslDetect,
  wslHostAddressGet,
} from "../../services/wsl";
import { createQueryWrapper, createTestQueryClient } from "../../test/utils/reactQuery";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import { wslKeys } from "../keys";
import { useWslConfigureClientsMutation, useWslOverviewQuery } from "../wsl";

vi.mock("../../services/wsl", async () => {
  const actual = await vi.importActual<typeof import("../../services/wsl")>("../../services/wsl");
  return {
    ...actual,
    wslDetect: vi.fn(),
    wslHostAddressGet: vi.fn(),
    wslConfigStatusGet: vi.fn(),
    wslConfigureClients: vi.fn(),
  };
});

describe("query/wsl", () => {
  it("does not call wslDetect without tauri runtime", async () => {
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useWslOverviewQuery(), { wrapper });
    await Promise.resolve();

    expect(wslDetect).not.toHaveBeenCalled();
  });

  it("overview returns early when no distros are detected", async () => {
    setTauriRuntime();

    vi.mocked(wslDetect).mockResolvedValue({ detected: false, distros: [] });

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useWslOverviewQuery({ enabled: true }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(wslDetect).toHaveBeenCalledTimes(1);
    expect(wslHostAddressGet).not.toHaveBeenCalled();
    expect(wslConfigStatusGet).not.toHaveBeenCalled();
    expect(result.current.data?.detection?.detected).toBe(false);
    expect(result.current.data?.hostIp).toBeNull();
  });

  it("overview fetches host ip + config status when distros exist", async () => {
    setTauriRuntime();

    vi.mocked(wslDetect).mockResolvedValue({ detected: true, distros: ["Ubuntu"] });
    vi.mocked(wslHostAddressGet).mockResolvedValue("172.20.1.1");
    vi.mocked(wslConfigStatusGet).mockResolvedValue([
      { distro: "Ubuntu", claude: true, codex: false, gemini: false },
    ]);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useWslOverviewQuery({ enabled: true }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(wslHostAddressGet).toHaveBeenCalledTimes(1);
    expect(wslConfigStatusGet).toHaveBeenCalledWith(["Ubuntu"]);
    expect(result.current.data?.hostIp).toBe("172.20.1.1");
    expect(result.current.data?.statusRows?.[0]?.distro).toBe("Ubuntu");
  });

  it("configure mutation invalidates wsl keys", async () => {
    setTauriRuntime();

    vi.mocked(wslConfigureClients).mockResolvedValue({ ok: true, message: "ok", distros: [] });

    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useWslConfigureClientsMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ targets: { claude: true, codex: false, gemini: false } });
    });

    expect(wslConfigureClients).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: wslKeys.all });
  });
});
