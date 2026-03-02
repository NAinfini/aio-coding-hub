import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/frontendErrorReporter", async () => {
  const actual = await vi.importActual<typeof import("../services/frontendErrorReporter")>(
    "../services/frontendErrorReporter"
  );
  return {
    ...actual,
    installGlobalErrorReporting: vi.fn(),
  };
});

describe("main entry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders without crashing", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import("../main");

    // React 19 createRoot render is async-ish; assert content eventually appears.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById("root")?.innerHTML).toBeTruthy();
  });

  it("registers global frontend error handlers", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    const reporter = await import("../services/frontendErrorReporter");
    await import("../main");

    expect(reporter.installGlobalErrorReporting).toHaveBeenCalled();
  });
});
