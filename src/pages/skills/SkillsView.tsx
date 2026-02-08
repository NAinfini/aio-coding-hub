// Usage: Installed/local skills view for a specific workspace.

import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useSkillImportLocalMutation,
  useSkillSetEnabledMutation,
  useSkillUninstallMutation,
  useSkillsInstalledListQuery,
  useSkillsLocalListQuery,
} from "../../query/skills";
import { logToConsole } from "../../services/consoleLog";
import type { CliKey } from "../../services/providers";
import { type InstalledSkillSummary, type LocalSkillSummary } from "../../services/skills";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Dialog } from "../../ui/Dialog";
import { Switch } from "../../ui/Switch";
import { cn } from "../../utils/cn";
import { formatActionFailureToast } from "../../utils/errors";

const TOAST_TAURI_ONLY = "仅在 Tauri Desktop 环境可用";
const TOAST_LOCAL_IMPORT_REQUIRES_ACTIVE = "仅当前工作区可导入本机 Skill。请先切换该工作区为当前。";

function formatUnixSeconds(ts: number) {
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return String(ts);
  }
}

function sourceHint(
  skill: Pick<InstalledSkillSummary, "source_git_url" | "source_branch" | "source_subdir">
) {
  return `${skill.source_git_url}#${skill.source_branch}:${skill.source_subdir}`;
}

async function openPathOrReveal(path: string) {
  try {
    await openPath(path);
    return;
  } catch (err) {
    logToConsole("warn", "openPath 失败，尝试 revealItemInDir", {
      error: String(err),
      path,
    });
  }
  await revealItemInDir(path);
}

export type SkillsViewProps = {
  workspaceId: number;
  cliKey: CliKey;
  isActiveWorkspace?: boolean;
};

export function SkillsView({ workspaceId, cliKey, isActiveWorkspace = true }: SkillsViewProps) {
  const canOperateLocal = useMemo(() => isActiveWorkspace, [isActiveWorkspace]);

  const installedQuery = useSkillsInstalledListQuery(workspaceId);
  const localQuery = useSkillsLocalListQuery(workspaceId, { enabled: canOperateLocal });

  const toggleMutation = useSkillSetEnabledMutation(workspaceId);
  const uninstallMutation = useSkillUninstallMutation(workspaceId);
  const importMutation = useSkillImportLocalMutation(workspaceId);

  const installed: InstalledSkillSummary[] = installedQuery.data ?? [];
  const localSkills: LocalSkillSummary[] = canOperateLocal ? (localQuery.data ?? []) : [];

  const loading = installedQuery.isFetching;
  const localLoading = canOperateLocal ? localQuery.isFetching : false;
  const togglingSkillId = toggleMutation.isPending
    ? (toggleMutation.variables?.skillId ?? null)
    : null;
  const uninstallingSkillId = uninstallMutation.isPending
    ? (uninstallMutation.variables ?? null)
    : null;
  const importingLocal = importMutation.isPending;

  const [uninstallTarget, setUninstallTarget] = useState<InstalledSkillSummary | null>(null);

  const [importTarget, setImportTarget] = useState<LocalSkillSummary | null>(null);

  useEffect(() => {
    if (!installedQuery.error) return;
    logToConsole("error", "加载 Skills 数据失败", {
      error: String(installedQuery.error),
      workspace_id: workspaceId,
    });
    toast("加载失败：请查看控制台日志");
  }, [installedQuery.error, workspaceId]);

  useEffect(() => {
    if (!localQuery.error) return;
    logToConsole("error", "扫描本机 Skill 失败", {
      error: String(localQuery.error),
      cli: cliKey,
      workspace_id: workspaceId,
    });
    toast("扫描本机 Skill 失败：请查看控制台日志");
  }, [cliKey, localQuery.error, workspaceId]);

  async function toggleSkillEnabled(skill: InstalledSkillSummary, enabled: boolean) {
    if (toggleMutation.isPending) return;
    try {
      const next = await toggleMutation.mutateAsync({ skillId: skill.id, enabled });
      if (!next) {
        toast(TOAST_TAURI_ONLY);
        return;
      }
      if (enabled) {
        toast(isActiveWorkspace ? "已启用" : "已启用（非当前工作区，不会同步）");
      } else {
        toast(isActiveWorkspace ? "已禁用" : "已禁用");
      }
    } catch (err) {
      const formatted = formatActionFailureToast("切换启用", err);
      logToConsole("error", "切换 Skill 启用状态失败", {
        error: formatted.raw,
        error_code: formatted.error_code ?? undefined,
        cli: cliKey,
        workspace_id: workspaceId,
        skill_id: skill.id,
        enabled,
      });
      toast(formatted.toast);
    }
  }

  async function confirmUninstallSkill() {
    if (!uninstallTarget) return;
    if (uninstallMutation.isPending) return;
    const target = uninstallTarget;
    try {
      const ok = await uninstallMutation.mutateAsync(target.id);
      if (!ok) {
        toast(TOAST_TAURI_ONLY);
        return;
      }
      toast("已卸载");
      logToConsole("info", "卸载 Skill", target);
      setUninstallTarget(null);
    } catch (err) {
      const formatted = formatActionFailureToast("卸载", err);
      logToConsole("error", "卸载 Skill 失败", {
        error: formatted.raw,
        error_code: formatted.error_code ?? undefined,
        skill: target,
      });
      toast(formatted.toast);
    }
  }

  async function confirmImportLocalSkill() {
    if (!importTarget) return;
    if (importMutation.isPending) return;
    if (!canOperateLocal) {
      toast(TOAST_LOCAL_IMPORT_REQUIRES_ACTIVE);
      return;
    }
    const target = importTarget;
    try {
      const next = await importMutation.mutateAsync(target.dir_name);
      if (!next) {
        toast(TOAST_TAURI_ONLY);
        return;
      }

      toast("已导入到技能库");
      logToConsole("info", "导入本机 Skill", {
        cli: cliKey,
        workspace_id: workspaceId,
        imported: next,
      });
      setImportTarget(null);
    } catch (err) {
      const formatted = formatActionFailureToast("导入", err);
      logToConsole("error", "导入本机 Skill 失败", {
        error: formatted.raw,
        error_code: formatted.error_code ?? undefined,
        cli: cliKey,
        workspace_id: workspaceId,
        skill: target,
      });
      toast(formatted.toast);
    }
  }

  async function refreshLocalSkills() {
    if (!canOperateLocal || localLoading) return;
    await localQuery.refetch();
  }

  async function openLocalSkillDir(skill: LocalSkillSummary) {
    try {
      await openPathOrReveal(skill.path);
    } catch (err) {
      logToConsole("error", "打开本机 Skill 目录失败", {
        error: String(err),
        cli: cliKey,
        workspace_id: workspaceId,
        path: skill.path,
      });
      toast("打开目录失败：请查看控制台日志");
    }
  }

  return (
    <>
      <div className="grid h-full gap-4 lg:grid-cols-2">
        <Card className="flex min-h-[240px] flex-col lg:min-h-0" padding="md">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="text-sm font-semibold">通用技能</div>
            <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
              {installed.length}
            </span>
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-2 lg:overflow-y-auto lg:pr-1 scrollbar-overlay">
            {loading ? (
              <div className="text-sm text-slate-600 dark:text-slate-400">加载中…</div>
            ) : installed.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-600 dark:text-slate-400">
                暂无已安装 Skill。
              </div>
            ) : (
              installed.map((skill) => (
                <div
                  key={skill.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">{skill.name}</span>
                    <a
                      href={`${skill.source_git_url}${skill.source_branch ? `#` + skill.source_branch : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                      title={sourceHint(skill)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <div className="ms-auto flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400">启用</span>
                      <Switch
                        checked={skill.enabled}
                        disabled={togglingSkillId === skill.id || uninstallingSkillId === skill.id}
                        onCheckedChange={(next) => void toggleSkillEnabled(skill, next)}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={uninstallingSkillId === skill.id}
                        onClick={() => setUninstallTarget(skill)}
                      >
                        卸载
                      </Button>
                    </div>
                  </div>
                  {skill.description ? (
                    <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {skill.description}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 font-medium",
                        skill.enabled
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                      )}
                    >
                      {skill.enabled ? "已启用" : "未启用"}
                    </span>
                    <span>更新 {formatUnixSeconds(skill.updated_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="flex min-h-[240px] flex-col lg:min-h-0" padding="md">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="text-sm font-semibold">本机已安装</div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void refreshLocalSkills()}
                disabled={!canOperateLocal || localLoading}
              >
                {localLoading ? "刷新中…" : "刷新"}
              </Button>
              <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                {canOperateLocal ? (localLoading ? "扫描中…" : `${localSkills.length}`) : "—"}
              </span>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-2 lg:overflow-y-auto lg:pr-1 scrollbar-overlay">
            {!canOperateLocal ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-600 dark:text-slate-400">
                仅当前工作区可扫描/导入本机 Skill（因为会直接读取/写入 {cliKey} 的真实目录）。
              </div>
            ) : localLoading ? (
              <div className="text-sm text-slate-600 dark:text-slate-400">扫描中…</div>
            ) : localSkills.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-600 dark:text-slate-400">
                未发现本机 Skill。
              </div>
            ) : (
              localSkills.map((skill) => (
                <div
                  key={skill.path}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {skill.name || skill.dir_name}
                    </span>
                    <div className="ms-auto flex items-center gap-2">
                      <Button size="sm" variant="primary" onClick={() => setImportTarget(skill)}>
                        导入技能库
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void openLocalSkillDir(skill)}
                      >
                        打开目录
                      </Button>
                    </div>
                  </div>
                  {skill.description ? (
                    <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {skill.description}
                    </div>
                  ) : null}
                  <div className="mt-2 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                    {skill.path}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Dialog
        open={importTarget != null}
        title="导入到技能库"
        description="导入后该 Skill 会被 AIO 记录并管理，可在其他工作区中启用/禁用，并支持卸载。"
        onOpenChange={(open) => {
          if (!open) setImportTarget(null);
        }}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="font-medium text-slate-800 dark:text-slate-200">
              {importTarget?.name || importTarget?.dir_name}
            </div>
            <div className="mt-1 break-all font-mono">{importTarget?.path}</div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportTarget(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!importTarget || importingLocal}
              onClick={() => void confirmImportLocalSkill()}
            >
              {importingLocal ? "导入中…" : "确认导入"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={uninstallTarget != null}
        title="确认卸载 Skill"
        description="卸载会删除 SSOT 缓存目录，并尝试移除所有 CLI 下由 AIO 托管的对应目录。"
        onOpenChange={(open) => {
          if (!open) setUninstallTarget(null);
        }}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="font-medium text-slate-800 dark:text-slate-200">
              {uninstallTarget?.name}
            </div>
            <div className="mt-1 break-all font-mono">
              {uninstallTarget ? sourceHint(uninstallTarget) : ""}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setUninstallTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={!uninstallTarget || uninstallingSkillId != null}
              onClick={() => void confirmUninstallSkill()}
            >
              {uninstallingSkillId != null ? "卸载中…" : "确认卸载"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
