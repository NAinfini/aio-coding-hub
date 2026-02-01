import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriInvoke } from "../../test/mocks/tauri";
import { clearTauriRuntime, setTauriRuntime } from "../../test/utils/tauriRuntime";

describe("services/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when tauri runtime is missing", async () => {
    clearTauriRuntime();
    vi.resetModules();

    const { mcpServerDelete, mcpParseJson, mcpImportServers } = await import("../mcp");

    expect(await mcpServerDelete(1)).toBeNull();
    expect(await mcpParseJson("{}")).toBeNull();
    expect(await mcpImportServers({ workspace_id: 1, servers: [] })).toBeNull();

    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("invokes tauri commands with normalized args", async () => {
    setTauriRuntime();
    vi.resetModules();
    vi.mocked(tauriInvoke).mockResolvedValue(null as any);

    const {
      mcpServersList,
      mcpServerUpsert,
      mcpServerSetEnabled,
      mcpServerDelete,
      mcpParseJson,
      mcpImportServers,
    } = await import("../mcp");

    await mcpServersList(7);
    expect(tauriInvoke).toHaveBeenCalledWith("mcp_servers_list", { workspaceId: 7 });

    await mcpServerUpsert({
      server_key: "fetch",
      name: "Fetch",
      transport: "stdio",
    });
    expect(tauriInvoke).toHaveBeenCalledWith("mcp_server_upsert", {
      serverId: null,
      serverKey: "fetch",
      name: "Fetch",
      transport: "stdio",
      command: null,
      args: [],
      env: {},
      cwd: null,
      url: null,
      headers: {},
    });

    await mcpServerSetEnabled({ workspace_id: 9, server_id: 2, enabled: false });
    expect(tauriInvoke).toHaveBeenCalledWith("mcp_server_set_enabled", {
      workspaceId: 9,
      serverId: 2,
      enabled: false,
    });

    await mcpServerDelete(123);
    expect(tauriInvoke).toHaveBeenCalledWith("mcp_server_delete", { serverId: 123 });

    await mcpParseJson('{"mcpServers":[]}');
    expect(tauriInvoke).toHaveBeenCalledWith("mcp_parse_json", { jsonText: '{"mcpServers":[]}' });

    await mcpImportServers({
      workspace_id: 1,
      servers: [
        {
          server_key: "fetch",
          name: "Fetch",
          transport: "http",
          command: null,
          args: [],
          env: {},
          cwd: null,
          url: "http://127.0.0.1:3000",
          headers: { Authorization: "x" },
          enabled: true,
        },
      ],
    });
    expect(tauriInvoke).toHaveBeenCalledWith("mcp_import_servers", {
      workspaceId: 1,
      servers: [
        expect.objectContaining({
          server_key: "fetch",
          transport: "http",
          url: "http://127.0.0.1:3000",
        }),
      ],
    });
  });
});
