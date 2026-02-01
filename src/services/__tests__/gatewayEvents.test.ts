import { describe, expect, it, vi } from "vitest";
import { tauriListen, tauriUnlisten } from "../../test/mocks/tauri";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";

describe("services/gatewayEvents", () => {
  it("returns no-op when tauri runtime is missing", async () => {
    vi.resetModules();
    const { listenGatewayEvents } = await import("../gatewayEvents");
    const unlisten = await listenGatewayEvents();
    unlisten();
    expect(tauriListen).not.toHaveBeenCalled();
  });

  it("registers listeners and handles payload branches", async () => {
    setTauriRuntime();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const { setConsoleLogMinLevel } = await import("../consoleLog");
    setConsoleLogMinLevel("debug");

    vi.mocked(tauriListen).mockResolvedValue(tauriUnlisten);

    const { listenGatewayEvents } = await import("../gatewayEvents");
    const unlisten = await listenGatewayEvents();

    expect(tauriListen).toHaveBeenCalledTimes(5);

    const handlerFor = (eventName: string) =>
      vi.mocked(tauriListen).mock.calls.find((call) => call[0] === eventName)?.[1];

    const requestStart = handlerFor("gateway:request_start");
    requestStart?.({ payload: null } as any);
    requestStart?.({
      payload: {
        trace_id: "t1",
        cli_key: "claude",
        method: "GET",
        path: "/v1/test",
        query: null,
        requested_model: "claude-3",
        ts: 0,
      },
    } as any);

    const attempt = handlerFor("gateway:attempt");
    attempt?.({ payload: null } as any);
    attempt?.({
      payload: {
        trace_id: "t1",
        cli_key: "claude",
        method: "GET",
        path: "/v1/test",
        query: null,
        attempt_index: 1,
        provider_id: 1,
        provider_name: "P1",
        base_url: "https://p1",
        outcome: "started",
        status: null,
        attempt_started_ms: 0,
        attempt_duration_ms: 0,
      },
    } as any);
    attempt?.({
      payload: {
        trace_id: "t1",
        cli_key: "claude",
        method: "GET",
        path: "/v1/test",
        query: null,
        attempt_index: 1,
        provider_id: 1,
        provider_name: "P1",
        base_url: "https://p1",
        outcome: "failed",
        status: 500,
        attempt_started_ms: 0,
        attempt_duration_ms: 12,
        circuit_state_before: "OPEN",
        circuit_state_after: "CLOSED",
        circuit_failure_count: 1,
        circuit_failure_threshold: 5,
      },
    } as any);

    const request = handlerFor("gateway:request");
    request?.({ payload: null } as any);
    request?.({
      payload: {
        trace_id: "t1",
        cli_key: "claude",
        method: "GET",
        path: "/v1/test",
        query: null,
        status: 500,
        error_category: "upstream",
        error_code: "E",
        duration_ms: 1000,
        ttfb_ms: 200,
        attempts: [],
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
      },
    } as any);
    request?.({
      payload: {
        trace_id: "t2",
        cli_key: "claude",
        method: "POST",
        path: "/v1/ok",
        query: null,
        status: 200,
        error_category: null,
        error_code: null,
        duration_ms: 1000,
        ttfb_ms: 999,
        attempts: [],
        output_tokens: 5,
      },
    } as any);

    const log = handlerFor("gateway:log");
    log?.({ payload: null } as any);
    log?.({
      payload: {
        level: "nope",
        error_code: "GW_PORT_IN_USE",
        message: "x",
        requested_port: 1,
        bound_port: 2,
        base_url: "http://x",
      },
    } as any);

    const circuit = handlerFor("gateway:circuit");
    circuit?.({ payload: null } as any);
    circuit?.({
      payload: {
        trace_id: "t1",
        cli_key: "claude",
        provider_id: 1,
        provider_name: "P1",
        base_url: "https://p1",
        prev_state: "CLOSED",
        next_state: "OPEN",
        failure_count: 5,
        failure_threshold: 5,
        open_until: 123,
        cooldown_until: null,
        reason: "FAILURE_THRESHOLD_REACHED",
        ts: 0,
      },
    } as any);

    // Non-transition + dedup.
    circuit?.({
      payload: {
        trace_id: "t1",
        cli_key: "claude",
        provider_id: 1,
        provider_name: "P1",
        base_url: "https://p1",
        prev_state: "OPEN",
        next_state: "OPEN",
        failure_count: 5,
        failure_threshold: 5,
        open_until: 123,
        cooldown_until: null,
        reason: "SKIP_OPEN",
        ts: 0,
      },
    } as any);
    circuit?.({
      payload: {
        trace_id: "t1",
        cli_key: "claude",
        provider_id: 1,
        provider_name: "P1",
        base_url: "https://p1",
        prev_state: "OPEN",
        next_state: "OPEN",
        failure_count: 5,
        failure_threshold: 5,
        open_until: 123,
        cooldown_until: null,
        reason: "SKIP_OPEN",
        ts: 0,
      },
    } as any);

    unlisten();
    vi.useRealTimers();
  });
});
