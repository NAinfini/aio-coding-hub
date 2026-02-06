import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { McpServerDialog } from "../McpServerDialog";
import { useMcpServerUpsertMutation } from "../../../../query/mcp";
import { mcpParseJson } from "../../../../services/mcp";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../../../services/consoleLog", () => ({ logToConsole: vi.fn() }));

vi.mock("../../../../query/mcp", async () => {
  const actual =
    await vi.importActual<typeof import("../../../../query/mcp")>("../../../../query/mcp");
  return { ...actual, useMcpServerUpsertMutation: vi.fn() };
});

vi.mock("../../../../services/mcp", async () => {
  const actual = await vi.importActual<typeof import("../../../../services/mcp")>(
    "../../../../services/mcp"
  );
  return { ...actual, mcpParseJson: vi.fn() };
});

describe("pages/mcp/components/McpServerDialog", () => {
  it("validates env and can save stdio servers", async () => {
    const mutateAsync = vi.fn();
    vi.mocked(useMcpServerUpsertMutation).mockReturnValue({ isPending: false, mutateAsync } as any);

    const onOpenChange = vi.fn();

    render(
      <McpServerDialog workspaceId={1} open={true} editTarget={null} onOpenChange={onOpenChange} />
    );

    fireEvent.change(screen.getByPlaceholderText("例如：Fetch 工具"), {
      target: { value: "Fetch Tool" },
    });
    fireEvent.change(screen.getByPlaceholderText("例如：npx"), { target: { value: "node" } });

    // Invalid env: should fail before hitting mutation.
    fireEvent.change(screen.getByPlaceholderText(/FOO=bar/), { target: { value: "BADLINE" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());

    // Valid env: mutation runs but returns null => "Tauri only" path.
    mutateAsync.mockResolvedValueOnce(null);
    fireEvent.change(screen.getByPlaceholderText(/FOO=bar/), { target: { value: "FOO=bar" } });
    fireEvent.change(screen.getByPlaceholderText(/-y/), { target: { value: "-y\n@foo/bar" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: null,
          name: "Fetch Tool",
          transport: "stdio",
          command: "node",
          args: ["-y", "@foo/bar"],
          env: { FOO: "bar" },
        })
      )
    );

    mutateAsync.mockResolvedValueOnce({ id: 1, server_key: "fetch", transport: "stdio" });
    fireEvent.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("prefills and saves http servers with headers parsing", async () => {
    const mutateAsync = vi.fn();
    vi.mocked(useMcpServerUpsertMutation).mockReturnValue({ isPending: false, mutateAsync } as any);

    const onOpenChange = vi.fn();

    render(
      <McpServerDialog
        workspaceId={1}
        open={true}
        editTarget={
          {
            id: 7,
            server_key: "remote",
            name: "Remote",
            transport: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer x" },
            enabled: true,
          } as any
        }
        onOpenChange={onOpenChange}
      />
    );

    expect(screen.getByDisplayValue("Remote")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.com/mcp")).toBeInTheDocument();

    // Invalid headers should block mutation.
    fireEvent.change(screen.getByPlaceholderText(/Authorization=Bearer/), {
      target: { value: "BAD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());

    mutateAsync.mockResolvedValueOnce({ id: 7, server_key: "remote", transport: "http" });
    fireEvent.change(screen.getByPlaceholderText(/Authorization=Bearer/), {
      target: { value: "Authorization=Bearer y" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: 7,
          transport: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer y" },
        })
      )
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("fills fields from JSON in create mode", async () => {
    const mutateAsync = vi.fn();
    vi.mocked(useMcpServerUpsertMutation).mockReturnValue({ isPending: false, mutateAsync } as any);

    vi.mocked(mcpParseJson).mockResolvedValue({
      servers: [
        {
          server_key: "fetch",
          name: "Fetch",
          transport: "stdio",
          command: "uvx",
          args: ["mcp-server-fetch"],
          env: { FOO: "bar" },
          cwd: null,
          url: null,
          headers: {},
          enabled: true,
        },
      ],
    } as any);

    render(
      <McpServerDialog workspaceId={1} open={true} editTarget={null} onOpenChange={vi.fn()} />
    );

    fireEvent.change(screen.getByPlaceholderText(/示例：\{"type":"stdio"/), {
      target: { value: '{"type":"stdio","command":"uvx","args":["mcp-server-fetch"]}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "从 JSON 填充" }));

    await waitFor(() => expect(screen.getByDisplayValue("uvx")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "保存并同步" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Fetch",
          transport: "stdio",
          command: "uvx",
          args: ["mcp-server-fetch"],
          env: { FOO: "bar" },
        })
      )
    );
  });
});
