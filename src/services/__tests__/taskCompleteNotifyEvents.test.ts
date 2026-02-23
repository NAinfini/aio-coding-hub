import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTauriEventListeners, emitTauriEvent } from "../../test/mocks/tauri";
import { clearTauriRuntime, setTauriRuntime } from "../../test/utils/tauriRuntime";

vi.mock("../notice", () => ({ noticeSend: vi.fn() }));

async function importFreshTaskCompleteNotify() {
  vi.resetModules();
  const mod = await import("../taskCompleteNotifyEvents");
  const notice = await import("../notice");
  return { mod, noticeSend: vi.mocked(notice.noticeSend) };
}

function requestStart(cliKey: string, model?: string | null) {
  return {
    trace_id: "t-1",
    cli_key: cliKey,
    method: "POST",
    path: "/v1/messages",
    query: null,
    requested_model: model,
    ts: 0,
  } as any;
}

function requestEvent(cliKey: string) {
  return {
    trace_id: "t-1",
    cli_key: cliKey,
  } as any;
}

describe("services/taskCompleteNotifyEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTauriEventListeners();
    clearTauriRuntime();
  });

  it("defaults enabled and notifies subscribers", async () => {
    vi.useFakeTimers();

    const { mod } = await importFreshTaskCompleteNotify();

    expect(mod.getTaskCompleteNotifyEnabled()).toBe(true);

    const { result } = renderHook(() => mod.useTaskCompleteNotifyEnabled());
    expect(result.current).toBe(true);

    act(() => mod.setTaskCompleteNotifyEnabled(false));
    expect(result.current).toBe(false);

    act(() => mod.setTaskCompleteNotifyEnabled(true));
    expect(result.current).toBe(true);

    vi.useRealTimers();
  });

  it("sends notification after quiet period when enabled", async () => {
    setTauriRuntime();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const { mod, noticeSend } = await importFreshTaskCompleteNotify();
    noticeSend.mockResolvedValue(true);

    const cleanup = await mod.listenTaskCompleteNotifyEvents();

    emitTauriEvent("gateway:request_start", requestStart("claude", "claude-3-5-sonnet"));
    emitTauriEvent("gateway:request", requestEvent("claude"));

    await vi.advanceTimersByTimeAsync(30_000);

    expect(noticeSend).toHaveBeenCalledTimes(1);
    expect(noticeSend).toHaveBeenCalledWith({
      level: "info",
      title: "任务完成",
      body: expect.stringContaining("Claude 请求已完成"),
    });

    cleanup();
    vi.useRealTimers();
  });

  it("does not notify when disabled", async () => {
    setTauriRuntime();
    vi.useFakeTimers();

    const { mod, noticeSend } = await importFreshTaskCompleteNotify();
    noticeSend.mockResolvedValue(true);

    const cleanup = await mod.listenTaskCompleteNotifyEvents();

    mod.setTaskCompleteNotifyEnabled(false);

    emitTauriEvent("gateway:request_start", requestStart("claude", "claude-3-5-sonnet"));
    emitTauriEvent("gateway:request", requestEvent("claude"));

    await vi.advanceTimersByTimeAsync(30_000);

    expect(noticeSend).not.toHaveBeenCalled();

    cleanup();
    vi.useRealTimers();
  });

  it("avoids false positives for overlapping requests and only notifies when idle", async () => {
    setTauriRuntime();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const { mod, noticeSend } = await importFreshTaskCompleteNotify();
    noticeSend.mockResolvedValue(true);

    const cleanup = await mod.listenTaskCompleteNotifyEvents();

    // Two overlapping requests: should NOT notify after first completion.
    emitTauriEvent("gateway:request_start", requestStart("claude", "claude-3-5-sonnet"));
    emitTauriEvent("gateway:request_start", requestStart("claude", "claude-3-5-sonnet"));
    emitTauriEvent("gateway:request", requestEvent("claude"));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(noticeSend).not.toHaveBeenCalled();

    // Finish the second request; after quiet period, it should notify once.
    emitTauriEvent("gateway:request", requestEvent("claude"));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(noticeSend).toHaveBeenCalledTimes(1);

    cleanup();
    vi.useRealTimers();
  });

  it("uses longer quiet period for codex to avoid mid-task idle gaps", async () => {
    setTauriRuntime();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const { mod, noticeSend } = await importFreshTaskCompleteNotify();
    noticeSend.mockResolvedValue(true);

    const cleanup = await mod.listenTaskCompleteNotifyEvents();

    emitTauriEvent("gateway:request_start", requestStart("codex", "gpt-4.1"));
    emitTauriEvent("gateway:request", requestEvent("codex"));

    // Codex quiet period is 120s, so 30s should not trigger.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(noticeSend).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(90_000);
    expect(noticeSend).toHaveBeenCalledTimes(1);

    cleanup();
    vi.useRealTimers();
  });
});
