import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryStateView } from "../QueryStateView";
import type { UseQueryResult } from "@tanstack/react-query";

function createMockQuery<T>(overrides: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    isPending: false,
    isLoadingError: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isPlaceholderData: false,
    isInitialLoading: false,
    status: "success",
    fetchStatus: "idle",
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
    refetch: vi.fn().mockResolvedValue({ data: undefined }),
    promise: Promise.resolve(undefined as T),
    ...overrides,
  } as UseQueryResult<T>;
}

describe("ui/QueryStateView", () => {
  it("renders loading state by default (Spinner)", () => {
    const query = createMockQuery<string[]>({ isLoading: true });
    render(<QueryStateView query={query}>{(data) => <div>{data.join(",")}</div>}</QueryStateView>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders custom loading element", () => {
    const query = createMockQuery<string[]>({ isLoading: true });
    render(
      <QueryStateView query={query} loading={<div>Custom loading...</div>}>
        {(data) => <div>{data.join(",")}</div>}
      </QueryStateView>
    );
    expect(screen.getByText("Custom loading...")).toBeInTheDocument();
  });

  it("renders error state with retry button", () => {
    const refetch = vi.fn().mockResolvedValue({ data: [] });
    const query = createMockQuery<string[]>({
      isError: true,
      error: new Error("fetch failed"),
      refetch,
    });
    render(<QueryStateView query={query}>{(data) => <div>{data.join(",")}</div>}</QueryStateView>);
    expect(screen.getByText("加载失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders custom error element", () => {
    const query = createMockQuery<string[]>({
      isError: true,
      error: new Error("fail"),
    });
    render(
      <QueryStateView query={query} error={<div>Custom error</div>}>
        {(data) => <div>{data.join(",")}</div>}
      </QueryStateView>
    );
    expect(screen.getByText("Custom error")).toBeInTheDocument();
  });

  it("renders empty state when data is empty array", () => {
    const query = createMockQuery<string[]>({ data: [] });
    render(
      <QueryStateView query={query} empty={<div>No items</div>}>
        {(data) => <div>{data.join(",")}</div>}
      </QueryStateView>
    );
    expect(screen.getByText("No items")).toBeInTheDocument();
  });

  it("renders empty state when data is null", () => {
    const query = createMockQuery<string[] | null>({ data: null });
    render(
      <QueryStateView query={query} empty={<div>Nothing here</div>}>
        {(data) => <div>{data?.join(",")}</div>}
      </QueryStateView>
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders children with data when data is available", () => {
    const query = createMockQuery<string[]>({ data: ["a", "b", "c"] });
    render(<QueryStateView query={query}>{(data) => <div>{data.join(",")}</div>}</QueryStateView>);
    expect(screen.getByText("a,b,c")).toBeInTheDocument();
  });

  it("uses custom isEmpty function", () => {
    type Data = { items: string[] };
    const query = createMockQuery<Data>({ data: { items: [] } });
    render(
      <QueryStateView
        query={query}
        isEmpty={(d) => d.items.length === 0}
        empty={<div>Custom empty</div>}
      >
        {(data) => <div>{data.items.join(",")}</div>}
      </QueryStateView>
    );
    expect(screen.getByText("Custom empty")).toBeInTheDocument();
  });

  it("renders nothing when empty and no empty prop", () => {
    const query = createMockQuery<string[]>({ data: [] });
    const { container } = render(
      <QueryStateView query={query}>{(data) => <div>{data.join(",")}</div>}</QueryStateView>
    );
    expect(container.innerHTML).toBe("");
  });
});
