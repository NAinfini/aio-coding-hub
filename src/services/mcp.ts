import { invokeTauriOrNull } from "./tauriInvoke";

export type McpTransport = "stdio" | "http";

export type McpServerSummary = {
  id: number;
  server_key: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  cwd: string | null;
  url: string | null;
  headers: Record<string, string>;
  enabled: boolean;
  created_at: number;
  updated_at: number;
};

export type McpImportServer = {
  server_key: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  cwd: string | null;
  url: string | null;
  headers: Record<string, string>;
  enabled: boolean;
};

export type McpParseResult = {
  servers: McpImportServer[];
};

export type McpImportReport = {
  inserted: number;
  updated: number;
  skipped?: Array<{
    name: string;
    reason: string;
  }>;
};

export async function mcpServersList(workspaceId: number) {
  return invokeTauriOrNull<McpServerSummary[]>("mcp_servers_list", { workspaceId });
}

export async function mcpServerUpsert(input: {
  server_id?: number | null;
  server_key: string;
  name: string;
  transport: McpTransport;
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string | null;
  url?: string | null;
  headers?: Record<string, string>;
}) {
  return invokeTauriOrNull<McpServerSummary>("mcp_server_upsert", {
    serverId: input.server_id ?? null,
    serverKey: input.server_key,
    name: input.name,
    transport: input.transport,
    command: input.command ?? null,
    args: input.args ?? [],
    env: input.env ?? {},
    cwd: input.cwd ?? null,
    url: input.url ?? null,
    headers: input.headers ?? {},
  });
}

export async function mcpServerSetEnabled(input: {
  workspace_id: number;
  server_id: number;
  enabled: boolean;
}) {
  return invokeTauriOrNull<McpServerSummary>("mcp_server_set_enabled", {
    workspaceId: input.workspace_id,
    serverId: input.server_id,
    enabled: input.enabled,
  });
}

export async function mcpServerDelete(serverId: number) {
  return invokeTauriOrNull<boolean>("mcp_server_delete", { serverId });
}

export async function mcpParseJson(jsonText: string) {
  return invokeTauriOrNull<McpParseResult>("mcp_parse_json", { jsonText });
}

export async function mcpImportServers(input: {
  workspace_id: number;
  servers: McpImportServer[];
}) {
  return invokeTauriOrNull<McpImportReport>("mcp_import_servers", {
    workspaceId: input.workspace_id,
    servers: input.servers,
  });
}

export async function mcpImportFromWorkspaceCli(workspace_id: number) {
  return invokeTauriOrNull<McpImportReport>("mcp_import_from_workspace_cli", {
    workspaceId: workspace_id,
  });
}
