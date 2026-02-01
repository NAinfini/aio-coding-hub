import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

async function importFreshTraceStore() {
  vi.resetModules();
  return await import("../traceStore");
}

describe("services/traceStore", () => {
  it("ingestTraceStart creates traces and resets completed traces", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const { ingestTraceStart, ingestTraceRequest, useTraceStore } = await importFreshTraceStore();

    const { result } = renderHook(() => useTraceStore());
    expect(result.current.traces).toEqual([]);

    act(() => {
      ingestTraceStart({
        trace_id: "t1",
        cli_key: "claude",
        method: "GET",
        path: "/v1/test",
        query: null,
        requested_model: "claude-3",
        ts: 0,
      });
    });
    expect(result.current.traces[0]?.trace_id).toBe("t1");
    expect(result.current.traces[0]?.summary).toBeUndefined();

    act(() => {
      ingestTraceRequest({
        trace_id: "t1",
        cli_key: "claude",
        method: "GET",
        path: "/v1/test",
        query: null,
        status: 200,
        error_category: null,
        error_code: null,
        duration_ms: 12,
        attempts: [],
      });
    });
    expect(result.current.traces[0]?.summary?.status).toBe(200);

    vi.setSystemTime(1000);
    act(() => {
      ingestTraceStart({
        trace_id: "t1",
        cli_key: "claude",
        method: "POST",
        path: "/v1/again",
        query: "x=1",
        requested_model: "claude-3-opus",
        ts: 1,
      });
    });
    expect(result.current.traces[0]?.method).toBe("POST");
    expect(result.current.traces[0]?.path).toBe("/v1/again");
    expect(result.current.traces[0]?.summary).toBeUndefined();

    vi.useRealTimers();
  });

  it("ingestTraceAttempt upserts attempts and moves trace to front", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const { ingestTraceAttempt, useTraceStore } = await importFreshTraceStore();

    const { result } = renderHook(() => useTraceStore());

    act(() => {
      ingestTraceAttempt({
        trace_id: "tA",
        cli_key: "codex",
        method: "GET",
        path: "/x",
        query: null,
        attempt_index: 1,
        provider_id: 1,
        provider_name: "P1",
        base_url: "https://p1",
        outcome: "started",
        status: null,
        attempt_started_ms: 0,
        attempt_duration_ms: 0,
      });
    });
    expect(result.current.traces[0]?.trace_id).toBe("tA");
    expect(result.current.traces[0]?.attempts).toHaveLength(1);

    // Upsert same index replaces.
    act(() => {
      ingestTraceAttempt({
        trace_id: "tA",
        cli_key: "codex",
        method: "GET",
        path: "/x",
        query: null,
        attempt_index: 1,
        provider_id: 1,
        provider_name: "P1",
        base_url: "https://p1",
        outcome: "failed",
        status: 500,
        attempt_started_ms: 0,
        attempt_duration_ms: 12,
      });
    });
    expect(result.current.traces[0]?.attempts).toHaveLength(1);
    expect(result.current.traces[0]?.attempts[0]?.status).toBe(500);

    // New trace moves to front.
    vi.setSystemTime(1000);
    act(() => {
      ingestTraceAttempt({
        trace_id: "tB",
        cli_key: "claude",
        method: "POST",
        path: "/y",
        query: null,
        attempt_index: 1,
        provider_id: 2,
        provider_name: "P2",
        base_url: "https://p2",
        outcome: "started",
        status: null,
        attempt_started_ms: 0,
        attempt_duration_ms: 0,
      });
    });
    expect(result.current.traces[0]?.trace_id).toBe("tB");
    expect(result.current.traces[1]?.trace_id).toBe("tA");

    vi.useRealTimers();
  });
});
