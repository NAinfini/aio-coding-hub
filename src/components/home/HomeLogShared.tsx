// Usage:
// - Import helpers/components from this module for Home "request logs" list and "realtime traces" cards.
// - Designed to keep status badge / error_code label / session reuse tooltip consistent across the Home page.

import { GatewayErrorCodes } from "../../constants/gatewayErrorCodes";
import type { CliKey } from "../../services/providers";
import type { RequestLogRouteHop } from "../../services/requestLogs";
import { Tooltip } from "../../ui/Tooltip";

const ERROR_CODE_LABELS: Record<string, string> = {
  [GatewayErrorCodes.ALL_PROVIDERS_UNAVAILABLE]: "全部不可用",
  [GatewayErrorCodes.UPSTREAM_ALL_FAILED]: "全部失败",
  [GatewayErrorCodes.NO_ENABLED_PROVIDER]: "无供应商",
  [GatewayErrorCodes.UPSTREAM_TIMEOUT]: "上游超时",
  [GatewayErrorCodes.UPSTREAM_CONNECT_FAILED]: "连接失败",
  [GatewayErrorCodes.UPSTREAM_5XX]: "上游5XX",
  [GatewayErrorCodes.UPSTREAM_4XX]: "上游4XX",
  [GatewayErrorCodes.UPSTREAM_READ_ERROR]: "读取错误",
  [GatewayErrorCodes.STREAM_ERROR]: "流错误",
  [GatewayErrorCodes.STREAM_ABORTED]: "流中断",
  [GatewayErrorCodes.STREAM_IDLE_TIMEOUT]: "流空闲超时",
  [GatewayErrorCodes.REQUEST_ABORTED]: "请求中断",
  [GatewayErrorCodes.INTERNAL_ERROR]: "内部错误",
  [GatewayErrorCodes.BODY_TOO_LARGE]: "请求过大",
  [GatewayErrorCodes.INVALID_CLI_KEY]: "无效CLI",
  [GatewayErrorCodes.INVALID_BASE_URL]: "无效URL",
  [GatewayErrorCodes.PORT_IN_USE]: "端口占用",
  [GatewayErrorCodes.RESPONSE_BUILD_ERROR]: "响应构建错误",
  [GatewayErrorCodes.PROVIDER_RATE_LIMITED]: "供应商限额",
  [GatewayErrorCodes.PROVIDER_CIRCUIT_OPEN]: "供应商熔断",
};

const CLIENT_ABORT_ERROR_CODES: ReadonlySet<string> = new Set([
  GatewayErrorCodes.STREAM_ABORTED,
  GatewayErrorCodes.REQUEST_ABORTED,
]);

const SESSION_REUSE_TOOLTIP =
  "同一 session_id 在 5 分钟 TTL 内优先复用上一次成功 provider，减少抖动/提升缓存命中";

export function getErrorCodeLabel(errorCode: string) {
  return ERROR_CODE_LABELS[errorCode] ?? errorCode;
}

export function SessionReuseBadge({ showCustomTooltip }: { showCustomTooltip: boolean }) {
  const className =
    "inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400 cursor-help";
  return showCustomTooltip ? (
    <Tooltip content={SESSION_REUSE_TOOLTIP}>
      <span className={className}>会话复用</span>
    </Tooltip>
  ) : (
    <span className={className} title={SESSION_REUSE_TOOLTIP}>
      会话复用
    </span>
  );
}

export type StatusBadge = {
  text: string;
  tone: string;
  title?: string;
  isError: boolean;
  isClientAbort: boolean;
  hasFailover: boolean;
};

export function computeStatusBadge(input: {
  status: number | null;
  errorCode: string | null;
  inProgress?: boolean;
  hasFailover?: boolean;
}): StatusBadge {
  if (input.inProgress) {
    return {
      text: "进行中",
      tone: "bg-accent/10 text-accent",
      isError: false,
      isClientAbort: false,
      hasFailover: !!input.hasFailover,
    };
  }

  const isClientAbort = !!(input.errorCode && CLIENT_ABORT_ERROR_CODES.has(input.errorCode));
  const isError = input.status != null ? input.status >= 400 : input.errorCode != null;
  const hasFailover = !!input.hasFailover;

  const text = input.status == null ? "—" : String(input.status);
  const tone = isClientAbort
    ? "bg-amber-50 text-amber-600 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/60"
    : input.status != null && input.status >= 200 && input.status < 400
      ? hasFailover
        ? "text-emerald-600 bg-emerald-50/50 border border-amber-300/60 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-amber-600/60"
        : "text-emerald-600 bg-emerald-50/50 dark:text-emerald-400 dark:bg-emerald-900/30"
      : isError
        ? "text-rose-600 bg-rose-50/50 dark:text-rose-400 dark:bg-rose-900/30"
        : "text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-slate-700";

  const title = input.errorCode
    ? `${getErrorCodeLabel(input.errorCode)} (${input.errorCode})`
    : undefined;

  return { text, tone, title, isError, isClientAbort, hasFailover };
}

export function computeEffectiveInputTokens(
  cliKey: CliKey | string,
  inputTokens: number | null,
  cacheReadInputTokens: number | null
) {
  if (inputTokens == null) return null;
  const cacheRead = cacheReadInputTokens ?? 0;
  if (cliKey === "codex" || cliKey === "gemini") return Math.max(inputTokens - cacheRead, 0);
  return inputTokens;
}

export function buildRequestRouteMeta(input: {
  route: RequestLogRouteHop[] | null | undefined;
  status: number | null;
  hasFailover: boolean;
  attemptCount: number;
}) {
  const hops = input.route ?? [];
  if (hops.length === 0) {
    return {
      hasRoute: false,
      label: "链路",
      tooltipText: null as string | null,
    };
  }

  const tooltipText = hops
    .map((hop, idx) => {
      const rawProviderName = hop.provider_name?.trim();
      const providerName =
        !rawProviderName || rawProviderName === "Unknown" ? "未知" : rawProviderName;
      const status = hop.status ?? (idx === hops.length - 1 ? input.status : null) ?? null;
      const statusText = status == null ? "—" : String(status);
      if (hop.ok) return `${providerName}(${statusText})`;
      const errorCode = hop.error_code ?? null;
      const errorLabel = errorCode ? getErrorCodeLabel(errorCode) : "失败";
      return `${providerName}(${statusText} ${errorLabel})`;
    })
    .join("→");

  const shouldShowFailoverCount = input.hasFailover && input.attemptCount > 1;
  const label = shouldShowFailoverCount ? `链路[降级*${input.attemptCount}]` : "链路";

  return {
    hasRoute: true,
    label,
    tooltipText,
  };
}
