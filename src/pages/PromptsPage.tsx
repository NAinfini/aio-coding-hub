// Usage: Manage prompt templates for the active workspace of a CLI.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CLIS, cliLongLabel } from "../constants/clis";
import { logToConsole } from "../services/consoleLog";
import type { CliKey } from "../services/providers";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { TabList } from "../ui/TabList";
import { PromptsView } from "./prompts/PromptsView";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { useWorkspacesListQuery } from "../query/workspaces";

export function PromptsPage() {
  const navigate = useNavigate();
  const [activeCli, setActiveCli] = useState<CliKey>("claude");
  const tauriRuntime = hasTauriRuntime();

  const workspacesQuery = useWorkspacesListQuery(activeCli);
  const activeWorkspaceId = workspacesQuery.data?.active_id ?? null;
  const loading = workspacesQuery.isFetching;

  const cliLabel = useMemo(() => cliLongLabel(activeCli), [activeCli]);

  useEffect(() => {
    if (!workspacesQuery.error) return;
    logToConsole("error", "加载工作区失败", {
      error: String(workspacesQuery.error),
      cli: activeCli,
    });
    toast("加载失败：请查看控制台日志");
  }, [activeCli, workspacesQuery.error]);

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      <PageHeader
        title="提示词"
        actions={
          <TabList
            ariaLabel="目标 CLI"
            items={CLIS.map((cli) => ({ key: cli.key, label: cli.name }))}
            value={activeCli}
            onChange={setActiveCli}
          />
        }
      />

      <div className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>这是高级入口：默认操作当前 workspace。推荐在「Workspaces」配置中心统一管理。</div>
          <Button variant="secondary" onClick={() => navigate("/workspaces")}>
            打开 Workspaces
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay">
        {loading ? (
          <div className="text-sm text-slate-600 dark:text-slate-400">加载中…</div>
        ) : !tauriRuntime ? (
          <div className="text-sm text-slate-600 dark:text-slate-400">
            仅在 Tauri Desktop 环境可用
          </div>
        ) : !activeWorkspaceId ? (
          <div className="text-sm text-slate-600 dark:text-slate-400">
            未找到 {cliLabel} 的当前工作区（workspace）。请先在 Workspaces 页面创建并设为当前。
          </div>
        ) : (
          <PromptsView workspaceId={activeWorkspaceId} cliKey={activeCli} isActiveWorkspace />
        )}
      </div>
    </div>
  );
}
