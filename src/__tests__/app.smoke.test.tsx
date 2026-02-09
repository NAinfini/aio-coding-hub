import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test/utils/reactQuery";
import App from "../App";

const { mockLogToConsole } = vi.hoisted(() => ({
  mockLogToConsole: vi.fn(),
}));

vi.mock("../services/consoleLog", async () => {
  const actual =
    await vi.importActual<typeof import("../services/consoleLog")>("../services/consoleLog");
  return {
    ...actual,
    logToConsole: mockLogToConsole,
  };
});

vi.mock("../services/gatewayEvents", () => ({
  listenGatewayEvents: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("../services/noticeEvents", () => ({
  listenNoticeEvents: vi.fn().mockResolvedValue(() => {}),
}));

import { listenGatewayEvents } from "../services/gatewayEvents";
import { listenNoticeEvents } from "../services/noticeEvents";

const DEFAULT_HASH = "#/";

function renderApp() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

async function renderRouteAndFindHeading(hash: string, headingName: string) {
  window.location.hash = hash;
  renderApp();
  return screen.findByRole("heading", { level: 1, name: headingName });
}

describe("App (smoke)", () => {
  beforeEach(() => {
    mockLogToConsole.mockReset();
    vi.mocked(listenGatewayEvents).mockResolvedValue(() => {});
    vi.mocked(listenNoticeEvents).mockResolvedValue(() => {});
  });

  afterEach(() => {
    window.location.hash = DEFAULT_HASH;
  });

  it("renders home route by default", async () => {
    expect(await renderRouteAndFindHeading("#/", "首页")).toBeInTheDocument();
  });

  it("renders settings route via hash", async () => {
    expect(await renderRouteAndFindHeading("#/settings", "设置")).toBeInTheDocument();
  });

  it("logs warning when event listeners initialization fails", async () => {
    vi.mocked(listenGatewayEvents).mockRejectedValueOnce(new Error("gateway init failed"));
    vi.mocked(listenNoticeEvents).mockRejectedValueOnce(new Error("notice init failed"));

    window.location.hash = "#/settings";
    renderApp();

    expect(await screen.findByRole("heading", { level: 1, name: "设置" })).toBeInTheDocument();

    await vi.waitFor(() => {
      expect(mockLogToConsole).toHaveBeenCalledWith(
        "warn",
        "网关事件监听初始化失败",
        expect.objectContaining({
          stage: "listenGatewayEvents",
          error: expect.stringContaining("gateway init failed"),
        })
      );
    });

    expect(mockLogToConsole).toHaveBeenCalledWith(
      "warn",
      "通知事件监听初始化失败",
      expect.objectContaining({
        stage: "listenNoticeEvents",
        error: expect.stringContaining("notice init failed"),
      })
    );
  });
});
