// Usage: Installed/local skills view for a specific workspace.

import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useSkillImportLocalMutation,
  useSkillSetEnabledMutation,
  useSkillUninstallMutation,
  useSkillsImportLocalBatchMutation,
  useSkillsInstalledListQuery,
  useSkillsLocalListQuery,
} from "../../query/skills";
import { logToConsole } from "../../services/consoleLog";
import type { CliKey } from "../../services/providers";
import {
  type InstalledSkillSummary,
  type LocalSkillSummary,
  type SkillImportIssue,
} from "../../services/skills";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Dialog } from "../../ui/Dialog";
import { Switch } from "../../ui/Switch";
import { cn } from "../../utils/cn";
import { formatActionFailureToast } from "../../utils/errors";

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
  const importBatchMutation = useSkillsImportLocalBatchMutation(workspaceId);

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
  const importingBatch = importBatchMutation.isPending;

  const [uninstallTarget, setUninstallTarget] = useState<InstalledSkillSummary | null>(null);

  const [importTarget, setImportTarget] = useState<LocalSkillSummary | null>(null);
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [selectedLocalDirNames, setSelectedLocalDirNames] = useState<string[]>([]);
  const [batchImportIssues, setBatchImportIssues] = useState<SkillImportIssue[]>([]);

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
        toast("仅在 Tauri Desktop 环境可用");
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
        toast("仅在 Tauri Desktop 环境可用");
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
      toast("仅当前工作区可导入本机 Skill。请先切换该工作区为当前。");
      return;
    }
    const target = importTarget;
    try {
      const next = await importMutation.mutateAsync(target.dir_name);
      if (!next) {
        toast("仅在 Tauri Desktop 环境可用");
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

  function openBatchImportDialog() {
    setBatchImportIssues([]);
    setSelectedLocalDirNames(localSkills.map((skill) => skill.dir_name));
    setBatchImportOpen(true);
  }

  function toggleBatchSelection(dirName: string) {
    setSelectedLocalDirNames((prev) =>
      prev.includes(dirName) ? prev.filter((item) => item !== dirName) : [...prev, dirName]
    );
  }

  function selectAllLocalSkills() {
    setSelectedLocalDirNames(localSkills.map((skill) => skill.dir_name));
  }

  function clearLocalSkillSelections() {
    setSelectedLocalDirNames([]);
  }

  async function confirmBatchImportLocalSkills() {
    if (importingBatch) return;
    if (!canOperateLocal) {
      toast("仅当前工作区可导入本机 Skill。请先切换该工作区为当前。");
      return;
    }

    const deduped = Array.from(new Set(selectedLocalDirNames.map((item) => item.trim()))).filter(
      Boolean
    );
    if (deduped.length === 0) {
      toast("请至少选择一个本机 Skill");
      return;
    }

    try {
      const report = await importBatchMutation.mutateAsync(deduped);
      if (!report) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      const skipped = report.skipped ?? [];
      const failed = report.failed ?? [];
      const imported = report.imported ?? [];
      setBatchImportIssues([...skipped, ...failed]);

      toast(`批量导入完成：成功 ${imported.length}，跳过 ${skipped.length}，失败 ${failed.length}`);
      logToConsole("info", "批量导入本机 Skill", {
        cli: cliKey,
        workspace_id: workspaceId,
        imported_count: imported.length,
        skipped,
        failed,
      });

      if (failed.length === 0 && skipped.length === 0) {
        setBatchImportOpen(false);
      }
    } catch (err) {
      const formatted = formatActionFailureToast("批量导入", err);
      logToConsole("error", "批量导入本机 Skill 失败", {
        error: formatted.raw,
        error_code: formatted.error_code ?? undefined,
        cli: cliKey,
        workspace_id: workspaceId,
        selected: selectedLocalDirNames,
      });
      toast(formatted.toast);
    }
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
                <div key={skill.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
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
                    <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{skill.description}</div>
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
                onClick={openBatchImportDialog}
                disabled={!canOperateLocal || localLoading || !localSkills.length || importingBatch}
              >
                导入已有
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
                    <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{skill.description}</div>
                  ) : null}
                  <div className="mt-2 truncate font-mono text-xs text-slate-500 dark:text-slate-400">{skill.path}</div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Dialog
        open={batchImportOpen}
        title="导入已有 Skill"
        description="支持多选导入；冲突项会跳过并展示原因，导入流程不中断。"
        onOpenChange={(open) => {
          setBatchImportOpen(open);
          if (!open) setBatchImportIssues([]);
        }}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={selectAllLocalSkills}>
              全选
            </Button>
            <Button size="sm" variant="secondary" onClick={clearLocalSkillSelections}>
              清空
            </Button>
            <span className="text-xs text-slate-500 dark:text-slate-400">已选择 {selectedLocalDirNames.length} 项</span>
          </div>

          <div className="max-h-[280px] space-y-2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
            {localSkills.length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">暂无可导入的本机 Skill</div>
            ) : (
              localSkills.map((skill) => {
                const selected = selectedLocalDirNames.includes(skill.dir_name);
                return (
                  <label
                    key={skill.path}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleBatchSelection(skill.dir_name)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {skill.name || skill.dir_name}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                        {skill.path}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {batchImportIssues.length > 0 ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-900 dark:text-amber-400">
              <div className="font-medium">导入提示（{batchImportIssues.length}）</div>
              <div className="mt-2 max-h-[140px] space-y-1 overflow-y-auto">
                {batchImportIssues.map((issue, index) => (
                  <div key={`${issue.dir_name}-${index}`}>
                    {issue.dir_name}：{issue.error_code ? `[${issue.error_code}] ` : ""}
                    {issue.message}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setBatchImportOpen(false)}
              disabled={importingBatch}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => void confirmBatchImportLocalSkills()}
              disabled={importingBatch}
            >
              {importingBatch ? "导入中…" : "确认导入"}
            </Button>
          </div>
        </div>
      </Dialog>

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
            <div className="font-medium text-slate-800 dark:text-slate-200">{uninstallTarget?.name}</div>
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
