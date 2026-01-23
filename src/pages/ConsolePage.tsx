// Usage: Runtime log console. Shows in-memory app logs (time / level / title) with optional on-demand details.
// Request log details are persisted separately and should not be displayed here.

import { memo, useEffect, useRef, useState } from "react";
import {
  clearConsoleLogs,
  formatConsoleLogDetails,
  getConsoleDebugEnabled,
  setConsoleDebugEnabled,
  type ConsoleLogEntry,
  useConsoleLogs,
} from "../services/consoleLog";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { Switch } from "../ui/Switch";
import { cn } from "../utils/cn";

function levelText(level: ConsoleLogEntry["level"]) {
  switch (level) {
    case "error":
      return "ERROR";
    case "warn":
      return "WARN";
    case "debug":
      return "DEBUG";
    default:
      return "INFO";
  }
}

function getLevelBadgeStyles(level: ConsoleLogEntry["level"]) {
  switch (level) {
    case "error":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "warn":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "debug":
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    default:
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }
}

const ROW_GRID_CLASS = "grid grid-cols-[150px_72px_1fr_20px] gap-2";

const ConsoleLogRow = memo(function ConsoleLogRow({ entry }: { entry: ConsoleLogEntry }) {
  const hasDetails = entry.details !== undefined;
  const [detailsText, setDetailsText] = useState<string | null>(null);

  const row = (
    <div
      className={cn(
        ROW_GRID_CLASS,
        "items-center px-4 py-3 group-hover:bg-slate-800/40 transition-colors duration-200"
      )}
    >
      <span className="shrink-0 text-slate-500 font-mono text-[11px]">{entry.tsText}</span>
      <div className="flex items-center">
        <span
          className={cn(
            "shrink-0 font-medium text-[10px] px-1.5 py-0.5 rounded-md inline-flex items-center justify-center border",
            getLevelBadgeStyles(entry.level)
          )}
        >
          {levelText(entry.level)}
        </span>
      </div>
      <span className="min-w-0 whitespace-pre-wrap break-words text-slate-300 text-[13px] leading-relaxed font-normal">
        {entry.title}
      </span>
      <span className="flex justify-end text-slate-600 group-open:text-slate-400 transition-colors duration-200">
        {hasDetails ? (
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-open:rotate-90" />
        ) : null}
      </span>
    </div>
  );

  if (!hasDetails) {
    return (
      <div className="group border-b border-white/5 transition-colors duration-200">{row}</div>
    );
  }

  return (
    <details
      className="group border-b border-white/5 transition-colors duration-200"
      onToggle={(e) => {
        if (!e.currentTarget.open) return;
        if (detailsText != null) return;
        const next = formatConsoleLogDetails(entry.details);
        setDetailsText(next ?? "");
      }}
    >
      <summary
        className={cn(
          "block cursor-pointer select-none outline-none transition-colors duration-200",
          "list-none [&::-webkit-details-marker]:hidden [&::marker]:content-none",
          "focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-inset"
        )}
      >
        {row}
      </summary>
      <div className={cn(ROW_GRID_CLASS, "px-4 pb-4 pt-0")}>
        <div className="col-start-3 col-span-2">
          <pre className="custom-scrollbar max-h-60 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-400 font-mono border border-white/5 mx-1">
            {detailsText == null ? "加载中…" : detailsText ? detailsText : "// 无可显示的详情"}
          </pre>
        </div>
      </div>
    </details>
  );
});

export function ConsolePage() {
  const logs = useConsoleLogs();
  const [autoScroll, setAutoScroll] = useState(true);
  const [debugEnabled, setDebugEnabled] = useState(() => getConsoleDebugEnabled());
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  const visibleLogs = debugEnabled ? logs : logs.filter((entry) => entry.level !== "debug");
  const hiddenCount = logs.length - visibleLogs.length;

  function scrollToBottom() {
    const el = logsContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  useEffect(() => {
    if (!autoScroll) return;
    requestAnimationFrame(() => scrollToBottom());
  }, [autoScroll, visibleLogs.length]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="控制台"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">自动滚动</span>
              <Switch checked={autoScroll} onCheckedChange={setAutoScroll} size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">调试日志</span>
              <Switch
                checked={debugEnabled}
                onCheckedChange={(next) => {
                  setConsoleDebugEnabled(next);
                  setDebugEnabled(next);
                  toast(next ? "已开启调试日志" : "已关闭调试日志");
                }}
                size="sm"
              />
            </div>
            <Button
              onClick={() => {
                clearConsoleLogs();
                toast("已清空控制台日志");
              }}
              variant="secondary"
            >
              清空日志
            </Button>
          </div>
        }
      />

      <Card padding="none">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/50 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold text-slate-900">
                日志{" "}
                <span className="ml-1.5 inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                  {visibleLogs.length}
                </span>
              </div>
              {!debugEnabled && hiddenCount > 0 ? (
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <span className="inline-block h-1 w-1 rounded-full bg-slate-400"></span>
                  已隐藏 {hiddenCount} 条调试日志
                </div>
              ) : null}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <svg
                className="h-3.5 w-3.5 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                />
              </svg>
              点击单条日志可展开详情
            </div>
          </div>
        </div>

        <div
          ref={logsContainerRef}
          className={cn(
            "custom-scrollbar max-h-[70vh] overflow-auto",
            "bg-gradient-to-b from-slate-950 to-slate-900 font-mono text-[12px] leading-relaxed text-slate-200",
            "shadow-inner"
          )}
        >
          {visibleLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-3 rounded-full bg-slate-800/50 p-4 border border-slate-700/50">
                <svg
                  className="h-8 w-8 text-slate-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-400">
                {logs.length === 0 ? "暂无日志" : "暂无可显示的日志"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {logs.length === 0 ? "系统日志将在这里显示" : "调整过滤器以查看更多日志"}
              </p>
            </div>
          ) : (
            <div>
              {visibleLogs.map((entry) => (
                <ConsoleLogRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
