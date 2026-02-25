import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryClient, createQueryWrapper } from "../../test/utils/reactQuery";
import { setTauriRuntime, clearTauriRuntime } from "../../test/utils/tauriRuntime";

vi.mock("../../services/cliSessions", () => ({
  cliSessionsProjectsList: vi.fn().mockResolvedValue([]),
  cliSessionsSessionsList: vi.fn().mockResolvedValue([]),
  cliSessionsMessagesGet: vi.fn().mockResolvedValue({
    messages: [],
    total: 0,
    page: 0,
    page_size: 50,
    has_more: false,
  }),
}));

import {
  useCliSessionsProjectsListQuery,
  useCliSessionsSessionsListQuery,
  useCliSessionsMessagesInfiniteQuery,
} from "../cliSessions";

describe("query/cliSessions", () => {
  it("useCliSessionsProjectsListQuery renders", () => {
    setTauriRuntime();
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);
    const { result } = renderHook(() => useCliSessionsProjectsListQuery("claude"), { wrapper });
    // Hook should be in loading or success state
    expect(result.current.isLoading || result.current.isSuccess).toBe(true);
    clearTauriRuntime();
  });

  it("useCliSessionsSessionsListQuery renders", () => {
    setTauriRuntime();
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);
    const { result } = renderHook(() => useCliSessionsSessionsListQuery("claude", "proj-1"), {
      wrapper,
    });
    expect(result.current.isLoading || result.current.isSuccess).toBe(true);
    clearTauriRuntime();
  });

  it("useCliSessionsMessagesInfiniteQuery renders", () => {
    setTauriRuntime();
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);
    const { result } = renderHook(
      () => useCliSessionsMessagesInfiniteQuery("claude", "/path/to/file.json"),
      { wrapper }
    );
    expect(result.current.isLoading || result.current.isSuccess).toBe(true);
    clearTauriRuntime();
  });

  it("useCliSessionsSessionsListQuery disabled when empty projectId", () => {
    setTauriRuntime();
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);
    const { result } = renderHook(() => useCliSessionsSessionsListQuery("claude", ""), { wrapper });
    // Should not fetch with empty projectId
    expect(result.current.fetchStatus).toBe("idle");
    clearTauriRuntime();
  });
});
