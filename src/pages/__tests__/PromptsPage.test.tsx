import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { PromptsPage } from "../PromptsPage";
import { createTestQueryClient } from "../../test/utils/reactQuery";
import { clearTauriRuntime, setTauriRuntime } from "../../test/utils/tauriRuntime";
import { logToConsole } from "../../services/consoleLog";
import { useWorkspacesListQuery } from "../../query/workspaces";

vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  });
  return { toast };
});

vi.mock("../../services/consoleLog", async () => {
  const actual = await vi.importActual<typeof import("../../services/consoleLog")>(
    "../../services/consoleLog"
  );
  return { ...actual, logToConsole: vi.fn() };
});

vi.mock("../prompts/PromptsView", () => ({
  PromptsView: () => <div data-testid="prompts-view" />,
}));

vi.mock("../../query/workspaces", async () => {
  const actual =
    await vi.importActual<typeof import("../../query/workspaces")>("../../query/workspaces");
  return { ...actual, useWorkspacesListQuery: vi.fn() };
});

function renderWithProviders(element: ReactElement) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("pages/PromptsPage", () => {
  it("shows tauri runtime hint when not running in desktop runtime", () => {
    clearTauriRuntime();

    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: null,
      isFetching: false,
      error: null,
    } as any);

    renderWithProviders(<PromptsPage />);
    expect(screen.getByText("仅在 Tauri Desktop 环境可用")).toBeInTheDocument();
  });

  it("shows missing workspace hint when active workspace is null", () => {
    setTauriRuntime();

    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: null, items: [] },
      isFetching: false,
      error: null,
    } as any);

    renderWithProviders(<PromptsPage />);
    expect(screen.getByText(/未找到 Claude Code 的当前工作区/)).toBeInTheDocument();
  });

  it("logs and toasts when workspaces query errors", async () => {
    setTauriRuntime();

    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: null, items: [] },
      isFetching: false,
      error: new Error("boom"),
    } as any);

    renderWithProviders(<PromptsPage />);

    await waitFor(() => {
      expect(logToConsole).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith("加载失败：请查看控制台日志");
    });
  });
});
