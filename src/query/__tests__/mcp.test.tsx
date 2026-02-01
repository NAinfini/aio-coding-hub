import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { McpServerSummary } from "../../services/mcp";
import {
  mcpServerDelete,
  mcpServerSetEnabled,
  mcpServerUpsert,
  mcpServersList,
} from "../../services/mcp";
import { createQueryWrapper, createTestQueryClient } from "../../test/utils/reactQuery";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import { mcpKeys } from "../keys";
import {
  useMcpServerDeleteMutation,
  useMcpServerSetEnabledMutation,
  useMcpServerUpsertMutation,
  useMcpServersListQuery,
} from "../mcp";

vi.mock("../../services/mcp", async () => {
  const actual = await vi.importActual<typeof import("../../services/mcp")>("../../services/mcp");
  return {
    ...actual,
    mcpServersList: vi.fn(),
    mcpServerUpsert: vi.fn(),
    mcpServerSetEnabled: vi.fn(),
    mcpServerDelete: vi.fn(),
  };
});

describe("query/mcp", () => {
  it("does not call mcpServersList without tauri runtime", async () => {
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useMcpServersListQuery(1), { wrapper });
    await Promise.resolve();

    expect(mcpServersList).not.toHaveBeenCalled();
  });

  it("calls mcpServersList with tauri runtime", async () => {
    setTauriRuntime();
    vi.mocked(mcpServersList).mockResolvedValue([]);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useMcpServersListQuery(1), { wrapper });

    await waitFor(() => {
      expect(mcpServersList).toHaveBeenCalledWith(1);
    });
  });

  it("useMcpServerUpsertMutation inserts into cached list", async () => {
    setTauriRuntime();

    const created: McpServerSummary = {
      id: 1,
      server_key: "s1",
      name: "S1",
      transport: "stdio",
      command: "node",
      args: [],
      env: {},
      cwd: null,
      url: null,
      headers: {},
      enabled: true,
      created_at: 0,
      updated_at: 0,
    };

    vi.mocked(mcpServerUpsert).mockResolvedValue(created);

    const client = createTestQueryClient();
    client.setQueryData(mcpKeys.serversList(1), []);
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useMcpServerUpsertMutation(1), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        serverId: null,
        serverKey: created.server_key,
        name: created.name,
        transport: created.transport,
        command: created.command,
        args: created.args,
        env: created.env,
        cwd: created.cwd,
        url: created.url,
        headers: created.headers,
      });
    });

    expect(client.getQueryData(mcpKeys.serversList(1))).toEqual([created]);
  });

  it("useMcpServerSetEnabledMutation updates cached list row", async () => {
    setTauriRuntime();

    const prev: McpServerSummary = {
      id: 1,
      server_key: "s1",
      name: "S1",
      transport: "stdio",
      command: "node",
      args: [],
      env: {},
      cwd: null,
      url: null,
      headers: {},
      enabled: true,
      created_at: 0,
      updated_at: 0,
    };
    const updated = { ...prev, enabled: false };

    vi.mocked(mcpServerSetEnabled).mockResolvedValue(updated);

    const client = createTestQueryClient();
    client.setQueryData(mcpKeys.serversList(1), [prev]);
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useMcpServerSetEnabledMutation(1), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ serverId: 1, enabled: false });
    });

    expect(client.getQueryData(mcpKeys.serversList(1))).toEqual([updated]);
  });

  it("useMcpServerDeleteMutation removes row from cached list", async () => {
    setTauriRuntime();

    vi.mocked(mcpServerDelete).mockResolvedValue(true);

    const rows: McpServerSummary[] = [
      {
        id: 1,
        server_key: "s1",
        name: "S1",
        transport: "stdio",
        command: "node",
        args: [],
        env: {},
        cwd: null,
        url: null,
        headers: {},
        enabled: true,
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 2,
        server_key: "s2",
        name: "S2",
        transport: "http",
        command: null,
        args: [],
        env: {},
        cwd: null,
        url: "http://localhost",
        headers: {},
        enabled: true,
        created_at: 0,
        updated_at: 0,
      },
    ];

    const client = createTestQueryClient();
    client.setQueryData(mcpKeys.serversList(1), rows);
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useMcpServerDeleteMutation(1), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(client.getQueryData(mcpKeys.serversList(1))).toEqual([rows[1]]);
  });
});
