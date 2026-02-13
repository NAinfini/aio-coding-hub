import { useSyncExternalStore } from "react";
import { GatewayErrorDescriptions } from "../constants/gatewayErrorCodes";

export const CONSOLE_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type ConsoleLogLevel = (typeof CONSOLE_LOG_LEVELS)[number];

const CONSOLE_LOG_LEVEL_ORDER: Record<ConsoleLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CONSOLE_LOG_MIN_LEVEL_STORAGE_KEY = "aio.consoleLog.minLevel";

function normalizeConsoleLogLevel(value: unknown): ConsoleLogLevel | null {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") return value;
  return null;
}

function readConsoleLogMinLevel(): ConsoleLogLevel {
  if (typeof window === "undefined") return "info";
  try {
    const raw = window.localStorage.getItem(CONSOLE_LOG_MIN_LEVEL_STORAGE_KEY);
    return normalizeConsoleLogLevel(raw) ?? "info";
  } catch {
    return "info";
  }
}

let minLevel: ConsoleLogLevel = readConsoleLogMinLevel();

export function getConsoleLogMinLevel(): ConsoleLogLevel {
  return minLevel;
}

export function setConsoleLogMinLevel(level: ConsoleLogLevel) {
  minLevel = level;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSOLE_LOG_MIN_LEVEL_STORAGE_KEY, level);
  } catch {}
}

export function shouldLogToConsole(level: ConsoleLogLevel): boolean {
  return CONSOLE_LOG_LEVEL_ORDER[level] >= CONSOLE_LOG_LEVEL_ORDER[minLevel];
}

export function getConsoleDebugEnabled(): boolean {
  return minLevel === "debug";
}

export function setConsoleDebugEnabled(enabled: boolean) {
  setConsoleLogMinLevel(enabled ? "debug" : "info");
}

export type ConsoleLogMeta = {
  trace_id?: string;
  cli_key?: string;
  providers?: string[];
  error_code?: string;
};

export type ConsoleLogEntry = {
  id: string;
  ts: number;
  tsText: string;
  level: ConsoleLogLevel;
  title: string;
  details?: unknown;
  meta?: ConsoleLogMeta;
  eventType?: string;
};

type Listener = () => void;

const MAX_ENTRIES = 500;

let entries: ConsoleLogEntry[] = [];
const listeners = new Set<Listener>();
let emitScheduled = false;

function emit() {
  for (const listener of listeners) listener();
}

function scheduleEmit() {
  if (emitScheduled) return;
  emitScheduled = true;
  const run = () => {
    emitScheduled = false;
    emit();
  };
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(run);
    return;
  }
  if (typeof queueMicrotask === "function") {
    queueMicrotask(run);
    return;
  }
  setTimeout(run, 0);
}

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatTsText(ts: number) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("api_key") ||
    k.includes("apikey") ||
    k.includes("base_url") ||
    k.includes("base_origin") ||
    k.includes("authorization") ||
    k === "token" ||
    k.endsWith("_token") ||
    k.endsWith("token")
  );
}

function sanitizeDetails(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null) return value;
  if (depth > 6) return "[Truncated]";

  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDetails(item, seen, depth + 1));
  }

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(input)) {
    out[k] = isSensitiveKey(k) ? "[REDACTED]" : sanitizeDetails(v, seen, depth + 1);
  }

  return out;
}

function redactDetails(value: unknown): unknown | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return sanitizeDetails(value, new WeakSet(), 0);
  } catch {
    return String(value);
  }
}

export function formatConsoleLogDetails(details: unknown): string | undefined {
  if (details === undefined) return undefined;
  if (details === null) return "null";
  if (typeof details === "string") return details;
  if (typeof details === "number" || typeof details === "boolean" || typeof details === "bigint") {
    return String(details);
  }
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function uniqueStrings(values: string[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    set.add(value);
  }
  return Array.from(set);
}

function extractMeta(details: unknown): ConsoleLogMeta | undefined {
  const record = asRecord(details);
  if (!record) return undefined;

  const traceId = normalizeString(record.trace_id ?? record.traceId);
  const cliKey = normalizeString(record.cli_key ?? record.cliKey ?? record.cli);
  const errorCode = normalizeString(record.error_code ?? record.errorCode);

  const providers: string[] = [];

  const directProvider = normalizeString(record.provider_name ?? record.providerName);
  if (directProvider) providers.push(directProvider);

  const attempts = record.attempts;
  if (Array.isArray(attempts)) {
    for (const attempt of attempts) {
      const attemptRecord = asRecord(attempt);
      if (!attemptRecord) continue;
      const attemptProvider = normalizeString(
        attemptRecord.provider_name ?? attemptRecord.providerName
      );
      if (attemptProvider) providers.push(attemptProvider);
    }
  }

  const explicitProviders = record.providers;
  if (Array.isArray(explicitProviders)) {
    for (const p of explicitProviders) {
      const name = normalizeString(p);
      if (name) providers.push(name);
    }
  }

  const meta: ConsoleLogMeta = {};
  if (traceId) meta.trace_id = traceId;
  if (cliKey) meta.cli_key = cliKey;
  if (errorCode) meta.error_code = errorCode;

  const uniqueProviders = uniqueStrings(providers).slice(0, 12);
  if (uniqueProviders.length > 0) meta.providers = uniqueProviders;

  return Object.keys(meta).length > 0 ? meta : undefined;
}

export function logToConsole(
  level: ConsoleLogLevel,
  title: string,
  details?: unknown,
  eventType?: string
) {
  if (!shouldLogToConsole(level)) return;
  const ts = Date.now();
  const detailsRedacted = redactDetails(details);
  const entry: ConsoleLogEntry = {
    id: randomId(),
    ts,
    tsText: formatTsText(ts),
    level,
    title,
    details: detailsRedacted,
    meta: extractMeta(detailsRedacted),
    eventType,
  };

  entries = [...entries, entry].slice(-MAX_ENTRIES);
  scheduleEmit();
}

export function clearConsoleLogs() {
  entries = [];
  scheduleEmit();
}

export function useConsoleLogs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entries,
    () => entries
  );
}

// ---------------------------------------------------------------------------
// Smart detail formatting by event type
// ---------------------------------------------------------------------------

const SEPARATOR = "━━━━━━━━━━━━━━━━━━━━━━━━━━";

function s(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number") return String(value);
  return String(value);
}

function statusLabel(status: unknown): string {
  if (status == null) return "—";
  const code = Number(status);
  if (!Number.isFinite(code)) return String(status);
  if (code >= 200 && code < 300) return `${code} (成功)`;
  if (code >= 400 && code < 500) return `${code} (客户端错误)`;
  if (code >= 500) return `${code} (服务端错误)`;
  return String(code);
}

function errorDesc(code: unknown): { desc: string; suggestion: string } | null {
  if (typeof code !== "string" || !code) return null;
  return GatewayErrorDescriptions[code] ?? null;
}

function formatGatewayRequest(d: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("📋 请求摘要");
  lines.push(SEPARATOR);
  lines.push(`Trace ID:  ${s(d.trace_id)}`);
  lines.push(`CLI:       ${s(d.cli)}`);
  lines.push(`状态码:    ${statusLabel(d.status)}`);

  const dur = d.duration_ms;
  const ttfb = d.ttfb_ms;
  if (dur != null) {
    const ttfbPart = ttfb != null ? ` (TTFB: ${s(ttfb)}ms)` : "";
    lines.push(`耗时:      ${s(dur)}ms${ttfbPart}`);
  }

  const input = d.input_tokens;
  const output = d.output_tokens;
  const total = d.total_tokens;
  if (input != null || output != null || total != null) {
    lines.push(`Token:     输入 ${s(input)} / 输出 ${s(output)} / 总计 ${s(total)}`);
  }

  const tps = d.output_tokens_per_second;
  if (tps != null && typeof tps === "number") {
    lines.push(`输出速度:  ${tps.toFixed(1)} tokens/sec`);
  }

  const cacheRead = d.cache_read_input_tokens;
  const cacheCreate = d.cache_creation_input_tokens;
  if (cacheRead != null || cacheCreate != null) {
    lines.push(`缓存:      读取 ${s(cacheRead)} / 创建 ${s(cacheCreate)}`);
  }

  const attempts = d.attempts;
  if (Array.isArray(attempts) && attempts.length > 0) {
    lines.push("");
    lines.push(`🔄 故障切换路径 (${attempts.length} 次尝试)`);
    for (let i = 0; i < attempts.length; i++) {
      const a = asRecord(attempts[i]);
      if (!a) continue;
      const pName = s(a.provider_name);
      const aStatus = a.status != null ? String(a.status) : "—";
      const outcome = String(a.outcome ?? "");
      const icon = outcome === "success" ? "✓" : "✗";
      const aDur = a.attempt_duration_ms != null ? `(${s(a.attempt_duration_ms)}ms)` : "";
      lines.push(`  #${i}  ${pName}  ${icon} ${aStatus}  ${aDur}`);
    }
  }

  const errCode = d.error_code;
  if (errCode) {
    lines.push("");
    lines.push("⚠️ 错误信息");
    lines.push(`错误码:    ${s(errCode)}`);
    if (d.error_category) lines.push(`错误类别:  ${s(d.error_category)}`);
    const desc = errorDesc(errCode);
    if (desc) {
      lines.push(`说明:      ${desc.desc}`);
      lines.push(`建议:      ${desc.suggestion}`);
    }
  }

  return lines.join("\n");
}

function formatGatewayAttempt(d: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`🔄 故障切换尝试 #${s(d.attempt_index)}`);
  lines.push(SEPARATOR);
  lines.push(`Provider:   ${s(d.provider_name)} (id=${s(d.provider_id)})`);

  const outcome = String(d.outcome ?? "");
  const outcomeLabel = outcome === "success" ? "成功" : "失败";
  const statusPart = d.status != null ? ` (status: ${s(d.status)})` : "";
  lines.push(`结果:       ${outcomeLabel}${statusPart}`);
  if (d.attempt_duration_ms != null) {
    lines.push(`耗时:       ${s(d.attempt_duration_ms)}ms`);
  }

  const csBefore = d.circuit_state_before;
  const csAfter = d.circuit_state_after;
  const failCount = d.circuit_failure_count;
  const failThreshold = d.circuit_failure_threshold;
  if (csBefore != null || csAfter != null) {
    lines.push("");
    lines.push("🔌 熔断器状态");
    if (csBefore != null) {
      lines.push(`  变更前: ${s(csBefore)} (失败 ${s(failCount)}/${s(failThreshold)})`);
    }
    if (csAfter != null) {
      lines.push(`  变更后: ${s(csAfter)} (失败 ${s(failCount)}/${s(failThreshold)})`);
    }
    if (
      typeof failCount === "number" &&
      typeof failThreshold === "number" &&
      failThreshold > 0 &&
      failCount < failThreshold
    ) {
      const remaining = failThreshold - failCount;
      if (remaining <= 2) {
        lines.push(`  ⚠️ 距离熔断阈值还差 ${remaining} 次失败`);
      }
    }
  }

  return lines.join("\n");
}

function formatGatewayCircuit(d: Record<string, unknown>): string {
  const lines: string[] = [];
  const prevState = String(d.prev_state ?? "");
  const nextState = String(d.next_state ?? "");
  const isOpen = nextState === "熔断" || nextState === "OPEN";
  const isClosed = nextState === "正常" || nextState === "CLOSED";

  if (isOpen) {
    lines.push("🔴 熔断器触发");
  } else if (isClosed) {
    lines.push("🟢 熔断器恢复");
  } else {
    lines.push("🔌 熔断器事件");
  }
  lines.push(SEPARATOR);
  lines.push(`Provider:    ${s(d.provider_name)}`);
  lines.push(`状态变更:    ${s(prevState)} → ${s(nextState)}`);
  lines.push(`原因:        ${s(d.reason)}`);

  lines.push("");
  lines.push("📊 详细信息");
  lines.push(`  失败计数:  ${s(d.failure_count)} / ${s(d.failure_threshold)} (阈值)`);

  const openUntil = d.open_until;
  if (openUntil != null && typeof openUntil === "number" && openUntil > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingSec = openUntil - nowSec;
    if (remainingSec > 0) {
      const remainingMin = Math.ceil(remainingSec / 60);
      const recoverTime = new Date(openUntil * 1000);
      const timeStr = `${pad2(recoverTime.getHours())}:${pad2(recoverTime.getMinutes())}`;
      lines.push(`  熔断持续:  约 ${remainingMin} 分钟`);
      lines.push(`  预计恢复:  ${timeStr} (${remainingMin}分钟后)`);
    } else {
      lines.push(`  熔断至:    已到期`);
    }
  }

  if (d.trace_id) lines.push(`  Trace ID:  ${s(d.trace_id)}`);

  if (isOpen) {
    lines.push("");
    lines.push("💡 建议");
    lines.push("  该 Provider 已被熔断，请求将自动路由到其他可用 Provider。");
    lines.push("  如需手动恢复，可在 Provider 管理页面操作。");
  } else if (isClosed) {
    lines.push("");
    lines.push("💡 该 Provider 已恢复正常，将重新参与请求路由。");
  }

  return lines.join("\n");
}

function formatGatewayLog(d: Record<string, unknown>): string {
  const lines: string[] = [];
  const code = String(d.error_code ?? "");
  lines.push(`⚡ 网关事件: ${code || "未知"}`);
  lines.push(SEPARATOR);
  if (d.message) lines.push(`消息:       ${s(d.message)}`);
  if (d.requested_port) lines.push(`请求端口:   ${s(d.requested_port)}`);
  if (d.bound_port) lines.push(`实际端口:   ${s(d.bound_port)}`);

  const desc = errorDesc(code);
  if (desc) {
    lines.push("");
    lines.push("💡 说明");
    lines.push(`  ${desc.suggestion}`);
  }

  return lines.join("\n");
}

function formatGatewayRequestStart(d: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("📤 请求开始");
  lines.push(SEPARATOR);
  lines.push(`Trace ID:  ${s(d.trace_id)}`);
  lines.push(`CLI:       ${s(d.cli)}`);
  lines.push(`方法:      ${s(d.method)}`);
  lines.push(`路径:      ${s(d.path)}`);
  return lines.join("\n");
}

export function formatConsoleLogDetailsSmart(entry: ConsoleLogEntry): string | undefined {
  if (entry.details === undefined) return undefined;

  const record = asRecord(entry.details);
  if (!record) return formatConsoleLogDetails(entry.details);

  switch (entry.eventType) {
    case "gateway:request":
      return formatGatewayRequest(record);
    case "gateway:attempt":
      return formatGatewayAttempt(record);
    case "gateway:circuit":
      return formatGatewayCircuit(record);
    case "gateway:log":
      return formatGatewayLog(record);
    case "gateway:request_start":
      return formatGatewayRequestStart(record);
    default:
      return formatConsoleLogDetails(entry.details);
  }
}
