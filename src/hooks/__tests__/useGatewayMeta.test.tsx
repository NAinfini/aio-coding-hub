import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hasTauriRuntime } from "../../services/tauriInvoke";
import { useGatewayStatusQuery } from "../../query/gateway";
import { useSettingsQuery } from "../../query/settings";
import { useGatewayMeta } from "../useGatewayMeta";

vi.mock("../../services/tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../../services/tauriInvoke")>(
    "../../services/tauriInvoke"
  );
  return { ...actual, hasTauriRuntime: vi.fn() };
});
vi.mock("../../query/gateway", async () => {
  const actual = await vi.importActual<typeof import("../../query/gateway")>("../../query/gateway");
  return { ...actual, useGatewayStatusQuery: vi.fn() };
});
vi.mock("../../query/settings", async () => {
  const actual =
    await vi.importActual<typeof import("../../query/settings")>("../../query/settings");
  return { ...actual, useSettingsQuery: vi.fn() };
});

describe("hooks/useGatewayMeta", () => {
  it("returns unavailable when tauri runtime is absent", () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);
    vi.mocked(useSettingsQuery).mockReturnValue({ data: null } as any);
    vi.mocked(useGatewayStatusQuery).mockReturnValue({ data: null } as any);

    const { result } = renderHook(() => useGatewayMeta());
    expect(result.current.gatewayAvailable).toBe("unavailable");
    expect(result.current.preferredPort).toBe(37123);
  });

  it("maps gateway query states", () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(useSettingsQuery).mockReturnValue({ data: { preferred_port: 40000 } } as any);

    vi.mocked(useGatewayStatusQuery).mockReturnValue({
      isLoading: true,
      isError: false,
      data: { running: false, port: null, base_url: null, listen_addr: null },
    } as any);
    const { result, rerender } = renderHook(() => useGatewayMeta());
    expect(result.current.gatewayAvailable).toBe("checking");
    expect(result.current.preferredPort).toBe(40000);

    vi.mocked(useGatewayStatusQuery).mockReturnValue({
      isLoading: false,
      isError: true,
      data: null,
    } as any);
    rerender();
    expect(result.current.gatewayAvailable).toBe("unavailable");

    vi.mocked(useGatewayStatusQuery).mockReturnValue({
      isLoading: false,
      isError: false,
      data: null,
    } as any);
    rerender();
    expect(result.current.gatewayAvailable).toBe("unavailable");

    vi.mocked(useGatewayStatusQuery).mockReturnValue({
      isLoading: false,
      isError: false,
      data: { running: true, port: 40000, base_url: null, listen_addr: null },
    } as any);
    rerender();
    expect(result.current.gatewayAvailable).toBe("available");
  });
});
