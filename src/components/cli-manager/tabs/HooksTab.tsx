// Usage: Manage Claude Code hooks in ~/.claude/settings.json.

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Zap, RefreshCw } from "lucide-react";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { EmptyState } from "../../../ui/EmptyState";
import { Input } from "../../../ui/Input";
import { Select } from "../../../ui/Select";
import { Spinner } from "../../../ui/Spinner";
import {
  useCliManagerClaudeHooksQuery,
  useCliManagerClaudeHooksSetMutation,
} from "../../../query/cliManager";
import type { ClaudeHookGroup } from "../../../services/cli/cliManager";
import { logToConsole } from "../../../services/consoleLog";

const HOOK_EVENTS = [
  "SessionStart",
  "Setup",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
  "TeammateIdle",
  "InstructionsLoaded",
  "ConfigChange",
  "CwdChanged",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "Elicitation",
  "ElicitationResult",
  "SessionEnd",
] as const;

type EditorState = {
  mode: "create" | "edit";
  index: number;
  hookIndex: number;
  event: string;
  matcher: string;
  command: string;
  timeout: string;
};

export function CliManagerHooksTab() {
  const hooksQuery = useCliManagerClaudeHooksQuery();
  const hooksMutation = useCliManagerClaudeHooksSetMutation();

  const groups = hooksQuery.data?.groups ?? [];
  const loading = hooksQuery.isLoading;
  const saving = hooksMutation.isPending;

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const persistGroups = useCallback(
    async (nextGroups: ClaudeHookGroup[]) => {
      try {
        await hooksMutation.mutateAsync({ groups: nextGroups });
        toast("已保存 Hooks 配置");
      } catch (err) {
        logToConsole("error", "保存 Hooks 配置失败", { error: String(err) });
        toast("保存 Hooks 失败：请稍后重试");
      }
    },
    [hooksMutation]
  );

  function openCreate() {
    setEditor({
      mode: "create",
      index: -1,
      hookIndex: 0,
      event: "PreToolUse",
      matcher: "",
      command: "",
      timeout: "",
    });
  }

  function openEdit(index: number, hookIndex = 0) {
    const g = groups[index];
    if (!g) return;
    const hook = g.hooks[hookIndex];
    setEditor({
      mode: "edit",
      index,
      hookIndex,
      event: g.event,
      matcher: g.matcher,
      command: hook?.command ?? "",
      timeout: hook?.timeout != null ? String(hook.timeout) : "",
    });
  }

  async function handleSave() {
    if (!editor) return;
    if (!editor.command.trim()) {
      toast("请填写命令");
      return;
    }

    const editedHook = {
      hook_type: "command" as const,
      command: editor.command.trim(),
      timeout: editor.timeout.trim() ? Number(editor.timeout.trim()) : null,
    };

    const next = [...groups];
    if (editor.mode === "edit" && editor.index >= 0) {
      const existing = groups[editor.index];
      const updatedHooks = [...(existing?.hooks ?? [])];
      updatedHooks[editor.hookIndex] = editedHook;
      next[editor.index] = {
        event: editor.event,
        matcher: editor.matcher,
        hooks: updatedHooks,
      };
    } else {
      next.push({
        event: editor.event,
        matcher: editor.matcher,
        hooks: [editedHook],
      });
    }

    await persistGroups(next);
    setEditor(null);
  }

  async function handleDelete() {
    if (deleteTarget == null) return;
    const next = groups.filter((_, i) => i !== deleteTarget);
    await persistGroups(next);
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-4 px-1 pb-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Claude Code Hooks ({groups.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void hooksQuery.refetch()}
            variant="secondary"
            size="sm"
            className="h-8"
            disabled={loading}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            刷新
          </Button>
          <Button onClick={openCreate} variant="secondary" size="sm" className="h-8">
            <Plus className="mr-1 h-3 w-3" />
            添加
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Spinner size="sm" />
          加载中…
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="暂无 Hooks 配置"
          description="Hooks 可在 Claude Code 执行特定操作时自动运行脚本。点击「添加」创建第一个 Hook。"
          variant="dashed"
        />
      ) : (
        <div className="space-y-2">
          {groups.map((group, index) => (
            <div
              key={`${group.event}-${group.matcher}-${index}`}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {group.event}
                  </span>
                  {group.matcher ? (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {group.matcher}
                    </span>
                  ) : null}
                </div>
                {group.hooks.map((hook, hi) => (
                  <div key={hi} className="mt-1.5 flex items-center gap-1.5">
                    <div
                      className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400"
                      title={hook.command}
                    >
                      {hook.command}
                      {hook.timeout != null ? (
                        <span className="ml-2 text-slate-400 dark:text-slate-500">
                          ({hook.timeout}s)
                        </span>
                      ) : null}
                    </div>
                    {group.hooks.length > 1 ? (
                      <Button
                        onClick={() => openEdit(index, hi)}
                        variant="secondary"
                        size="sm"
                        className="h-5 w-5 shrink-0 p-0"
                        title="编辑此命令"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  onClick={() => openEdit(index)}
                  variant="secondary"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title="编辑"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  onClick={() => setDeleteTarget(index)}
                  variant="secondary"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title="删除"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editor ? (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open && !saving) setEditor(null);
          }}
          title={editor.mode === "create" ? "添加 Hook" : "编辑 Hook"}
          className="max-w-lg"
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                事件
              </label>
              <Select
                value={editor.event}
                onChange={(e) => setEditor({ ...editor, event: e.target.value })}
                className="w-full"
              >
                {HOOK_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Matcher（匹配工具名或事件子类型，多个用 | 分隔，留空匹配全部）
              </label>
              <Input
                value={editor.matcher}
                onChange={(e) => setEditor({ ...editor, matcher: e.target.value })}
                placeholder="例如 Edit|Write 或留空"
                className="text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                命令
              </label>
              <Input
                value={editor.command}
                onChange={(e) => setEditor({ ...editor, command: e.target.value })}
                placeholder="要执行的 shell 命令"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                超时（秒，留空使用默认值）
              </label>
              <Input
                value={editor.timeout}
                onChange={(e) =>
                  setEditor({ ...editor, timeout: e.target.value.replace(/[^0-9]/g, "") })
                }
                placeholder="例如 30"
                className="text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setEditor(null)}
                variant="secondary"
                size="sm"
                disabled={saving}
              >
                取消
              </Button>
              <Button
                onClick={() => void handleSave()}
                variant="primary"
                size="sm"
                disabled={saving || !editor.command.trim()}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !saving) setDeleteTarget(null);
        }}
        title="确认删除 Hook"
        description={
          deleteTarget != null && groups[deleteTarget]
            ? `将删除事件 ${groups[deleteTarget].event} 的 Hook${groups[deleteTarget].matcher ? `（matcher: ${groups[deleteTarget].matcher}）` : ""}`
            : undefined
        }
        className="max-w-lg"
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setDeleteTarget(null)} variant="secondary" disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleDelete()} variant="primary" disabled={saving}>
            {saving ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
