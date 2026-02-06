import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeCalls: unknown[][] = [];
const logToConsoleCalls: unknown[][] = [];

vi.mock("../tauriInvoke", () => ({
  invokeTauriOrNull: ((...args: unknown[]) => {
    invokeCalls.push(args);
    return Promise.resolve(true);
  }) as typeof import("../tauriInvoke").invokeTauriOrNull,
}));

vi.mock("../consoleLog", () => ({
  logToConsole: ((...args: unknown[]) => {
    logToConsoleCalls.push(args);
  }) as typeof import("../consoleLog").logToConsole,
}));

describe("services/frontendErrorReporter", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeCalls.length = 0;
    logToConsoleCalls.length = 0;

    delete (window as any).location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "http://localhost/#/",
      },
    });

    delete (window as any).navigator;
    Object.defineProperty(window, "navigator", {
      configurable: true,
      value: {
        userAgent: "test-agent",
      },
    });
  });

  it("installs global handlers and reports window error once in dedup window", async () => {
    const mod = await import("../frontendErrorReporter");
    mod.__testResetFrontendErrorReporterState();

    mod.installGlobalErrorReporting();
    mod.installGlobalErrorReporting();

    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logToConsoleCalls).toHaveLength(1);
    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0]).toEqual([
      "app_frontend_error_report",
      expect.objectContaining({
        source: "error",
        message: "boom",
      }),
      { timeoutMs: 3_000 },
    ]);
  });

  it("reports render errors", async () => {
    const mod = await import("../frontendErrorReporter");
    mod.__testResetFrontendErrorReporterState();

    mod.reportRenderError(new Error("render failed"), { componentStack: "at Test" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(invokeCalls).toHaveLength(1);
    expect(invokeCalls[0]).toEqual([
      "app_frontend_error_report",
      expect.objectContaining({
        source: "render",
        message: "render failed",
      }),
      { timeoutMs: 3_000 },
    ]);
  });
});
