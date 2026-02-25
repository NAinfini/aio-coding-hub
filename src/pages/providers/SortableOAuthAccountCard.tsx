import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LogIn, Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { OAuthAccountSummary } from "../../services/oauthAccounts";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { cn } from "../../utils/cn";
import { formatUnixSeconds } from "../../utils/formatters";

export type SortableOAuthAccountCardProps = {
  account: OAuthAccountSummary;
  onPickAccount?: (account: OAuthAccountSummary) => void;
  pickLabel: string;
  onBrowserLogin: (account: OAuthAccountSummary) => void;
  onForceRefresh: (account: OAuthAccountSummary) => void;
  onEdit: (account: OAuthAccountSummary) => void;
  onDelete: (account: OAuthAccountSummary) => void;
  browserLoginPending: boolean;
  refreshPending: boolean;
  editPending: boolean;
  deletePending: boolean;
};

function statusText(status: OAuthAccountSummary["status"]) {
  if (status === "active") return "可用";
  if (status === "disabled") return "停用";
  if (status === "expired") return "已过期";
  if (status === "error") return "异常";
  return status;
}

function statusClassName(status: OAuthAccountSummary["status"]) {
  if (status === "active")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "disabled")
    return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  return "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
}

export function SortableOAuthAccountCard({
  account,
  onPickAccount,
  pickLabel,
  onBrowserLogin,
  onForceRefresh,
  onEdit,
  onDelete,
  browserLoginPending,
  refreshPending,
  editPending,
  deletePending,
}: SortableOAuthAccountCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <Card
        padding="sm"
        className={cn(
          "flex cursor-grab flex-col gap-2 transition-shadow duration-200 active:cursor-grabbing sm:flex-row sm:items-center sm:justify-between",
          isDragging && "z-10 scale-[1.02] shadow-lg ring-2 ring-accent/30"
        )}
        {...attributes}
        {...listeners}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="inline-flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
            ⠿
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{account.label}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px]",
                  statusClassName(account.status)
                )}
              >
                {statusText(account.status)}
              </span>
              <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                {account.expires_at ? formatUnixSeconds(account.expires_at) : "过期未知"}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px]",
                  account.quota_exceeded
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-slate-50 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                )}
              >
                {account.quota_exceeded
                  ? `受限至 ${account.quota_recover_at ? formatUnixSeconds(account.quota_recover_at) : "未知"}`
                  : "正常"}
              </span>
            </div>
            {account.email ? (
              <div className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                {account.email}
              </div>
            ) : null}
            {account.last_error ? (
              <div className="mt-1 truncate text-xs text-rose-600 dark:text-rose-300">
                {account.last_error}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onPickAccount ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onPickAccount(account)}
              disabled={account.status !== "active"}
            >
              {pickLabel}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onBrowserLogin(account)}
            disabled={browserLoginPending}
          >
            <LogIn className="h-4 w-4" />
            {browserLoginPending ? "登录中…" : "浏览器登录"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onForceRefresh(account)}
            disabled={refreshPending}
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onEdit(account)}
            disabled={editPending}
          >
            <Pencil className="h-4 w-4" />
            编辑
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => onDelete(account)}
            disabled={deletePending}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </Button>
        </div>
      </Card>
    </div>
  );
}
