// Usage: Manage MCP servers for the active workspace of a CLI (renders sub-view under `src/pages/mcp/*`).

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../ui/PageHeader";
import { TabList } from "../ui/TabList";
import { CLIS, cliLongLabel } from "../constants/clis";
import type { CliKey } from "../services/providers";
import { Button } from "../ui/Button";
import { McpServersView } from "./mcp/McpServersView";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { useWorkspacesListQuery } from "../query/workspaces";

export function McpPage() {
  const navigate = useNavigate();
  const [activeCli, setActiveCli] = useState<CliKey>("claude");
  const tauriRuntime = hasTauriRuntime();

  const workspacesQuery = useWorkspacesListQuery(activeCli);
  const activeWorkspaceId = workspacesQuery.data?.active_id ?? null;
  const loading = workspacesQuery.isFetching;

  const cliLabel = useMemo(() => cliLongLabel(activeCli), [activeCli]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="MCP"
        actions={
          <TabList
            ariaLabel="目标 CLI"
            items={CLIS.map((cli) => ({ key: cli.key, label: cli.name }))}
            value={activeCli}
            onChange={setActiveCli}
          />
        }
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>这是高级入口：默认操作当前 workspace。推荐在「Workspaces」配置中心统一管理。</div>
          <Button variant="secondary" onClick={() => navigate("/workspaces")}>
            打开 Workspaces
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-600">加载中…</div>
      ) : !tauriRuntime ? (
        <div className="text-sm text-slate-600">仅在 Tauri Desktop 环境可用</div>
      ) : !activeWorkspaceId ? (
        <div className="text-sm text-slate-600">
          未找到 {cliLabel} 的当前工作区（workspace）。请先在 Workspaces 页面创建并设为当前。
        </div>
      ) : (
        <McpServersView workspaceId={activeWorkspaceId} />
      )}
    </div>
  );
}
