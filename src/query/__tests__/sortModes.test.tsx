import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SortModeActiveRow } from "../../services/sortModes";
import { sortModeActiveList, sortModeActiveSet, sortModesList } from "../../services/sortModes";
import { createDeferred } from "../../test/utils/deferred";
import { createQueryWrapper, createTestQueryClient } from "../../test/utils/reactQuery";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import { sortModesKeys } from "../keys";
import {
  useSortModeActiveListQuery,
  useSortModeActiveSetMutation,
  useSortModesListQuery,
} from "../sortModes";

vi.mock("../../services/sortModes", async () => {
  const actual = await vi.importActual<typeof import("../../services/sortModes")>(
    "../../services/sortModes"
  );
  return {
    ...actual,
    sortModesList: vi.fn(),
    sortModeActiveList: vi.fn(),
    sortModeActiveSet: vi.fn(),
  };
});

describe("query/sortModes", () => {
  it("does not call sortModesList without tauri runtime", async () => {
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useSortModesListQuery(), { wrapper });
    await Promise.resolve();

    expect(sortModesList).not.toHaveBeenCalled();
  });

  it("calls sortModesList and sortModeActiveList with tauri runtime", async () => {
    setTauriRuntime();

    vi.mocked(sortModesList).mockResolvedValue([]);
    vi.mocked(sortModeActiveList).mockResolvedValue([]);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useSortModesListQuery(), { wrapper });
    renderHook(() => useSortModeActiveListQuery(), { wrapper });

    await waitFor(() => {
      expect(sortModesList).toHaveBeenCalled();
      expect(sortModeActiveList).toHaveBeenCalled();
    });
  });

  it("useSortModeActiveSetMutation optimistically updates activeList and invalidates on settle", async () => {
    setTauriRuntime();

    const previous: SortModeActiveRow[] = [
      { cli_key: "claude", mode_id: 1, updated_at: 0 },
      { cli_key: "gemini", mode_id: null, updated_at: 0 },
    ];
    const updated: SortModeActiveRow = { cli_key: "claude", mode_id: 2, updated_at: 123 };

    const deferred = createDeferred<SortModeActiveRow>();
    vi.mocked(sortModeActiveSet).mockImplementation(() => deferred.promise);

    const client = createTestQueryClient();
    client.setQueryData(sortModesKeys.activeList(), previous);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useSortModeActiveSetMutation(), { wrapper });

    act(() => {
      result.current.mutate({ cliKey: "claude", modeId: 2 });
    });

    expect(client.getQueryData(sortModesKeys.activeList())).toEqual([
      { ...previous[0], mode_id: 2 },
      previous[1],
    ]);

    deferred.resolve(updated);

    await act(async () => {
      await deferred.promise;
    });

    expect(client.getQueryData(sortModesKeys.activeList())).toEqual([updated, previous[1]]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sortModesKeys.activeList() });
  });

  it("rolls back when sortModeActiveSet returns null", async () => {
    setTauriRuntime();

    const previous: SortModeActiveRow[] = [{ cli_key: "claude", mode_id: 1, updated_at: 0 }];

    vi.mocked(sortModeActiveSet).mockResolvedValue(null);

    const client = createTestQueryClient();
    client.setQueryData(sortModesKeys.activeList(), previous);
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useSortModeActiveSetMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cliKey: "claude", modeId: 2 });
    });

    expect(client.getQueryData(sortModesKeys.activeList())).toEqual(previous);
  });

  it("invalidates even when service returns null and cache is missing", async () => {
    setTauriRuntime();

    vi.mocked(sortModeActiveSet).mockResolvedValue(null);

    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useSortModeActiveSetMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cliKey: "claude", modeId: 2 });
    });

    expect(client.getQueryData(sortModesKeys.activeList())).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sortModesKeys.activeList() });
  });

  it("rolls back when sortModeActiveSet throws", async () => {
    setTauriRuntime();

    const previous: SortModeActiveRow[] = [{ cli_key: "claude", mode_id: 1, updated_at: 0 }];

    vi.mocked(sortModeActiveSet).mockRejectedValue(new Error("boom"));

    const client = createTestQueryClient();
    client.setQueryData(sortModesKeys.activeList(), previous);
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useSortModeActiveSetMutation(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ cliKey: "claude", modeId: 2 });
      } catch {
        // expected
      }
    });

    expect(client.getQueryData(sortModesKeys.activeList())).toEqual(previous);
  });

  it("invalidates without updating cache when activeList is missing", async () => {
    setTauriRuntime();

    const updated: SortModeActiveRow = { cli_key: "claude", mode_id: 2, updated_at: 123 };
    vi.mocked(sortModeActiveSet).mockResolvedValue(updated);

    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useSortModeActiveSetMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cliKey: "claude", modeId: 2 });
    });

    expect(client.getQueryData(sortModesKeys.activeList())).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sortModesKeys.activeList() });
  });
});
