// Usage: Workspaces configuration center (profiles). All edits are scoped to selected workspace; only active workspace triggers real sync.

import { Eye, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CLIS, cliLongLabel } from "../constants/clis";
import { logToConsole } from "../services/consoleLog";
import { mcpServersList } from "../services/mcp";
import type { CliKey } from "../services/providers";
import { promptsList } from "../services/prompts";
import { skillsInstalledList } from "../services/skills";
import {
  workspaceApply,
  workspaceCreate,
  workspaceDelete,
  workspacePreview,
  workspaceRename,
  workspacesList,
  type WorkspaceApplyReport,
  type WorkspacePreview,
  type WorkspaceSummary,
} from "../services/workspaces";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Dialog } from "../ui/Dialog";
import { FormField } from "../ui/FormField";
import { Input } from "../ui/Input";
import { PageHeader } from "../ui/PageHeader";
import { TabList } from "../ui/TabList";
import { cn } from "../utils/cn";
import { McpServersView } from "./mcp/McpServersView";
import { PromptsView } from "./prompts/PromptsView";
import { SkillsView } from "./skills/SkillsView";

type RightTab = "overview" | "prompts" | "mcp" | "skills" | "preview_apply";

type OverviewStats = {
  prompts: { total: number; enabled: number };
  mcp: { total: number; enabled: number };
  skills: { total: number; enabled: number };
};

const CLI_TABS: Array<{ key: CliKey; label: string }> = CLIS.map((cli) => ({
  key: cli.key,
  label: cli.name,
}));

const RIGHT_TABS: Array<{ key: RightTab; label: string }> = [
  { key: "overview", label: "概览" },
  { key: "prompts", label: "Prompts" },
  { key: "mcp", label: "MCP" },
  { key: "skills", label: "Skills" },
  { key: "preview_apply", label: "预览&应用" },
];

function normalizeWorkspaceName(raw: string) {
  return raw.trim();
}

function isDuplicateWorkspaceName(
  items: WorkspaceSummary[],
  name: string,
  ignoreId?: number | null
) {
  const normalized = normalizeWorkspaceName(name).toLowerCase();
  if (!normalized) return false;
  return items.some((w) => {
    if (ignoreId && w.id === ignoreId) return false;
    return normalizeWorkspaceName(w.name).toLowerCase() === normalized;
  });
}

function formatUnixSeconds(ts: number) {
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return String(ts);
  }
}

function workspaceRootHint(cli: CliKey, workspaceId: number) {
  return `~/.aio-coding-hub/workspaces/${cli}/${workspaceId}`;
}

function promptFileHint(cliKey: CliKey) {
  if (cliKey === "claude") return "~/.claude/CLAUDE.md";
  if (cliKey === "codex") return "~/.codex/AGENTS.md";
  if (cliKey === "gemini") return "~/.gemini/GEMINI.md";
  return "~";
}

function mcpConfigHint(cliKey: CliKey) {
  if (cliKey === "claude") return "~/.claude.json";
  if (cliKey === "codex") return "~/.codex/config.toml";
  if (cliKey === "gemini") return "~/.gemini/settings.json";
  return "~";
}

function skillsDirHint(cliKey: CliKey) {
  if (cliKey === "claude") return "~/.claude/skills";
  if (cliKey === "codex") return "~/.codex/skills";
  if (cliKey === "gemini") return "~/.gemini/skills";
  return "~";
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "active";
}) {
  const toneClass =
    tone === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-600";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass
      )}
    >
      {children}
    </span>
  );
}

type CreateMode = "clone_active" | "blank";

export function WorkspacesPage() {
  const [activeCli, setActiveCli] = useState<CliKey>("claude");
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [filterText, setFilterText] = useState("");
  const [rightTab, setRightTab] = useState<RightTab>("overview");

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState<CreateMode>("clone_active");

  const [renameTargetId, setRenameTargetId] = useState<number | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");

  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<WorkspacePreview | null>(null);
  const [applyReport, setApplyReport] = useState<WorkspaceApplyReport | null>(null);

  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyConfirm, setApplyConfirm] = useState("");
  const [applying, setApplying] = useState(false);

  async function refresh(cliKey: CliKey) {
    setLoading(true);
    try {
      const result = await workspacesList(cliKey);
      if (!result) {
        setItems([]);
        setActiveWorkspaceId(null);
        setSelectedWorkspaceId(null);
        return;
      }

      setItems(result.items);
      setActiveWorkspaceId(result.active_id);

      setSelectedWorkspaceId((prev) => {
        const stillExists = prev != null && result.items.some((w) => w.id === prev);
        if (stillExists) return prev;
        if (result.active_id != null) return result.active_id;
        return result.items[0]?.id ?? null;
      });
    } catch (err) {
      logToConsole("error", "加载工作区失败", { error: String(err), cli: cliKey });
      toast("加载失败：请查看控制台日志");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(activeCli);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCli]);

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((w) => {
      const hay = `${w.name} ${workspaceRootHint(w.cli_key, w.id)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filterText, items]);

  const selectedWorkspace = useMemo(() => {
    const byId = new Map(items.map((w) => [w.id, w]));
    return (selectedWorkspaceId != null ? byId.get(selectedWorkspaceId) : null) ?? null;
  }, [items, selectedWorkspaceId]);

  const workspaceById = useMemo(() => new Map(items.map((w) => [w.id, w])), [items]);

  useEffect(() => {
    if (!filterText.trim()) return;
    if (!selectedWorkspace) return;
    if (filtered.some((w) => w.id === selectedWorkspace.id)) return;
    if (filtered.length === 0) return;
    setSelectedWorkspaceId(filtered[0].id);
  }, [filterText, filtered, selectedWorkspace]);

  async function refreshOverview(workspaceId: number) {
    setOverviewLoading(true);
    try {
      const [prompts, mcpServers, skills] = await Promise.all([
        promptsList(workspaceId),
        mcpServersList(workspaceId),
        skillsInstalledList(workspaceId),
      ]);

      if (!prompts || !mcpServers || !skills) {
        setOverviewStats(null);
        return;
      }

      setOverviewStats({
        prompts: {
          total: prompts.length,
          enabled: prompts.filter((p) => p.enabled).length,
        },
        mcp: {
          total: mcpServers.length,
          enabled: mcpServers.filter((s) => s.enabled).length,
        },
        skills: {
          total: skills.length,
          enabled: skills.filter((s) => s.enabled).length,
        },
      });
    } catch (err) {
      logToConsole("error", "加载工作区概览失败", {
        error: String(err),
        workspace_id: workspaceId,
      });
      setOverviewStats(null);
    } finally {
      setOverviewLoading(false);
    }
  }

  async function refreshPreview(workspaceId: number) {
    setPreviewLoading(true);
    try {
      const next = await workspacePreview(workspaceId);
      setPreview(next ?? null);
    } catch (err) {
      logToConsole("error", "加载工作区预览失败", {
        error: String(err),
        workspace_id: workspaceId,
      });
      setPreview(null);
      toast("预览失败：请查看控制台日志");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (rightTab !== "overview") return;
    if (!selectedWorkspace) {
      setOverviewStats(null);
      return;
    }
    void refreshOverview(selectedWorkspace.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab, selectedWorkspace?.id]);

  useEffect(() => {
    if (rightTab !== "preview_apply") return;
    if (!selectedWorkspace) {
      setPreview(null);
      return;
    }
    void refreshPreview(selectedWorkspace.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab, selectedWorkspace?.id]);

  const createError = useMemo(() => {
    const name = normalizeWorkspaceName(createName);
    if (!name) return "名称不能为空";
    if (isDuplicateWorkspaceName(items, name)) return "名称重复：同一 CLI 下必须唯一";
    return null;
  }, [createName, items]);

  const renameTarget = useMemo(() => {
    if (!renameTargetId) return null;
    return items.find((w) => w.id === renameTargetId) ?? null;
  }, [items, renameTargetId]);

  const renameError = useMemo(() => {
    if (!renameOpen) return null;
    const name = normalizeWorkspaceName(renameName);
    if (!name) return "名称不能为空";
    if (isDuplicateWorkspaceName(items, name, renameTargetId))
      return "名称重复：同一 CLI 下必须唯一";
    return null;
  }, [items, renameName, renameOpen, renameTargetId]);

  const deleteTarget = useMemo(() => {
    if (!deleteTargetId) return null;
    return items.find((w) => w.id === deleteTargetId) ?? null;
  }, [items, deleteTargetId]);

  function openCreateDialog() {
    setCreateName("");
    setCreateMode("clone_active");
    setCreateOpen(true);
  }

  async function createWorkspace() {
    if (createError) return;
    const name = normalizeWorkspaceName(createName);
    if (!name) return;

    try {
      const created = await workspaceCreate({
        cli_key: activeCli,
        name,
        clone_from_active: createMode === "clone_active",
      });
      if (!created) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      toast("已创建");
      setCreateOpen(false);
      await refresh(activeCli);
      setSelectedWorkspaceId(created.id);
      setRightTab("overview");
    } catch (err) {
      logToConsole("error", "创建工作区失败", { error: String(err), cli: activeCli });
      toast(`创建失败：${String(err)}`);
    }
  }

  function openRenameDialog(target: WorkspaceSummary) {
    setRenameTargetId(target.id);
    setRenameName(target.name);
    setRenameOpen(true);
  }

  async function renameWorkspace() {
    if (!renameTarget) return;
    if (renameError) return;
    const name = normalizeWorkspaceName(renameName);
    if (!name) return;

    try {
      const next = await workspaceRename({ workspace_id: renameTarget.id, name });
      if (!next) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      toast("已重命名");
      setRenameOpen(false);
      setRenameTargetId(null);
      await refresh(activeCli);
    } catch (err) {
      logToConsole("error", "重命名工作区失败", { error: String(err), id: renameTarget.id });
      toast(`重命名失败：${String(err)}`);
    }
  }

  function openDeleteDialog(target: WorkspaceSummary) {
    setDeleteTargetId(target.id);
    setDeleteOpen(true);
  }

  async function deleteWorkspace() {
    if (!deleteTarget) return;
    try {
      const ok = await workspaceDelete(deleteTarget.id);
      if (!ok) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      toast("已删除");
      setDeleteOpen(false);
      setDeleteTargetId(null);
      await refresh(activeCli);
    } catch (err) {
      logToConsole("error", "删除工作区失败", { error: String(err), id: deleteTarget.id });
      toast(`删除失败：${String(err)}`);
    }
  }

  async function applySelectedWorkspace() {
    if (!selectedWorkspace) return;
    if (selectedWorkspace.id === activeWorkspaceId) return;
    if (applying) return;

    setApplying(true);
    try {
      const next = await workspaceApply(selectedWorkspace.id);
      if (!next) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      setApplyReport(next);
      toast("已应用为当前工作区");
      setApplyOpen(false);
      setApplyConfirm("");
      await refresh(activeCli);
      await refreshPreview(selectedWorkspace.id);
    } catch (err) {
      logToConsole("error", "应用工作区失败", {
        error: String(err),
        workspace_id: selectedWorkspace.id,
      });
      toast(`应用失败：${String(err)}`);
    } finally {
      setApplying(false);
    }
  }

  async function rollbackToPrevious() {
    if (!applyReport?.from_workspace_id) return;
    if (applying) return;
    setApplying(true);
    try {
      const next = await workspaceApply(applyReport.from_workspace_id);
      if (!next) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      setApplyReport(next);
      toast("已回滚到上一个工作区");
      await refresh(activeCli);
      if (selectedWorkspace) {
        await refreshPreview(selectedWorkspace.id);
      }
    } catch (err) {
      logToConsole("error", "回滚工作区失败", {
        error: String(err),
        from_workspace_id: applyReport.from_workspace_id,
      });
      toast(`回滚失败：${String(err)}`);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100vh-40px)] lg:overflow-hidden">
      <PageHeader
        title="工作区"
        actions={
          <>
            <Button variant="primary" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              新建
            </Button>
            <TabList
              ariaLabel="目标 CLI"
              items={CLI_TABS}
              value={activeCli}
              onChange={setActiveCli}
            />
          </>
        }
      />

      <div className="grid gap-4 lg:min-h-0 lg:grid-cols-[360px_1fr] lg:items-start lg:overflow-hidden">
        <Card padding="sm" className="flex flex-col lg:min-h-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Layers className="h-4 w-4 text-[#0052FF]" />
                工作区
                <span className="text-xs font-medium text-slate-500">{items.length} 个</span>
                <Badge tone="neutral">{cliLongLabel(activeCli)}</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-500">同一 CLI 下名称不可重复。</div>
            </div>
          </div>

          <div className="mt-3">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <Search className="h-4 w-4" aria-hidden="true" />
              </div>
              <Input
                value={filterText}
                onChange={(e) => setFilterText(e.currentTarget.value)}
                placeholder="搜索"
                className="pl-9"
                aria-label="搜索工作区"
              />
            </div>
          </div>

          <div className="mt-3 space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
            {loading ? (
              <div className="text-sm text-slate-600 px-1">加载中…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
                暂无工作区
              </div>
            ) : (
              filtered.map((workspace) => {
                const isActive = workspace.id === activeWorkspaceId;
                const isSelected = workspace.id === selectedWorkspaceId;
                const hint = workspaceRootHint(workspace.cli_key, workspace.id);

                return (
                  <div
                    key={workspace.id}
                    className={cn(
                      "rounded-2xl border p-4 transition",
                      isActive
                        ? "border-[#0052FF]/30 bg-[#0052FF]/[0.03] shadow-sm"
                        : isSelected
                          ? "border-slate-300 bg-slate-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                    )}
                    aria-current={isActive ? "true" : undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedWorkspaceId(workspace.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelectedWorkspaceId(workspace.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {workspace.name}
                          </div>
                          {isActive ? (
                            <Badge tone="active">当前</Badge>
                          ) : (
                            <Badge tone="neutral">可用</Badge>
                          )}
                        </div>
                        <div
                          className="mt-1 truncate font-mono text-[11px] text-slate-500"
                          title={hint}
                        >
                          {hint}
                        </div>
                        <div className="mt-2 text-xs text-slate-600">
                          更新 {formatUnixSeconds(workspace.updated_at)}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorkspaceId(workspace.id);
                            setRightTab("preview_apply");
                          }}
                          className="h-8"
                          title="查看差异并在「预览&应用」中切换为当前"
                        >
                          <Eye className="h-4 w-4" />
                          预览
                        </Button>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="重命名"
                            title="重命名"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRenameDialog(workspace);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="danger"
                            aria-label="删除"
                            title={isActive ? "请先切换当前工作区再删除" : "删除"}
                            disabled={isActive}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteDialog(workspace);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-hidden">
          {selectedWorkspace ? (
            <Card padding="md" className="lg:min-h-0 lg:overflow-auto">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-lg font-semibold text-slate-900">
                      {selectedWorkspace.name}
                    </div>
                    {selectedWorkspace.id === activeWorkspaceId ? (
                      <Badge tone="active">当前</Badge>
                    ) : (
                      <Badge tone="neutral">非当前</Badge>
                    )}
                    <Badge tone="neutral">{cliLongLabel(selectedWorkspace.cli_key)}</Badge>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-slate-500">
                    {workspaceRootHint(selectedWorkspace.cli_key, selectedWorkspace.id)}
                  </div>
                </div>

                <TabList
                  ariaLabel="配置分类"
                  items={RIGHT_TABS}
                  value={rightTab}
                  onChange={setRightTab}
                  className="w-full sm:w-auto"
                />
              </div>

              <div className="mt-4">
                {rightTab === "overview" ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">
                        你现在在编辑一个配置档案（workspace）
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        推荐流程：先在 Prompts/MCP/Skills 中配置 →
                        再到「预览&应用」对比差异并切换为当前。
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <Card padding="sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Prompts
                        </div>
                        <div className="mt-2 text-sm text-slate-700">
                          {overviewLoading ? (
                            "加载中…"
                          ) : overviewStats ? (
                            <>
                              已启用 {overviewStats.prompts.enabled} / 共{" "}
                              {overviewStats.prompts.total}
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRightTab("prompts")}
                          >
                            去配置
                          </Button>
                        </div>
                      </Card>

                      <Card padding="sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          MCP
                        </div>
                        <div className="mt-2 text-sm text-slate-700">
                          {overviewLoading ? (
                            "加载中…"
                          ) : overviewStats ? (
                            <>
                              已启用 {overviewStats.mcp.enabled} / 共 {overviewStats.mcp.total}
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div className="mt-3">
                          <Button size="sm" variant="secondary" onClick={() => setRightTab("mcp")}>
                            去配置
                          </Button>
                        </div>
                      </Card>

                      <Card padding="sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Skills
                        </div>
                        <div className="mt-2 text-sm text-slate-700">
                          {overviewLoading ? (
                            "加载中…"
                          ) : overviewStats ? (
                            <>
                              已启用 {overviewStats.skills.enabled} / 共{" "}
                              {overviewStats.skills.total}
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRightTab("skills")}
                          >
                            去配置
                          </Button>
                        </div>
                      </Card>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Card padding="sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          基本信息
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-slate-700">
                          <div>
                            <span className="text-slate-500">ID：</span>
                            {selectedWorkspace.id}
                          </div>
                          <div>
                            <span className="text-slate-500">创建：</span>
                            {formatUnixSeconds(selectedWorkspace.created_at)}
                          </div>
                          <div>
                            <span className="text-slate-500">更新：</span>
                            {formatUnixSeconds(selectedWorkspace.updated_at)}
                          </div>
                        </div>
                      </Card>

                      <Card padding="sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          同步语义
                        </div>
                        <div className="mt-2 space-y-2 text-sm text-slate-700">
                          {selectedWorkspace.id === activeWorkspaceId ? (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                              当前工作区：对 Prompts/MCP/Skills 的修改会即时同步到 CLI 配置。
                            </div>
                          ) : (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              非当前工作区：修改仅写入数据库，不触发任何真实同步/文件写入。
                            </div>
                          )}
                          <div className="text-xs text-slate-500">
                            切换工作区在「预览&应用」中完成。
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : rightTab === "prompts" ? (
                  <PromptsView
                    workspaceId={selectedWorkspace.id}
                    cliKey={selectedWorkspace.cli_key}
                    isActiveWorkspace={selectedWorkspace.id === activeWorkspaceId}
                  />
                ) : rightTab === "mcp" ? (
                  <>
                    {selectedWorkspace.id === activeWorkspaceId ? null : (
                      <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        非当前工作区：启用/停用仅写入数据库，不会同步到 CLI。
                      </div>
                    )}
                    <McpServersView workspaceId={selectedWorkspace.id} />
                  </>
                ) : rightTab === "skills" ? (
                  <SkillsView
                    workspaceId={selectedWorkspace.id}
                    cliKey={selectedWorkspace.cli_key}
                    isActiveWorkspace={selectedWorkspace.id === activeWorkspaceId}
                  />
                ) : (
                  <div className="space-y-3">
                    <Card padding="sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        对比范围
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        当前：
                        {(() => {
                          const fromId = preview?.from_workspace_id ?? activeWorkspaceId;
                          if (!fromId) return "（未设置）";
                          return workspaceById.get(fromId)?.name ?? `#${fromId}`;
                        })()}
                        <span className="mx-2 text-slate-400">→</span>
                        目标：{selectedWorkspace.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        这里展示“当前工作区”和“目标工作区”的差异。确认无误后再应用为当前。
                      </div>
                    </Card>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      应用会写入用户 Home 下的 CLI 配置文件/目录（仅影响 AIO 托管的内容）：
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                        <li>Prompts：{promptFileHint(selectedWorkspace.cli_key)}</li>
                        <li>MCP：{mcpConfigHint(selectedWorkspace.cli_key)}</li>
                        <li>Skills：{skillsDirHint(selectedWorkspace.cli_key)}</li>
                      </ul>
                    </div>

                    {previewLoading ? (
                      <div className="text-sm text-slate-600">生成预览中…</div>
                    ) : !preview ? (
                      <div className="text-sm text-slate-600">暂无预览数据。</div>
                    ) : (
                      <div className="space-y-3">
                        <Card padding="sm">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Prompts
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {preview.prompts.will_change ? (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                将变更
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                不变
                              </span>
                            )}
                          </div>
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-xs font-medium text-slate-500">当前</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {preview.prompts.from_enabled?.name ?? "（未启用）"}
                              </div>
                              <div className="mt-1 text-xs text-slate-600">
                                {preview.prompts.from_enabled?.excerpt ?? "—"}
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-xs font-medium text-slate-500">目标</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {preview.prompts.to_enabled?.name ?? "（未启用）"}
                              </div>
                              <div className="mt-1 text-xs text-slate-600">
                                {preview.prompts.to_enabled?.excerpt ?? "—"}
                              </div>
                            </div>
                          </div>
                        </Card>

                        <Card padding="sm">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            MCP
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            +{preview.mcp.added.length} / -{preview.mcp.removed.length}
                          </div>
                          {preview.mcp.added.length || preview.mcp.removed.length ? (
                            <div className="mt-2 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-medium text-slate-500">新增</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {preview.mcp.added.map((k) => (
                                    <span
                                      key={k}
                                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                                    >
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-medium text-slate-500">移除</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {preview.mcp.removed.map((k) => (
                                    <span
                                      key={k}
                                      className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                                    >
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-slate-500">无变化</div>
                          )}
                        </Card>

                        <Card padding="sm">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Skills
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            +{preview.skills.added.length} / -{preview.skills.removed.length}
                          </div>
                          {preview.skills.added.length || preview.skills.removed.length ? (
                            <div className="mt-2 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-medium text-slate-500">新增</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {preview.skills.added.map((k) => (
                                    <span
                                      key={k}
                                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                                    >
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-medium text-slate-500">移除</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {preview.skills.removed.map((k) => (
                                    <span
                                      key={k}
                                      className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                                    >
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-slate-500">无变化</div>
                          )}
                        </Card>
                      </div>
                    )}

                    {applyReport && applyReport.to_workspace_id === selectedWorkspace.id ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        已应用（{new Date(applyReport.applied_at * 1000).toLocaleString()}）
                        {applyReport.from_workspace_id ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="ml-2"
                            disabled={applying}
                            onClick={() => void rollbackToPrevious()}
                          >
                            回滚到上一个
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      <Button
                        variant="secondary"
                        onClick={() => void refreshPreview(selectedWorkspace.id)}
                        disabled={previewLoading}
                      >
                        刷新预览
                      </Button>
                      <Button
                        variant="primary"
                        disabled={selectedWorkspace.id === activeWorkspaceId}
                        onClick={() => {
                          setApplyConfirm("");
                          setApplyOpen(true);
                        }}
                      >
                        应用为当前
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
              请选择一个工作区
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => setCreateOpen(open)}
        title={`新建工作区（${cliLongLabel(activeCli)}）`}
        description="默认从当前工作区克隆（仅 DB 复制，不触发真实同步）。"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <FormField label="名称">
            <Input value={createName} onChange={(e) => setCreateName(e.currentTarget.value)} />
          </FormField>

          <FormField label="创建方式">
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="create-mode"
                  checked={createMode === "clone_active"}
                  onChange={() => setCreateMode("clone_active")}
                />
                从当前工作区克隆（推荐）
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="create-mode"
                  checked={createMode === "blank"}
                  onChange={() => setCreateMode("blank")}
                />
                空白创建
              </label>
            </div>
          </FormField>

          {createError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {createError}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button onClick={() => setCreateOpen(false)} variant="secondary">
              取消
            </Button>
            <Button
              onClick={() => void createWorkspace()}
              variant="primary"
              disabled={!!createError}
            >
              创建
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) setRenameTargetId(null);
        }}
        title={renameTarget ? `重命名：${renameTarget.name}` : "重命名工作区"}
        description="名称在同一 CLI 下必须唯一。"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <FormField label="名称">
            <Input value={renameName} onChange={(e) => setRenameName(e.currentTarget.value)} />
          </FormField>

          {renameError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {renameError}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button onClick={() => setRenameOpen(false)} variant="secondary">
              取消
            </Button>
            <Button
              onClick={() => void renameWorkspace()}
              variant="primary"
              disabled={!!renameError || !renameTarget}
            >
              保存
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteTargetId(null);
        }}
        title="确认删除工作区"
        description={deleteTarget ? `将删除：${deleteTarget.name}` : undefined}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            删除会移除此工作区下的 Prompts/MCP/Skills 配置（DB）。不会删除任何未托管的 CLI 文件。
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => setDeleteOpen(false)} variant="secondary">
              取消
            </Button>
            <Button
              onClick={() => void deleteWorkspace()}
              variant="danger"
              disabled={!deleteTarget}
            >
              确认删除
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={applyOpen}
        onOpenChange={(open) => {
          setApplyOpen(open);
          if (!open) setApplyConfirm("");
        }}
        title="确认应用工作区"
        description={selectedWorkspace ? `将切换为当前：${selectedWorkspace.name}` : undefined}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            该操作会写入用户 Home 下的 CLI 配置文件/目录（仅影响 AIO
            托管的内容）。继续前请确认已备份重要配置。
          </div>

          {selectedWorkspace ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div>Prompts：{promptFileHint(selectedWorkspace.cli_key)}</div>
              <div>MCP：{mcpConfigHint(selectedWorkspace.cli_key)}</div>
              <div>Skills：{skillsDirHint(selectedWorkspace.cli_key)}</div>
            </div>
          ) : null}

          <FormField label="输入 APPLY 以确认">
            <Input value={applyConfirm} onChange={(e) => setApplyConfirm(e.currentTarget.value)} />
          </FormField>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button onClick={() => setApplyOpen(false)} variant="secondary">
              取消
            </Button>
            <Button
              onClick={() => void applySelectedWorkspace()}
              variant="primary"
              disabled={
                !selectedWorkspace || applyConfirm.trim().toUpperCase() !== "APPLY" || applying
              }
            >
              {applying ? "应用中…" : "确认应用"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
