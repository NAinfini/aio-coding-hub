// Usage:
// - 链路 tooltip 的富文本内容组件，展示请求路径概览 + 每个 provider 的尝试详情。
// - 由 `buildRequestRouteMeta` 在 HomeLogShared.tsx 中调用。
// - skipped 的 provider 不在 hops 中，仅通过标签 [跳过*N] 提示。

import type { RequestLogRouteHop } from "../../services/requestLogs";
import { cn } from "../../utils/cn";
import { getErrorCodeLabel } from "./HomeLogShared";

type RouteTooltipContentProps = {
  hops: RequestLogRouteHop[];
  finalStatus: number | null;
};

function resolveProviderName(raw: string | undefined | null): string {
  const trimmed = raw?.trim();
  return !trimmed || trimmed === "Unknown" ? "未知" : trimmed;
}

export function RouteTooltipContent({ hops, finalStatus }: RouteTooltipContentProps) {
  if (hops.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 py-0.5">
      {/* 请求路径概览: A → B → C */}
      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-200">
        <span className="text-slate-400 shrink-0">路径</span>
        <span className="flex items-center gap-1 flex-wrap">
          {hops.map((hop, idx) => {
            const name = resolveProviderName(hop.provider_name);
            return (
              <span key={idx} className="flex items-center gap-1">
                {idx > 0 && <span className="text-slate-500">→</span>}
                <span className="text-white">{name}</span>
              </span>
            );
          })}
        </span>
      </div>

      {/* 分隔线 */}
      <div className="border-t border-slate-700" />

      {/* 每个 provider 详情 */}
      <div className="flex flex-col gap-1.5">
        {hops.map((hop, idx) => (
          <RouteHopRow
            key={`${hop.provider_id}-${idx}`}
            hop={hop}
            isLast={idx === hops.length - 1}
            finalStatus={finalStatus}
            index={idx}
            totalHops={hops.length}
          />
        ))}
      </div>
    </div>
  );
}

// ── 单个 hop 行 ──────────────────────────────────────────────

type RouteHopRowProps = {
  hop: RequestLogRouteHop;
  index: number;
  isLast: boolean;
  finalStatus: number | null;
  totalHops: number;
};

function RouteHopRow({ hop, index, isLast, finalStatus, totalHops }: RouteHopRowProps) {
  const providerName = resolveProviderName(hop.provider_name);
  const status = hop.status ?? (isLast ? finalStatus : null) ?? null;
  const attemptCount = hop.attempts ?? 1;
  const errorCode = hop.error_code ?? null;
  const errorLabel = errorCode ? getErrorCodeLabel(errorCode) : null;

  const statusLabel = hop.ok ? "成功" : attemptCount > 1 ? `失败${attemptCount}次` : "失败";

  const statusTone = hop.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300";

  const dotTone = hop.ok
    ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
    : "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30";

  return (
    <div className="flex items-start gap-2">
      {/* 序号圆点 + 连接线 */}
      <div className="flex flex-col items-center shrink-0 pt-0.5">
        <span
          className={cn(
            "inline-flex items-center justify-center h-4 w-4 rounded-full text-[9px] font-bold",
            dotTone
          )}
        >
          {index + 1}
        </span>
        {!isLast && totalHops > 1 && <div className="w-px h-3 bg-slate-600 mt-0.5" />}
      </div>

      {/* 内容 */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {/* Provider 名称 + 状态标签 */}
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-[11px] text-white truncate">{providerName}</span>
          <span
            className={cn(
              "inline-flex items-center rounded px-1 py-px text-[10px] font-medium shrink-0",
              statusTone
            )}
          >
            {statusLabel}
          </span>
        </div>

        {/* 状态码 + 错误码 */}
        {(status != null || errorLabel) && (
          <div className="flex items-center gap-1.5 text-[10px]">
            {status != null && (
              <span className={cn("font-mono", hop.ok ? "text-emerald-400" : "text-rose-400")}>
                {status}
              </span>
            )}
            {errorLabel && <span className="text-amber-400">{errorLabel}</span>}
            {hop.decision && <span className="text-slate-500">{hop.decision}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
