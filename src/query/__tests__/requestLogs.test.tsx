import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  requestAttemptLogsByTraceId,
  requestLogGet,
  requestLogsListAfterIdAll,
  requestLogsListAll,
} from "../../services/requestLogs";
import { createQueryWrapper, createTestQueryClient } from "../../test/utils/reactQuery";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import {
  useRequestAttemptLogsByTraceIdQuery,
  useRequestLogDetailQuery,
  useRequestLogsIncrementalPollQuery,
  useRequestLogsIncrementalRefreshMutation,
  useRequestLogsListAllQuery,
} from "../requestLogs";

vi.mock("../../services/requestLogs", async () => {
  const actual = await vi.importActual<typeof import("../../services/requestLogs")>(
    "../../services/requestLogs"
  );
  return {
    ...actual,
    requestLogsListAll: vi.fn(),
    requestLogsListAfterIdAll: vi.fn(),
    requestLogGet: vi.fn(),
    requestAttemptLogsByTraceId: vi.fn(),
  };
});

describe("query/requestLogs", () => {
  it("does not call requestLogsListAll without tauri runtime", async () => {
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useRequestLogsListAllQuery(10), { wrapper });
    await Promise.resolve();

    expect(requestLogsListAll).not.toHaveBeenCalled();
  });

  it("calls requestLogsListAll with tauri runtime", async () => {
    setTauriRuntime();

    vi.mocked(requestLogsListAll).mockResolvedValue([]);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useRequestLogsListAllQuery(10), { wrapper });

    await waitFor(() => {
      expect(requestLogsListAll).toHaveBeenCalledWith(10);
    });
  });

  it("respects options.enabled=false", async () => {
    setTauriRuntime();

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useRequestLogsListAllQuery(10, { enabled: false }), { wrapper });
    await Promise.resolve();

    expect(requestLogsListAll).not.toHaveBeenCalled();
  });

  it("does not call requestLogGet when logId is null (even on manual refetch)", async () => {
    setTauriRuntime();

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useRequestLogDetailQuery(null), { wrapper });
    await act(async () => {
      const res = await result.current.refetch();
      expect(res.data).toBeNull();
    });

    expect(requestLogGet).not.toHaveBeenCalled();
  });

  it("calls requestLogGet when logId is provided", async () => {
    setTauriRuntime();

    vi.mocked(requestLogGet).mockResolvedValue(null);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useRequestLogDetailQuery(1), { wrapper });

    await waitFor(() => {
      expect(requestLogGet).toHaveBeenCalledWith(1);
    });
  });

  it("does not call requestAttemptLogsByTraceId when traceId is null (even on manual refetch)", async () => {
    setTauriRuntime();

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useRequestAttemptLogsByTraceIdQuery(null, 10), { wrapper });
    await act(async () => {
      const res = await result.current.refetch();
      expect(res.data).toBeNull();
    });

    expect(requestAttemptLogsByTraceId).not.toHaveBeenCalled();
  });

  it("calls requestAttemptLogsByTraceId when traceId is provided", async () => {
    setTauriRuntime();

    vi.mocked(requestAttemptLogsByTraceId).mockResolvedValue([]);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useRequestAttemptLogsByTraceIdQuery("trace-1", 10), { wrapper });

    await waitFor(() => {
      expect(requestAttemptLogsByTraceId).toHaveBeenCalledWith("trace-1", 10);
    });
  });

  it("incremental poll waits for base list and then merges after cursor", async () => {
    setTauriRuntime();

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    // base list not loaded yet (undefined) -> returns 0 and does not call services
    const { result: poll1 } = renderHook(() => useRequestLogsIncrementalPollQuery(10), { wrapper });
    await act(async () => {
      const res = await poll1.current.refetch();
      expect(res.data).toBe(0);
    });
    expect(requestLogsListAll).not.toHaveBeenCalled();

    // base list is loaded but empty -> full list fetch path, then sorts & sets list cache
    const listKey = ["requestLogs", "list", "all", 10] as any;
    client.setQueryData(listKey, []);

    vi.mocked(requestLogsListAll).mockResolvedValueOnce([
      { id: 1, created_at: 10, created_at_ms: null },
      { id: 2, created_at: 11, created_at_ms: 1 },
    ] as any);

    await act(async () => {
      const res = await poll1.current.refetch();
      expect(res.data).toBe(2);
    });

    const sorted = client.getQueryData<any[]>(listKey) ?? [];
    expect(sorted[0]?.id).toBe(1); // created_at_ms fallback wins over created_at

    // cursor > 0 -> listAfterIdAll and merge path
    vi.mocked(requestLogsListAfterIdAll).mockResolvedValueOnce([
      { id: 3, created_at: 12, created_at_ms: 12000 },
    ] as any);

    await act(async () => {
      const res = await poll1.current.refetch();
      expect(res.data).toBe(1);
    });

    const merged = client.getQueryData<any[]>(listKey) ?? [];
    expect(merged.some((r) => r.id === 3)).toBe(true);
  });

  it("incremental refresh mutation supports full/incremental and null items", async () => {
    setTauriRuntime();

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const listKey = ["requestLogs", "list", "all", 10] as any;

    vi.mocked(requestLogsListAll).mockResolvedValueOnce([
      { id: 1, created_at: 10, created_at_ms: null },
    ] as any);
    const { result } = renderHook(() => useRequestLogsIncrementalRefreshMutation(10), { wrapper });

    await act(async () => {
      const res = await result.current.mutateAsync();
      expect(res?.mode).toBe("full");
    });
    expect((client.getQueryData<any[]>(listKey) ?? []).length).toBe(1);

    client.setQueryData(listKey, [{ id: 5, created_at: 10, created_at_ms: null }] as any);
    vi.mocked(requestLogsListAfterIdAll).mockResolvedValueOnce(null as any);
    await act(async () => {
      const res = await result.current.mutateAsync();
      expect(res?.mode).toBe("incremental");
    });
    expect(client.getQueryData(listKey)).toEqual([{ id: 5, created_at: 10, created_at_ms: null }]);
  });
});
