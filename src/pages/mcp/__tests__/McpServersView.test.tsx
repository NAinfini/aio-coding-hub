import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { McpServersView } from "../McpServersView";
import {
  useMcpImportFromWorkspaceCliMutation,
  useMcpServerDeleteMutation,
  useMcpServerSetEnabledMutation,
  useMcpServersListQuery,
} from "../../../query/mcp";
import { createTestQueryClient } from "../../../test/utils/reactQuery";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../../services/consoleLog", () => ({ logToConsole: vi.fn() }));

vi.mock("../../../query/mcp", async () => {
  const actual = await vi.importActual<typeof import("../../../query/mcp")>("../../../query/mcp");
  return {
    ...actual,
    useMcpServersListQuery: vi.fn(),
    useMcpServerSetEnabledMutation: vi.fn(),
    useMcpServerDeleteMutation: vi.fn(),
    useMcpImportFromWorkspaceCliMutation: vi.fn(),
  };
});

function renderWithQuery(element: ReactElement) {
  const client = createTestQueryClient();
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

describe("pages/mcp/McpServersView", () => {
  it("renders empty state when there are no servers", () => {
    vi.mocked(useMcpServersListQuery).mockReturnValue({
      data: [],
      isFetching: false,
      error: null,
    } as any);
    vi.mocked(useMcpServerSetEnabledMutation).mockReturnValue({ isPending: false } as any);
    vi.mocked(useMcpServerDeleteMutation).mockReturnValue({ isPending: false } as any);
    vi.mocked(useMcpImportFromWorkspaceCliMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    renderWithQuery(<McpServersView workspaceId={1} />);
    expect(
      screen.getByText("暂无 MCP 服务。点击右上角「添加 MCP」创建第一条。")
    ).toBeInTheDocument();
  });

  it("toggles and deletes server entries via mutations", async () => {
    const server = {
      id: 1,
      server_key: "fetch",
      name: "Fetch Tool",
      transport: "http",
      url: "https://example.com/mcp",
      enabled: false,
      command: null,
      args: null,
      env: null,
      cwd: null,
      headers: null,
    } as any;

    vi.mocked(useMcpServersListQuery).mockReturnValue({
      data: [server],
      isFetching: false,
      error: null,
    } as any);

    const toggleMutation = { isPending: false, mutateAsync: vi.fn() };
    toggleMutation.mutateAsync.mockResolvedValue({ ...server, enabled: true });
    vi.mocked(useMcpServerSetEnabledMutation).mockReturnValue(toggleMutation as any);

    const deleteMutation = { isPending: false, mutateAsync: vi.fn() };
    deleteMutation.mutateAsync.mockResolvedValue(true);
    vi.mocked(useMcpServerDeleteMutation).mockReturnValue(deleteMutation as any);
    vi.mocked(useMcpImportFromWorkspaceCliMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    renderWithQuery(<McpServersView workspaceId={1} />);

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(toggleMutation.mutateAsync).toHaveBeenCalledWith({ serverId: 1, enabled: true })
    );

    fireEvent.click(screen.getByTitle("删除"));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deleteMutation.mutateAsync).toHaveBeenCalledWith(1));
  });

  it("imports from workspace CLI when clicking 导入已有", async () => {
    vi.mocked(useMcpServersListQuery).mockReturnValue({
      data: [],
      isFetching: false,
      error: null,
    } as any);
    vi.mocked(useMcpServerSetEnabledMutation).mockReturnValue({ isPending: false } as any);
    vi.mocked(useMcpServerDeleteMutation).mockReturnValue({ isPending: false } as any);

    const importMutation = { isPending: false, mutateAsync: vi.fn() };
    importMutation.mutateAsync.mockResolvedValue({ inserted: 1, updated: 0, skipped: [] });
    vi.mocked(useMcpImportFromWorkspaceCliMutation).mockReturnValue(importMutation as any);

    renderWithQuery(<McpServersView workspaceId={1} />);

    fireEvent.click(screen.getByRole("button", { name: "导入已有" }));
    await waitFor(() => expect(importMutation.mutateAsync).toHaveBeenCalled());
  });
});
