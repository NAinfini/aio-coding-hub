import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

async function importFreshConsoleLog() {
  vi.resetModules();
  return await import("../consoleLog");
}

describe("services/consoleLog", () => {
  it("setConsoleLogMinLevel + shouldLogToConsole", async () => {
    const { setConsoleLogMinLevel, shouldLogToConsole, getConsoleDebugEnabled } =
      await importFreshConsoleLog();

    setConsoleLogMinLevel("info");
    expect(shouldLogToConsole("debug")).toBe(false);
    expect(shouldLogToConsole("info")).toBe(true);
    expect(getConsoleDebugEnabled()).toBe(false);

    setConsoleLogMinLevel("debug");
    expect(shouldLogToConsole("debug")).toBe(true);
    expect(getConsoleDebugEnabled()).toBe(true);
  });

  it("logToConsole redacts sensitive keys and extracts meta", async () => {
    const { clearConsoleLogs, logToConsole, setConsoleLogMinLevel, useConsoleLogs } =
      await importFreshConsoleLog();

    clearConsoleLogs();
    setConsoleLogMinLevel("debug");

    const { result } = renderHook(() => useConsoleLogs());
    expect(result.current).toEqual([]);

    act(() => {
      logToConsole("info", "hello", {
        trace_id: "t-1",
        cli_key: "claude",
        api_key: "SECRET",
        base_url: "https://example.com/private",
        attempts: [{ provider_name: "P1" }, { providerName: "P2" }, { provider_name: "P1" }],
      });
    });

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    });

    const entry = result.current[0];
    expect(entry.title).toBe("hello");
    expect(entry.details).toEqual(
      expect.objectContaining({
        trace_id: "t-1",
        cli_key: "claude",
        api_key: "[REDACTED]",
        base_url: "[REDACTED]",
      })
    );
    expect(entry.meta).toEqual(
      expect.objectContaining({
        trace_id: "t-1",
        cli_key: "claude",
        providers: expect.arrayContaining(["P1", "P2"]),
      })
    );
  });
});
