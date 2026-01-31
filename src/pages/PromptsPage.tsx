// Usage: Manage prompt templates for the active workspace of a CLI.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CLIS, cliLongLabel } from "../constants/clis";
import { logToConsole } from "../services/consoleLog";
import type { CliKey } from "../services/providers";
import { startupSyncDefaultPromptsFromFilesOncePerSession } from "../services/startup";
import { workspacesList } from "../services/workspaces";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { TabList } from "../ui/TabList";
import { PromptsView } from "./prompts/PromptsView";

export function PromptsPage() {
  const navigate = useNavigate();
  const [activeCli, setActiveCli] = useState<CliKey>("claude");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const cliLabel = useMemo(() => cliLongLabel(activeCli), [activeCli]);

  async function refresh(cliKey: CliKey) {
    setLoading(true);
    try {
      const workspaces = await workspacesList(cliKey);
      if (!workspaces) {
        setActiveWorkspaceId(null);
        return;
      }
      setActiveWorkspaceId(workspaces.active_id);
    } catch (err) {
      logToConsole("error", "加载工作区失败", { error: String(err), cli: cliKey });
      toast("加载失败：请查看控制台日志");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await startupSyncDefaultPromptsFromFilesOncePerSession();
      if (cancelled) return;
      await refresh(activeCli);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCli]);

  return (
    <div className="space-y-6">
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
      ) : !activeWorkspaceId ? (
        <div className="text-sm text-slate-600">
          未找到 {cliLabel} 的当前工作区（workspace）。请先在 Workspaces 页面创建并设为当前。
        </div>
      ) : (
        <PromptsView workspaceId={activeWorkspaceId} cliKey={activeCli} isActiveWorkspace />
      )}
    </div>
  );
}
