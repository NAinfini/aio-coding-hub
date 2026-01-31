// Usage: Manage installed/local skills for the active workspace of a CLI.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CLIS, cliFromKeyOrDefault, isCliKey } from "../constants/clis";
import { logToConsole } from "../services/consoleLog";
import type { CliKey } from "../services/providers";
import { workspacesList } from "../services/workspaces";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { TabList } from "../ui/TabList";
import { SkillsView } from "./skills/SkillsView";

function readCliFromStorage(): CliKey {
  try {
    const raw = localStorage.getItem("skills.activeCli");
    if (isCliKey(raw)) return raw;
  } catch {}
  return "claude";
}

function writeCliToStorage(cli: CliKey) {
  try {
    localStorage.setItem("skills.activeCli", cli);
  } catch {}
}

export function SkillsPage() {
  const navigate = useNavigate();
  const [activeCli, setActiveCli] = useState<CliKey>(() => readCliFromStorage());
  const currentCli = useMemo(() => cliFromKeyOrDefault(activeCli), [activeCli]);

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    writeCliToStorage(activeCli);
  }, [activeCli]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const workspaces = await workspacesList(activeCli);
        if (cancelled) return;
        setActiveWorkspaceId(workspaces?.active_id ?? null);
      } catch (err) {
        logToConsole("error", "加载工作区失败", { error: String(err), cli: activeCli });
        toast("加载失败：请查看控制台日志");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCli]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skill"
        actions={
          <>
            <Button onClick={() => navigate("/skills/market")} variant="primary">
              Skill 市场
            </Button>
            <TabList
              ariaLabel="CLI 选择"
              items={CLIS.map((cli) => ({ key: cli.key, label: cli.name }))}
              value={activeCli}
              onChange={setActiveCli}
            />
          </>
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
          未找到 {currentCli.name} 的当前工作区（workspace）。请先在 Workspaces 页面创建并设为当前。
        </div>
      ) : (
        <SkillsView workspaceId={activeWorkspaceId} cliKey={activeCli} isActiveWorkspace />
      )}
    </div>
  );
}
