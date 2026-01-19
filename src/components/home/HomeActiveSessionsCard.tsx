// Usage:
// - Render in `HomeOverviewPanel` left column below work status to show active sessions list.

import { useMemo } from "react";
import { cliBadgeTone, cliShortLabel } from "../../constants/clis";
import type { GatewayActiveSession } from "../../services/gateway";
import { Card } from "../../ui/Card";
import { cn } from "../../utils/cn";
import { formatDurationMs, formatInteger, formatUsd } from "../../utils/formatters";
import { DollarSign } from "lucide-react";

export type HomeActiveSessionsCardProps = {
  activeSessions: GatewayActiveSession[];
  activeSessionsLoading: boolean;
  activeSessionsAvailable: boolean | null;
};

export function HomeActiveSessionsCard({
  activeSessions,
  activeSessionsLoading,
  activeSessionsAvailable,
}: HomeActiveSessionsCardProps) {
  const activeSessionsSorted = useMemo(() => {
    return activeSessions
      .slice()
      .sort((a, b) => b.expires_at - a.expires_at || a.session_id.localeCompare(b.session_id));
  }, [activeSessions]);

  const visibleActiveSessions = useMemo(
    () => activeSessionsSorted.slice(0, 8),
    [activeSessionsSorted]
  );
  const extraActiveSessionCount = Math.max(
    0,
    activeSessionsSorted.length - visibleActiveSessions.length
  );

  return (
    <Card padding="sm" className="flex flex-col lg:min-h-0 lg:flex-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">活跃 Session</div>
        <div className="text-xs text-slate-400">{activeSessions.length}</div>
      </div>

      {activeSessionsLoading ? (
        <div className="mt-2 text-sm text-slate-600">加载中…</div>
      ) : activeSessionsAvailable === false ? (
        <div className="mt-2 text-sm text-slate-600">仅在 Tauri Desktop 环境可用</div>
      ) : activeSessions.length === 0 ? (
        <div className="mt-2 text-sm text-slate-600">暂无活跃 Session。</div>
      ) : (
        <div className="mt-3 space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
          {visibleActiveSessions.map((row) => {
            const providerLabel =
              row.provider_name && row.provider_name !== "Unknown" ? row.provider_name : "未知";

            return (
              <div
                key={`${row.cli_key}:${row.session_id}`}
                className="flex-1 rounded-xl border border-slate-200/60 bg-slate-50/50 px-3 py-2 shadow-sm transition-all duration-200 hover:bg-slate-100 hover:border-accent/20"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-700">
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          cliBadgeTone(row.cli_key)
                        )}
                      >
                        {cliShortLabel(row.cli_key)}
                      </span>
                      <span className="font-mono text-xs text-slate-400">{row.session_suffix}</span>
                      <span className="truncate max-w-[150px]">{providerLabel}</span>
                    </div>

                    <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm">
                      <DollarSign className="h-3 w-3 text-slate-400" />
                      <span className="font-mono font-medium text-slate-700">
                        {formatUsd(row.total_cost_usd)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-x-4 text-[10px] font-mono text-slate-500">
                    <span>请求</span>
                    <span>输入</span>
                    <span>输出</span>
                    <span>耗时</span>
                    <span className="tabular-nums">{formatInteger(row.request_count)}</span>
                    <span className="tabular-nums">{formatInteger(row.total_input_tokens)}</span>
                    <span className="tabular-nums">{formatInteger(row.total_output_tokens)}</span>
                    <span className="tabular-nums">{formatDurationMs(row.total_duration_ms)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {extraActiveSessionCount > 0 ? (
            <div className="text-xs text-slate-400">+{extraActiveSessionCount} 个</div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
