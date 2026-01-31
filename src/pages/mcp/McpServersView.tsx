import { useEffect, useState } from "react";
import { toast } from "sonner";
import { logToConsole } from "../../services/consoleLog";
import {
  mcpServerDelete,
  mcpServerSetEnabled,
  mcpServersList,
  type McpServerSummary,
} from "../../services/mcp";
import { Button } from "../../ui/Button";
import { McpDeleteDialog } from "./components/McpDeleteDialog";
import { McpServerCard } from "./components/McpServerCard";
import { McpServerDialog } from "./components/McpServerDialog";

export type McpServersViewProps = {
  workspaceId: number;
};

export function McpServersView({ workspaceId }: McpServersViewProps) {
  const [items, setItems] = useState<McpServerSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<McpServerSummary | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<McpServerSummary | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const next = await mcpServersList(workspaceId);
      if (!next) {
        setItems([]);
        return;
      }
      setItems(next);
    } catch (err) {
      logToConsole("error", "加载 MCP Servers 失败", { error: String(err) });
      toast("加载失败：请查看控制台日志");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [workspaceId]);

  async function toggleEnabled(server: McpServerSummary) {
    if (toggling) return;
    const nextEnabled = !server.enabled;

    setToggling(true);
    try {
      const next = await mcpServerSetEnabled({
        workspace_id: workspaceId,
        server_id: server.id,
        enabled: nextEnabled,
      });
      if (!next) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }

      setItems((prev) => prev.map((s) => (s.id === next.id ? next : s)));

      logToConsole("info", "切换 MCP Server 生效范围", {
        id: next.id,
        server_key: next.server_key,
        workspace_id: workspaceId,
        enabled: nextEnabled,
      });
      toast(nextEnabled ? "已启用" : "已停用");
    } catch (err) {
      logToConsole("error", "切换 MCP Server 生效范围失败", {
        error: String(err),
        id: server.id,
        workspace_id: workspaceId,
      });
      toast(`操作失败：${String(err)}`);
    } finally {
      setToggling(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const ok = await mcpServerDelete(target.id);
      if (!ok) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      setItems((prev) => prev.filter((s) => s.id !== target.id));
      logToConsole("info", "删除 MCP Server", { id: target.id, server_key: target.server_key });
      toast("已删除");
      setDeleteTarget(null);
    } catch (err) {
      logToConsole("error", "删除 MCP Server 失败", { error: String(err), id: target.id });
      toast(`删除失败：${String(err)}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">
            {loading ? "加载中…" : `共 ${items.length} 条`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setEditTarget(null);
              setDialogOpen(true);
            }}
            variant="primary"
          >
            添加 MCP
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-600">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-600">
          暂无 MCP 服务。点击右上角「添加 MCP」创建第一条。
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((server) => (
            <McpServerCard
              key={server.id}
              server={server}
              toggling={toggling}
              onToggleEnabled={toggleEnabled}
              onEdit={(next) => {
                setEditTarget(next);
                setDialogOpen(true);
              }}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <McpServerDialog
        open={dialogOpen}
        editTarget={editTarget}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
        onSaved={refresh}
      />

      <McpDeleteDialog
        target={deleteTarget}
        deleting={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
