import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { logToConsole } from "../../services/consoleLog";
import { useCliProxySetEnabledMutation, useCliProxyStatusAllQuery } from "../../query/cliProxy";
import { useCliProxy } from "../useCliProxy";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../services/consoleLog", () => ({ logToConsole: vi.fn() }));
vi.mock("../../query/cliProxy", async () => {
  const actual =
    await vi.importActual<typeof import("../../query/cliProxy")>("../../query/cliProxy");
  return { ...actual, useCliProxyStatusAllQuery: vi.fn(), useCliProxySetEnabledMutation: vi.fn() };
});

describe("hooks/useCliProxy", () => {
  it("derives enabled flags from query status", () => {
    vi.mocked(useCliProxyStatusAllQuery).mockReturnValue({
      data: [
        { cli_key: "claude", enabled: false },
        { cli_key: "codex", enabled: true },
        { cli_key: "unknown", enabled: true },
      ],
      refetch: vi.fn(),
    } as any);
    vi.mocked(useCliProxySetEnabledMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);

    const { result } = renderHook(() => useCliProxy());
    expect(result.current.enabled).toEqual({ claude: false, codex: true, gemini: false });
  });

  it("handles toggle success/failure flows", async () => {
    const refetch = vi.fn();
    vi.mocked(useCliProxyStatusAllQuery).mockReturnValue({ data: null, refetch } as any);

    const mutateAsync = vi.fn();
    mutateAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ok: true, message: "OK", cli_key: "codex", enabled: true } as any)
      .mockResolvedValueOnce({ ok: false, message: "bad", cli_key: "codex", enabled: true } as any)
      .mockRejectedValueOnce(new Error("boom"));
    vi.mocked(useCliProxySetEnabledMutation).mockReturnValue({ mutateAsync } as any);

    const { result } = renderHook(() => useCliProxy());

    act(() => result.current.setCliProxyEnabled("codex" as any, true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));

    act(() => result.current.setCliProxyEnabled("codex" as any, true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("OK"));
    expect(logToConsole).toHaveBeenCalledWith("info", "开启 CLI 代理", expect.anything());

    act(() => result.current.setCliProxyEnabled("codex" as any, true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("操作失败：bad"));
    expect(logToConsole).toHaveBeenCalledWith("error", "开启 CLI 代理失败", expect.anything());

    act(() => result.current.setCliProxyEnabled("codex" as any, true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("操作失败：Error: boom"));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });
});
