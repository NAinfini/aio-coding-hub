import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GatewayProviderCircuitStatus } from "../../services/gateway";
import {
  gatewayCircuitResetCli,
  gatewayCircuitResetProvider,
  gatewayCircuitStatus,
  gatewaySessionsList,
  gatewayStatus,
} from "../../services/gateway";
import { createQueryWrapper, createTestQueryClient } from "../../test/utils/reactQuery";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import { gatewayKeys } from "../keys";
import {
  useGatewayCircuitByProviderId,
  useGatewayCircuitResetCliMutation,
  useGatewayCircuitResetProviderMutation,
  useGatewayCircuitStatusQuery,
  useGatewaySessionsListQuery,
  useGatewayStatusQuery,
} from "../gateway";

vi.mock("../../services/gateway", async () => {
  const actual =
    await vi.importActual<typeof import("../../services/gateway")>("../../services/gateway");
  return {
    ...actual,
    gatewayStatus: vi.fn(),
    gatewayCircuitStatus: vi.fn(),
    gatewaySessionsList: vi.fn(),
    gatewayCircuitResetProvider: vi.fn(),
    gatewayCircuitResetCli: vi.fn(),
  };
});

describe("query/gateway", () => {
  it("does not call gatewayCircuitStatus without tauri runtime", async () => {
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useGatewayCircuitStatusQuery("claude"), { wrapper });
    await Promise.resolve();

    expect(gatewayCircuitStatus).not.toHaveBeenCalled();
  });

  it("useGatewayCircuitByProviderId builds a provider_id -> status map", async () => {
    setTauriRuntime();

    const rows: GatewayProviderCircuitStatus[] = [
      {
        provider_id: 1,
        state: "closed",
        failure_count: 0,
        failure_threshold: 5,
        open_until: null,
        cooldown_until: null,
      },
      {
        provider_id: 2,
        state: "open",
        failure_count: 5,
        failure_threshold: 5,
        open_until: 123,
        cooldown_until: 456,
      },
    ];
    vi.mocked(gatewayCircuitStatus).mockResolvedValue(rows);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useGatewayCircuitByProviderId("claude"), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(gatewayCircuitStatus).toHaveBeenCalledWith("claude");
    expect(result.current.circuitByProviderId[1]).toEqual(rows[0]);
    expect(result.current.circuitByProviderId[2]).toEqual(rows[1]);
  });

  it("useGatewaySessionsListQuery respects options.enabled", async () => {
    setTauriRuntime();

    vi.mocked(gatewaySessionsList).mockResolvedValue([]);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useGatewaySessionsListQuery(10, { enabled: false }), { wrapper });
    await Promise.resolve();

    expect(gatewaySessionsList).not.toHaveBeenCalled();
  });

  it("useGatewaySessionsListQuery fetches with tauri runtime", async () => {
    setTauriRuntime();

    vi.mocked(gatewaySessionsList).mockResolvedValue([]);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useGatewaySessionsListQuery(10), { wrapper });

    await waitFor(() => {
      expect(gatewaySessionsList).toHaveBeenCalledWith(10);
    });
  });

  it("useGatewaySessionsListQuery enters error state when service rejects", async () => {
    setTauriRuntime();

    vi.mocked(gatewaySessionsList).mockRejectedValue(new Error("sessions boom"));

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useGatewaySessionsListQuery(10), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("useGatewayStatusQuery respects options.enabled=false", async () => {
    setTauriRuntime();

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useGatewayStatusQuery({ enabled: false }), { wrapper });
    await Promise.resolve();

    expect(gatewayStatus).not.toHaveBeenCalled();
  });

  it("useGatewayStatusQuery does not call gatewayStatus without tauri runtime", async () => {
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useGatewayStatusQuery(), { wrapper });
    await Promise.resolve();

    expect(gatewayStatus).not.toHaveBeenCalled();
  });

  it("useGatewayStatusQuery fetches gateway status", async () => {
    setTauriRuntime();

    vi.mocked(gatewayStatus).mockResolvedValue({
      running: true,
      port: 37123,
      base_url: "http://127.0.0.1:37123",
      listen_addr: "127.0.0.1:37123",
    });

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useGatewayStatusQuery(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(gatewayStatus).toHaveBeenCalledTimes(1);
    expect(result.current.data?.running).toBe(true);
  });

  it("useGatewayStatusQuery enters error state when service rejects", async () => {
    setTauriRuntime();

    vi.mocked(gatewayStatus).mockRejectedValue(new Error("status boom"));

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useGatewayStatusQuery(), { wrapper });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("useGatewayCircuitResetProviderMutation invalidates cliKey circuit status when provided", async () => {
    vi.mocked(gatewayCircuitResetProvider).mockResolvedValue(true);

    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useGatewayCircuitResetProviderMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cliKey: "claude", providerId: 1 });
    });

    expect(gatewayCircuitResetProvider).toHaveBeenCalledWith(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: gatewayKeys.circuitStatus("claude") });
  });

  it("useGatewayCircuitResetProviderMutation invalidates all circuits when cliKey is absent", async () => {
    vi.mocked(gatewayCircuitResetProvider).mockResolvedValue(true);

    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useGatewayCircuitResetProviderMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ providerId: 1 });
    });

    expect(gatewayCircuitResetProvider).toHaveBeenCalledWith(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: gatewayKeys.circuits() });
  });

  it("useGatewayCircuitResetCliMutation invalidates cli circuit status", async () => {
    vi.mocked(gatewayCircuitResetCli).mockResolvedValue(1);

    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useGatewayCircuitResetCliMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cliKey: "claude" });
    });

    expect(gatewayCircuitResetCli).toHaveBeenCalledWith("claude");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: gatewayKeys.circuitStatus("claude") });
  });
});
