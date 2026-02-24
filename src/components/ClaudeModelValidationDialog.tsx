import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { logToConsole } from "../services/consoleLog";
import { copyText } from "../services/clipboard";
import { useModelPricesListQuery } from "../query/modelPrices";
import { useProvidersListQuery } from "../query/providers";
import {
  claudeProviderGetApiKeyPlaintext,
  claudeProviderValidateModel,
} from "../services/claudeModelValidation";
import type { ClaudeModelValidationResult } from "../services/claudeModelValidation";
import {
  claudeValidationHistoryClearProvider,
  claudeValidationHistoryList,
  type ClaudeModelValidationRunRow,
} from "../services/claudeModelValidationHistory";
import type { ModelPriceSummary } from "../services/modelPrices";
import { baseUrlPingMs, type ProviderSummary } from "../services/providers";
import {
  DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY,
  buildClaudeValidationRequestJson,
  evaluateClaudeValidation,
  extractTemplateKeyFromRequestJson,
  getClaudeTemplateApplicability,
  getClaudeValidationTemplate,
  listClaudeValidationTemplates,
  type ClaudeValidationTemplateKey,
} from "../services/claudeValidationTemplates";
import {
  buildClaudeModelValidationRequestSnapshotTextFromResult,
  buildClaudeModelValidationRequestSnapshotTextFromWrapper,
} from "../services/claudeModelValidationRequestSnapshot";
import {
  buildClaudeCliMetadataUserId,
  newUuidV4,
  rotateClaudeCliUserIdSession,
} from "../constants/claudeValidation";
import { ClaudeModelValidationResultPanel } from "./ClaudeModelValidationResultPanel";
import { ClaudeModelValidationHistoryStepCard } from "./ClaudeModelValidationHistoryStepCard";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Dialog } from "../ui/Dialog";
import { FormField } from "../ui/FormField";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { TabList } from "../ui/TabList";
import { Textarea } from "../ui/Textarea";
import { cn } from "../utils/cn";
import { formatUnixSeconds } from "../utils/formatters";
import {
  Play,
  Settings2,
  History,
  Trash2,
  RefreshCw,
  Server,
  Network,
  Cpu,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
  Activity,
  Copy,
  FileJson,
} from "lucide-react";

type ClaudeModelValidationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderSummary | null;
};

type SuiteMeta = {
  suiteRunId: string | null;
  suiteStepIndex: number | null;
  suiteStepTotal: number | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObjectSafe(text: string): Record<string, unknown> | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return isPlainObject(obj) ? obj : null;
  } catch {
    return null;
  }
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const int = Math.floor(value);
  return int > 0 ? int : null;
}

function extractSuiteMetaFromRequestJson(requestJson: string): SuiteMeta {
  const obj = parseJsonObjectSafe(requestJson);
  if (!obj) return { suiteRunId: null, suiteStepIndex: null, suiteStepTotal: null };
  return {
    suiteRunId: normalizeNonEmptyString(obj.suite_run_id),
    suiteStepIndex: normalizePositiveInt(obj.suite_step_index),
    suiteStepTotal: normalizePositiveInt(obj.suite_step_total),
  };
}

function getHistoryGroupKey(run: { id: number; request_json: string }): string {
  const meta = extractSuiteMetaFromRequestJson(run.request_json ?? "");
  if (meta.suiteRunId) return `suite:${meta.suiteRunId}`;
  return `run:${run.id}`;
}

/**
 * 判断模型名是否属于 Claude 4+ 系列。
 * 匹配规则：模型名（小写）包含以下任一片段即视为 Claude 4+：
 *   opus-4, sonnet-4, haiku-4
 * 这样可以覆盖 claude-opus-4-5-20250929、claude-sonnet-4-20250514 等所有 4.x 变体。
 */
function isClaude4Plus(model: string): boolean {
  const m = model.toLowerCase();
  return /(?:opus|sonnet|haiku)-4(?:\b|[-_.])/.test(m);
}

function sortClaudeModelsFromPrices(rows: ModelPriceSummary[]) {
  const unique = new Set<string>();
  for (const row of rows) {
    const model = row.model.trim();
    if (!model) continue;
    // 仅保留 Claude 4+ 模型
    if (!isClaude4Plus(model)) continue;
    unique.add(model);
  }

  const priority = (model: string) => {
    const m = model.toLowerCase();
    if (m.startsWith("claude-opus-4-5")) return 0;
    if (m.startsWith("claude-sonnet-4-5")) return 1;
    if (m.includes("opus-4-5")) return 2;
    if (m.includes("sonnet-4-5")) return 3;
    if (m.startsWith("claude-opus")) return 10;
    if (m.startsWith("claude-sonnet")) return 11;
    if (m.startsWith("claude-haiku")) return 12;
    return 50;
  };

  return [...unique].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

type ClaudeModelValidationRunView = ClaudeModelValidationRunRow & {
  parsed_result: ClaudeModelValidationResult | null;
};

type ClaudeValidationSuiteStep = {
  index: number;
  templateKey: ClaudeValidationTemplateKey;
  label: string;
  status: "pending" | "running" | "done" | "error";
  request_json: string;
  result_json: string;
  result: ClaudeModelValidationResult | null;
  error: string | null;
};

type SuiteStepView = {
  index: number;
  total: number;
  templateKey: ClaudeValidationTemplateKey;
  label: string;
  status: "pending" | "running" | "done" | "error" | "missing";
  evaluation: ReturnType<typeof evaluateClaudeValidation>;
  result: ClaudeModelValidationResult | null;
  requestJsonText: string;
  resultJsonText: string;
  sseRawText: string;
  errorText: string | null;
};

function parseClaudeModelValidationResultJson(text: string): ClaudeModelValidationResult | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj as ClaudeModelValidationResult;
  } catch {
    return null;
  }
}

function prettyJsonOrFallback(text: string): string {
  const raw = text.trim();
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function stopDetailsToggle(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function OutcomePill({ pass }: { pass: boolean | null }) {
  if (pass == null) {
    return (
      <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
        未知
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
        pass
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
      )}
    >
      {pass ? "通过" : "不通过"}
    </span>
  );
}

type ClaudeValidationGrade = NonNullable<ReturnType<typeof evaluateClaudeValidation>["grade"]>;

type SuiteSummaryRow = {
  templateKey: ClaudeValidationTemplateKey;
  label: string;
  status: "pending" | "running" | "done" | "error" | "missing";
  evaluation: ReturnType<typeof evaluateClaudeValidation>;
  result: ClaudeModelValidationResult | null;
  errorText: string | null;
};

type SuiteProtocolItem = {
  key: string;
  label: string;
  ok: boolean | null;
  required: boolean;
  detail: string | null;
};

type SuiteSummary = {
  overallPass: boolean | null;
  isRunning: boolean;
  modelName: string;
  stats: {
    total: number;
    done: number;
    pass: number;
    fail: number;
    error: number;
    missing: number;
  };
  grade: ClaudeValidationGrade | null;
  templateRows: Array<{
    templateKey: ClaudeValidationTemplateKey;
    label: string;
    status: SuiteSummaryRow["status"];
    overallPass: boolean | null;
    grade: ClaudeValidationGrade | null;
  }>;
  protocol: SuiteProtocolItem[];
  issues: Array<{ kind: "error" | "warn"; title: string; detail: string | null }>;
  plainText: string;
};

type ValidationDetailsTab = "overview" | "steps" | "debug";

function firstLine(text: string) {
  const t = text.trim();
  if (!t) return "";
  const idx = t.indexOf("\n");
  return idx >= 0 ? t.slice(0, idx).trim() : t;
}

function truncateText(text: string, max = 120) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function suitePickEvidenceGrade(grades: Array<ClaudeValidationGrade | null | undefined>) {
  const order: Record<ClaudeValidationGrade["level"], number> = { A: 0, B: 1, C: 2, D: 3 };
  const normalized = grades.filter((g): g is ClaudeValidationGrade => Boolean(g));
  if (normalized.length === 0) return null;

  // 优先挑选“证据等级”相关的评级，避免被普通模板的“通过/未通过”稀释。
  const evidence = normalized.filter((g) => g.label !== "通过" && g.label !== "未通过");
  const candidates = evidence.length > 0 ? evidence : normalized;

  // 只要出现 D（高风险），优先展示 D（风险优先）。
  const anyD = candidates.find((g) => g.level === "D");
  if (anyD) return anyD;

  // 否则展示最强证据（A > B > C）。
  return candidates.reduce((best, cur) => (order[cur.level] < order[best.level] ? cur : best));
}

type ClaudeValidationTemplateView = ReturnType<typeof getClaudeValidationTemplate>;

function getTemplateDisplayLabel(template: ClaudeValidationTemplateView): string {
  const summary = typeof template.summary === "string" ? template.summary.trim() : "";
  return summary || template.label;
}

function getTemplateDisplayTitle(template: ClaudeValidationTemplateView): string {
  const channel = typeof template.channelLabel === "string" ? template.channelLabel.trim() : "";
  const label = getTemplateDisplayLabel(template);
  return channel ? `${channel} · ${label}` : label;
}

function suiteAggregateOk(values: Array<boolean | null | undefined>): boolean | null {
  if (values.length === 0) return null;
  let hasUnknown = false;
  for (const v of values) {
    if (v === false) return false;
    if (v == null) hasUnknown = true;
  }
  return hasUnknown ? null : true;
}

function suiteTemplateRequiresFlag(
  evaluation: ReturnType<typeof evaluateClaudeValidation>,
  flagKey: string
): boolean {
  const obj = evaluation.template.evaluation as unknown;
  if (!isPlainObject(obj)) return false;
  return (obj as Record<string, unknown>)[flagKey] === true;
}

function suiteSignalString(result: ClaudeModelValidationResult | null, key: string): string | null {
  if (!result) return null;
  const v = isPlainObject(result.signals) ? (result.signals as Record<string, unknown>)[key] : null;
  return normalizeNonEmptyString(v);
}

function suiteSignalBool(result: ClaudeModelValidationResult | null, key: string): boolean | null {
  if (!result) return null;
  const v = isPlainObject(result.signals) ? (result.signals as Record<string, unknown>)[key] : null;
  return typeof v === "boolean" ? v : null;
}

function suiteIsSseParseMode(mode: string | null): boolean | null {
  if (!mode) return null;
  return mode === "sse" || mode === "sse_fallback";
}

function suiteTemplateWantsSignatureTamper(
  evaluation: ReturnType<typeof evaluateClaudeValidation>
) {
  const req = evaluation.template.request as unknown;
  if (!isPlainObject(req)) return false;
  const roundtrip = (req as Record<string, unknown>).roundtrip as unknown;
  if (!isPlainObject(roundtrip)) return false;
  return roundtrip.kind === "signature" && roundtrip.enable_tamper === true;
}

function buildSuiteProtocolItems(rows: SuiteSummaryRow[]): SuiteProtocolItem[] {
  const doneRows = rows.filter((r) => r.status === "done");

  const reverseProxy = (() => {
    const values = doneRows
      .map((r) => r.evaluation.checks.reverseProxy?.ok)
      .filter((v) => v !== undefined);
    const ok = suiteAggregateOk(values);
    const failing = doneRows.find((r) => r.evaluation.checks.reverseProxy?.ok === false);
    return {
      key: "reverse_proxy",
      label: "逆向/反代关键词（高风险）",
      ok,
      required: doneRows.length > 0,
      detail: failing
        ? truncateText(firstLine(failing.evaluation.checks.reverseProxy?.title ?? ""))
        : null,
    } satisfies SuiteProtocolItem;
  })();

  const requestOk = (() => {
    const values = doneRows.map((r) => r.result?.ok).filter((v) => v !== undefined);
    const ok = suiteAggregateOk(values);
    const failing = doneRows.find((r) => r.result?.ok === false);
    return {
      key: "request_ok",
      label: "请求成功（ok=true）",
      ok,
      required: doneRows.length > 0,
      detail: failing
        ? `status=${failing.result?.status ?? "—"}; error=${truncateText(String(failing.result?.error ?? "—"), 120)}`
        : null,
    } satisfies SuiteProtocolItem;
  })();

  const sseParse = (() => {
    const values = doneRows.map((r) =>
      suiteIsSseParseMode(suiteSignalString(r.result, "response_parse_mode"))
    );
    const ok = suiteAggregateOk(values);
    const modes = [
      ...new Set(
        doneRows.map((r) => suiteSignalString(r.result, "response_parse_mode")).filter(Boolean)
      ),
    ];
    return {
      key: "sse_parse_mode",
      label: "SSE 流式解析（response_parse_mode=sse）",
      ok,
      required: doneRows.length > 0,
      detail: modes.length > 0 ? `parse_mode=${modes.join(", ")}` : null,
    } satisfies SuiteProtocolItem;
  })();

  const streamRead = (() => {
    const values = doneRows.map((r) => {
      const hasErr = suiteSignalBool(r.result, "stream_read_error");
      if (hasErr == null) return null;
      return !hasErr;
    });
    const ok = suiteAggregateOk(values);
    const failing = doneRows.find((r) => suiteSignalBool(r.result, "stream_read_error") === true);
    const msg = failing ? suiteSignalString(failing.result, "stream_read_error_message") : null;
    return {
      key: "stream_read_error",
      label: "SSE 读取无中断（stream_read_error=false）",
      ok,
      required: doneRows.length > 0,
      detail: msg ? truncateText(firstLine(msg), 120) : null,
    } satisfies SuiteProtocolItem;
  })();

  const byRequiredFlag = (
    key: string,
    label: string,
    flagKey: string,
    readOk: (row: SuiteSummaryRow) => boolean | null | undefined,
    detailOf: (row: SuiteSummaryRow) => string | null
  ): SuiteProtocolItem => {
    const relevant = rows.filter((r) => suiteTemplateRequiresFlag(r.evaluation, flagKey));
    const required = relevant.length > 0;
    const values = relevant.map((r) => (r.status === "done" ? readOk(r) : null));
    const ok = suiteAggregateOk(values);
    const failing = relevant.find((r) => r.status === "done" && readOk(r) === false);
    return {
      key,
      label,
      ok,
      required,
      detail: failing ? truncateText(firstLine(detailOf(failing) ?? ""), 120) : null,
    };
  };

  const modelConsistency = byRequiredFlag(
    "model_consistency",
    "模型一致（requested_model==responded_model）",
    "requireModelConsistency",
    (r) => r.evaluation.derived.modelConsistency,
    (r) => r.evaluation.checks.modelConsistency?.title ?? null
  );

  const outputTokens = (() => {
    const relevant = rows.filter((r) => r.templateKey === "official_max_tokens_5");
    const required = relevant.length > 0;
    const values = relevant.map((r) =>
      r.status === "done" ? r.evaluation.checks.outputTokens?.ok : null
    );
    const ok = suiteAggregateOk(values);
    const failing = relevant.find(
      (r) => r.status === "done" && r.evaluation.checks.outputTokens?.ok === false
    );
    return {
      key: "max_tokens_output_tokens",
      label: "max_tokens 生效（usage.output_tokens）",
      ok,
      required,
      detail: failing
        ? truncateText(firstLine(failing.evaluation.checks.outputTokens?.title ?? ""), 120)
        : null,
    } satisfies SuiteProtocolItem;
  })();

  const thinkingOutput = byRequiredFlag(
    "thinking_output",
    "Extended Thinking（thinking block）",
    "requireThinkingOutput",
    (r) => r.evaluation.checks.thinkingOutput?.ok,
    (r) => r.evaluation.checks.thinkingOutput?.title ?? null
  );

  const signature = byRequiredFlag(
    "signature",
    "Signature（step1）",
    "requireSignature",
    (r) => r.evaluation.checks.signature?.ok,
    (r) => r.evaluation.checks.signature?.title ?? null
  );

  const signatureRoundtrip = byRequiredFlag(
    "signature_roundtrip",
    "Signature 回传验证（Step2）",
    "requireSignatureRoundtrip",
    (r) => r.evaluation.checks.signatureRoundtrip?.ok,
    (r) => r.evaluation.checks.signatureRoundtrip?.title ?? null
  );

  const crossProviderSignature = byRequiredFlag(
    "cross_provider_signature",
    "跨供应商 Signature（Step3）",
    "requireCrossProviderSignatureRoundtrip",
    (r) => r.evaluation.checks.crossProviderSignatureRoundtrip?.ok,
    (r) => r.evaluation.checks.crossProviderSignatureRoundtrip?.title ?? null
  );

  const thinkingPreserved = byRequiredFlag(
    "thinking_preserved",
    "Thinking 跨步骤保留（Step3）",
    "requireThinkingPreserved",
    (r) => r.evaluation.checks.thinkingPreserved?.ok,
    (r) => r.evaluation.checks.thinkingPreserved?.title ?? null
  );

  const responseId = byRequiredFlag(
    "response_id",
    "response.id",
    "requireResponseId",
    (r) => r.evaluation.checks.responseId?.ok,
    (r) => r.evaluation.checks.responseId?.title ?? null
  );

  const serviceTier = byRequiredFlag(
    "service_tier",
    "service_tier",
    "requireServiceTier",
    (r) => r.evaluation.checks.serviceTier?.ok,
    (r) => r.evaluation.checks.serviceTier?.title ?? null
  );

  const outputConfig = byRequiredFlag(
    "output_config",
    "Output Config（缓存/服务层级）",
    "requireOutputConfig",
    (r) => r.evaluation.checks.outputConfig?.ok,
    (r) => r.evaluation.checks.outputConfig?.title ?? null
  );

  const toolSupport = byRequiredFlag(
    "tool_support",
    "工具能力感知（tool keywords）",
    "requireToolSupport",
    (r) => r.evaluation.checks.toolSupport?.ok,
    (r) => r.evaluation.checks.toolSupport?.title ?? null
  );

  const multiTurn = byRequiredFlag(
    "multi_turn",
    "多轮对话（暗号第一行）",
    "requireMultiTurn",
    (r) => r.evaluation.checks.multiTurn?.ok,
    (r) => r.evaluation.checks.multiTurn?.title ?? null
  );

  const signatureTamper = (() => {
    const relevant = rows.filter(
      (r) =>
        suiteTemplateRequiresFlag(r.evaluation, "requireSignatureRoundtrip") &&
        suiteTemplateWantsSignatureTamper(r.evaluation)
    );
    const values = relevant.map((r) =>
      r.status === "done" ? (r.evaluation.checks.signatureTamper?.ok ?? null) : null
    );
    const ok = suiteAggregateOk(values);
    const failing = relevant.find(
      (r) => r.status === "done" && r.evaluation.checks.signatureTamper?.ok === false
    );
    const unknown = relevant.find(
      (r) => r.status === "done" && r.evaluation.checks.signatureTamper == null
    );
    const unknownDetail = (() => {
      if (!unknown) return null;
      const enabled = suiteSignalBool(unknown.result, "roundtrip_step3_enabled");
      if (enabled === false) return "Step3 未启用（未执行篡改验证）";
      if (enabled === true) return "Step3 已启用，但缺少 rejected 信号（无法判断是否真实验签）";
      return "Step3 信号缺失（无法判断是否真实验签）";
    })();
    return {
      key: "signature_tamper",
      label: "Signature 篡改应被拒绝（Step3）",
      ok,
      required: false,
      detail: failing
        ? truncateText(firstLine(failing.evaluation.checks.signatureTamper?.title ?? ""), 120)
        : unknownDetail,
    } satisfies SuiteProtocolItem;
  })();

  // 顺序：先基础协议，再安全/一致性，再能力项
  return [
    requestOk,
    sseParse,
    streamRead,
    reverseProxy,
    modelConsistency,
    outputTokens,
    responseId,
    serviceTier,
    outputConfig,
    thinkingOutput,
    signature,
    signatureRoundtrip,
    signatureTamper,
    crossProviderSignature,
    thinkingPreserved,
    toolSupport,
    multiTurn,
  ].filter((it) => it.required || it.ok != null || it.detail != null);
}

function buildSuiteSummary(rows: SuiteSummaryRow[], modelNameFallback: string): SuiteSummary {
  const total = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  const error = rows.filter((r) => r.status === "error").length;
  const missing = rows.filter((r) => r.status === "missing").length;
  const isRunning = rows.some((r) => r.status === "pending" || r.status === "running");

  const pass = rows.filter((r) => r.status === "done" && r.evaluation.overallPass === true).length;
  const fail = rows.filter((r) => r.status === "done" && r.evaluation.overallPass === false).length;

  const allFinished = !isRunning && done + error + missing === total;
  const overallPass = allFinished
    ? error === 0 && missing === 0 && fail === 0 && pass === done
    : null;

  const modelName = (() => {
    const preferred = rows
      .filter((r) => r.status === "done")
      .map((r) => r.evaluation.derived.modelName)
      .find((m) => m && m !== "—");
    return preferred ?? (modelNameFallback.trim() ? modelNameFallback.trim() : "—");
  })();

  const grades = rows.filter((r) => r.status === "done").map((r) => r.evaluation.grade);
  const grade = suitePickEvidenceGrade(grades);

  const protocol = buildSuiteProtocolItems(rows);

  const issues: SuiteSummary["issues"] = [];
  if (missing > 0) {
    const missingLabels = rows
      .filter((r) => r.status === "missing")
      .map((r) => r.label)
      .slice(0, 4);
    issues.push({
      kind: "error",
      title: `历史缺失步骤：${missing}/${total}`,
      detail: missingLabels.length > 0 ? `缺失：${missingLabels.join("；")}` : null,
    });
  }
  for (const r of rows) {
    if (r.status !== "error") continue;
    issues.push({
      kind: "error",
      title: `模板执行失败：${r.label}`,
      detail: r.errorText ? truncateText(firstLine(r.errorText), 160) : null,
    });
  }
  for (const item of protocol) {
    if (!item.required) continue;
    if (item.ok === false) {
      issues.push({ kind: "error", title: `协议不满足：${item.label}`, detail: item.detail });
    } else if (item.ok == null && allFinished && missing === 0 && error === 0) {
      issues.push({ kind: "warn", title: `协议无法判断：${item.label}`, detail: item.detail });
    }
  }
  const tamper = protocol.find((p) => p.key === "signature_tamper");
  if (tamper && tamper.ok === false) {
    issues.push({ kind: "warn", title: `强信号异常：${tamper.label}`, detail: tamper.detail });
  }

  const templateRows: SuiteSummary["templateRows"] = rows.map((r) => ({
    templateKey: r.templateKey,
    label: r.label,
    status: r.status,
    overallPass: r.status === "done" ? r.evaluation.overallPass : null,
    grade: r.status === "done" ? r.evaluation.grade : null,
  }));

  const plainText = (() => {
    const lines: string[] = [];
    const protocolText = isRunning
      ? "执行中"
      : overallPass === true
        ? "通过"
        : overallPass === false
          ? "不通过"
          : "未知";
    const evidenceGrade =
      grade && grade.label !== "通过" && grade.label !== "未通过" ? grade : null;

    lines.push("Anthropic Messages API 验证总结（/v1/messages，stream=true）");
    lines.push("");
    lines.push("一、总体结论");
    lines.push(`- 协议兼容性：${protocolText}`);
    if (evidenceGrade) {
      lines.push(
        `- 第一方证据：${evidenceGrade.level} ${evidenceGrade.label}（${evidenceGrade.title}）`
      );
      lines.push(`- 说明：协议“通过”仅表示接口行为符合 /v1/messages，不等价于“第一方证据 A”。`);
    } else if (grade) {
      lines.push(`- 评级：${grade.level} ${grade.label}（${grade.title}）`);
    }
    lines.push(`- 模型：${modelName}`);
    lines.push(
      `- 步骤：完成 ${done}/${total}；通过 ${pass}；未通过 ${fail + error + missing}（fail=${fail}; error=${error}; missing=${missing}）`
    );
    lines.push("");
    lines.push("二、关键检查点（协议/信号）");
    for (const p of protocol) {
      const status = p.ok == null ? "—" : p.ok ? "OK" : "FAIL";
      lines.push(
        `- ${p.label}${p.required ? "" : "（参考）"}：${status}${p.detail ? `；${p.detail}` : ""}`
      );
    }
    if (issues.length > 0) {
      lines.push("");
      lines.push("未通过/风险：");
      for (const it of issues.slice(0, 8)) {
        lines.push(
          `- ${it.kind === "error" ? "ERROR" : "WARN"}：${it.title}${it.detail ? `；${it.detail}` : ""}`
        );
      }
    }
    return lines.join("\n");
  })();

  return {
    overallPass,
    isRunning,
    modelName,
    stats: { total, done, pass, fail, error, missing },
    grade,
    templateRows,
    protocol,
    issues,
    plainText,
  };
}

function SuiteSummaryCard({
  summary,
  copyText,
}: {
  summary: SuiteSummary;
  copyText: (text: string, okMessage: string) => Promise<void> | void;
}) {
  const protocolBadge = (() => {
    if (summary.isRunning) {
      return {
        text: "协议：执行中",
        cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
      };
    }
    if (summary.overallPass === true) {
      return {
        text: "协议：通过",
        cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      };
    }
    if (summary.overallPass === false) {
      return {
        text: "协议：不通过",
        cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
      };
    }
    return {
      text: "协议：未知",
      cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
    };
  })();

  const metaLine = (() => {
    const nonPass = summary.stats.fail + summary.stats.error + summary.stats.missing;
    const parts = [
      `模型 ${summary.modelName}`,
      `完成 ${summary.stats.done}/${summary.stats.total}`,
      `通过 ${summary.stats.pass}`,
      `未通过 ${nonPass}`,
    ];
    if (summary.stats.missing > 0) parts.push(`缺失 ${summary.stats.missing}`);
    return parts.join(" · ");
  })();

  const evidenceGrade =
    summary.grade && summary.grade.label !== "通过" && summary.grade.label !== "未通过"
      ? summary.grade
      : null;

  const evidenceBadge = evidenceGrade ? (
    <span
      className={cn(
        "rounded px-2 py-1 text-xs font-semibold",
        evidenceGrade.level === "A"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : evidenceGrade.level === "B"
            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
            : evidenceGrade.level === "C"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
              : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
      )}
      title={evidenceGrade.title}
    >
      证据：{evidenceGrade.level} {evidenceGrade.label}
    </span>
  ) : null;

  const protocolBox = (() => {
    const required = summary.protocol.filter((p) => p.required);
    if (required.length === 0) return null;
    const nonOk = required.filter((p) => p.ok !== true);

    if (nonOk.length === 0) {
      return (
        <div className="rounded-xl border border-emerald-100 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 px-4 py-3">
          <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            协议检查点
          </div>
          <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            全部满足（{required.length}/{required.length}）
          </div>
        </div>
      );
    }

    const shown = nonOk.slice(0, 4);
    const rest = Math.max(0, nonOk.length - shown.length);
    const hasFail = nonOk.some((p) => p.ok === false);
    const boxCls = hasFail
      ? "border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-900/20"
      : "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20";
    const titleCls = hasFail
      ? "text-rose-700 dark:text-rose-300"
      : "text-amber-800 dark:text-amber-200";

    return (
      <div className={cn("rounded-xl border px-4 py-3", boxCls)}>
        <div className={cn("text-xs font-semibold", titleCls)}>协议检查点（未满足/无法判断）</div>
        <div className="mt-2 space-y-1.5">
          {shown.map((p) => (
            <div key={p.key} className="flex items-start gap-2 text-xs">
              {p.ok === false ? (
                <XCircle className="mt-0.5 h-3.5 w-3.5 text-rose-500 shrink-0" />
              ) : (
                <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30" />
              )}
              <div className="min-w-0">
                <div className="text-slate-800 dark:text-slate-200">{p.label}</div>
                {p.detail ? (
                  <div className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                    {p.detail}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {rest > 0 ? (
            <div className="text-[10px] text-slate-600 dark:text-slate-400">
              其余 {rest} 项详见“调试”页。
            </div>
          ) : null}
        </div>
      </div>
    );
  })();

  const evidenceBox = (() => {
    if (!evidenceGrade) return null;
    const keys = new Set([
      "thinking_output",
      "signature",
      "signature_roundtrip",
      "signature_tamper",
      "cross_provider_signature",
      "thinking_preserved",
      "cache_detail",
      "cache_read_hit",
    ]);
    const items = summary.protocol.filter((p) => keys.has(p.key));
    if (items.length === 0) return null;

    const nonOk = items.filter((p) => p.ok !== true);
    if (nonOk.length === 0) {
      return (
        <div className="rounded-xl border border-emerald-100 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 px-4 py-3">
          <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            第一方证据检查点
          </div>
          <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            强证据链路已验证（{items.length}/{items.length}）
          </div>
        </div>
      );
    }

    const shown = nonOk.slice(0, 4);
    const rest = Math.max(0, nonOk.length - shown.length);
    const hasFail = nonOk.some((p) => p.ok === false);
    const boxCls = hasFail
      ? "border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-900/20"
      : "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20";
    const titleCls = hasFail
      ? "text-rose-700 dark:text-rose-300"
      : "text-amber-800 dark:text-amber-200";

    return (
      <div className={cn("rounded-xl border px-4 py-3", boxCls)}>
        <div className={cn("text-xs font-semibold", titleCls)}>
          第一方证据检查点（未满足/无法判断）
        </div>
        <div className="mt-2 space-y-1.5">
          {shown.map((p) => (
            <div key={p.key} className="flex items-start gap-2 text-xs">
              {p.ok === false ? (
                <XCircle className="mt-0.5 h-3.5 w-3.5 text-rose-500 shrink-0" />
              ) : (
                <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30" />
              )}
              <div className="min-w-0">
                <div className="text-slate-800 dark:text-slate-200">{p.label}</div>
                {p.detail ? (
                  <div className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                    {p.detail}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {rest > 0 ? (
            <div className="text-[10px] text-slate-600 dark:text-slate-400">
              其余 {rest} 项详见“调试”页。
            </div>
          ) : null}
        </div>
      </div>
    );
  })();

  const interpretLine = (() => {
    if (!evidenceGrade) return null;
    if (summary.isRunning) {
      return "说明：证据等级会随着 Step2/Step3 探针执行逐步收敛。";
    }
    if (summary.overallPass === true && evidenceGrade.level !== "A") {
      return "说明：协议“通过”只代表 /v1/messages 行为符合；证据等级用于判断是否存在官方第一方链路信号。";
    }
    return null;
  })();

  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              综合结论（Anthropic /v1/messages）
            </div>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{metaLine}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("rounded px-2 py-1 text-xs font-semibold", protocolBadge.cls)}>
            {protocolBadge.text}
          </span>
          {evidenceBadge}
          <Button
            onClick={() => void Promise.resolve(copyText(summary.plainText, "已复制验证总结"))}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="复制总结"
            aria-label="复制总结"
            disabled={!summary.plainText.trim()}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {evidenceGrade ? (
        <div className="text-[11px] text-slate-600 dark:text-slate-400">
          证据解释：{evidenceGrade.title}
        </div>
      ) : null}

      {interpretLine ? (
        <div className="text-[11px] text-slate-500 dark:text-slate-500">{interpretLine}</div>
      ) : null}

      <div className={cn("grid gap-3", evidenceBox ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
        {protocolBox}
        {evidenceBox}
      </div>

      <div className="text-[10px] text-slate-400 dark:text-slate-500">
        更多步骤明细请切到“步骤”，更多诊断信息请切到“调试”页。
      </div>
    </Card>
  );
}

export function ClaudeModelValidationDialog({
  open,
  onOpenChange,
  provider,
}: ClaudeModelValidationDialogProps) {
  const providerRef = useRef(provider);
  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  const [baseUrl, setBaseUrl] = useState("");
  const [baseUrlPicking, setBaseUrlPicking] = useState(false);

  const templates = useMemo(() => listClaudeValidationTemplates(), []);
  const [templateKey, setTemplateKey] = useState<ClaudeValidationTemplateKey>(
    DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY
  );
  const [resultTemplateKey, setResultTemplateKey] = useState<ClaudeValidationTemplateKey>(
    DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY
  );

  const [model, setModel] = useState("claude-sonnet-4-5-20250929");

  const [requestJson, setRequestJson] = useState("");
  const [apiKeyPlaintext, setApiKeyPlaintext] = useState<string | null>(null);

  const [result, setResult] = useState<ClaudeModelValidationResult | null>(null);

  const [validating, setValidating] = useState(false);
  const [suiteSteps, setSuiteSteps] = useState<ClaudeValidationSuiteStep[]>([]);
  const [suiteProgress, setSuiteProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [suiteIssuesOnly, setSuiteIssuesOnly] = useState(false);
  const [suiteActiveStepIndex, setSuiteActiveStepIndex] = useState<number | null>(null);
  const [detailsTab, setDetailsTab] = useState<ValidationDetailsTab>("overview");

  const [historyRuns, setHistoryRuns] = useState<ClaudeModelValidationRunView[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState<boolean | null>(null);
  const [selectedHistoryKey, setSelectedHistoryKey] = useState<string | null>(null);
  const historyReqSeqRef = useRef(0);
  const [historyClearing, setHistoryClearing] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const modelPricesQuery = useModelPricesListQuery("claude", { enabled: open });
  const modelPrices = useMemo<ModelPriceSummary[]>(
    () => (open ? (modelPricesQuery.data ?? []) : []),
    [open, modelPricesQuery.data]
  );
  const modelPricesLoading = open ? modelPricesQuery.isFetching : false;
  const modelOptions = useMemo(() => sortClaudeModelsFromPrices(modelPrices), [modelPrices]);

  // Cross-provider signature validation
  const allClaudeProvidersQuery = useProvidersListQuery("claude", { enabled: open });
  const allClaudeProviders = useMemo<ProviderSummary[]>(
    () => (open ? (allClaudeProvidersQuery.data ?? []) : []),
    [open, allClaudeProvidersQuery.data]
  );
  const [crossProviderId, setCrossProviderId] = useState<number | null>(null);

  // Check if any template requires cross-provider validation
  const hasCrossProviderTemplate = useMemo(
    () =>
      templates.some(
        (t) => (t as unknown as Record<string, unknown>).requiresCrossProvider === true
      ),
    [templates]
  );

  // Available cross-provider options (exclude current provider)
  const crossProviderOptions = useMemo(() => {
    if (!provider) return [];
    return allClaudeProviders.filter((p) => p.id !== provider.id);
  }, [allClaudeProviders, provider]);

  useEffect(() => {
    if (!open) {
      setBaseUrl("");
      setBaseUrlPicking(false);
      setTemplateKey(DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY);
      setResultTemplateKey(DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY);
      setModel("claude-sonnet-4-5-20250929");
      setRequestJson("");
      setApiKeyPlaintext(null);
      setResult(null);
      setValidating(false);
      setSuiteSteps([]);
      setSuiteProgress(null);
      setSuiteIssuesOnly(false);
      setSuiteActiveStepIndex(null);
      setDetailsTab("overview");
      setHistoryRuns([]);
      setHistoryLoading(false);
      setHistoryAvailable(null);
      setSelectedHistoryKey(null);
      historyReqSeqRef.current = 0;
      setHistoryClearing(false);
      setConfirmClearOpen(false);
      setCrossProviderId(null);
      return;
    }

    setTemplateKey(DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY);
    setResultTemplateKey(DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY);
    setModel("claude-sonnet-4-5-20250929");
    setRequestJson("");
    setApiKeyPlaintext(null);
    setResult(null);
    setSuiteSteps([]);
    setSuiteProgress(null);
    setSuiteIssuesOnly(false);
    setSuiteActiveStepIndex(null);
    setDetailsTab("overview");
  }, [open]);

  const providerId = provider?.id ?? null;

  useEffect(() => {
    if (!open || providerId == null) return;
    let cancelled = false;

    claudeProviderGetApiKeyPlaintext(providerId)
      .then((key) => {
        if (cancelled) return;
        setApiKeyPlaintext(typeof key === "string" && key.trim() ? key : null);
      })
      .catch(() => {
        if (cancelled) return;
        setApiKeyPlaintext(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, providerId]);

  function handleOpenChange(nextOpen: boolean) {
    // 防止确认弹层打开时误关主 Dialog（ESC/点遮罩/点右上角关闭等）。
    if (!nextOpen && confirmClearOpen) {
      setConfirmClearOpen(false);
      return;
    }
    onOpenChange(nextOpen);
  }

  async function refreshHistory(options?: {
    selectLatest?: boolean;
    allowAutoSelectWhenNone?: boolean;
  }) {
    const curProvider = providerRef.current;
    if (!open || !curProvider) return;
    const providerId = curProvider.id;

    const reqSeq = (historyReqSeqRef.current += 1);
    setHistoryLoading(true);
    try {
      const rows = await claudeValidationHistoryList({ provider_id: providerId, limit: 50 });
      if (reqSeq !== historyReqSeqRef.current) return;
      if (!rows) {
        setHistoryAvailable(false);
        setHistoryRuns([]);
        setSelectedHistoryKey(null);
        return;
      }

      setHistoryAvailable(true);
      const mapped: ClaudeModelValidationRunView[] = rows.map((r) => ({
        ...r,
        parsed_result: parseClaudeModelValidationResultJson(r.result_json),
      }));
      setHistoryRuns(mapped);

      const nextSelected = (() => {
        const keys = mapped.map((it) => getHistoryGroupKey(it));
        const uniqueKeys = new Set(keys);
        const allowAutoSelectWhenNone =
          typeof options?.allowAutoSelectWhenNone === "boolean"
            ? options.allowAutoSelectWhenNone
            : true;

        if (options?.selectLatest) return keys[0] ?? null;
        if (selectedHistoryKey && uniqueKeys.has(selectedHistoryKey)) return selectedHistoryKey;
        if (!selectedHistoryKey && !allowAutoSelectWhenNone) return null;
        return keys[0] ?? null;
      })();
      setSelectedHistoryKey(nextSelected);
    } catch (err) {
      if (reqSeq !== historyReqSeqRef.current) return;
      logToConsole("error", "Claude 模型验证历史加载失败", { error: String(err) });
      setHistoryAvailable(true);
      setHistoryRuns([]);
      setSelectedHistoryKey(null);
    } finally {
      if (reqSeq === historyReqSeqRef.current) {
        setHistoryLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    if (!providerId) return;
    void refreshHistory({ selectLatest: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, providerId]);

  useEffect(() => {
    if (!open || !provider) return;

    setBaseUrl(provider.base_urls[0] ?? "");
    setBaseUrlPicking(false);

    if (provider.base_url_mode !== "ping") return;
    if (provider.base_urls.length <= 1) return;

    let cancelled = false;
    setBaseUrlPicking(true);

    Promise.all(
      provider.base_urls.map(async (url) => {
        try {
          const ms = await baseUrlPingMs(url);
          return { url, ms };
        } catch {
          return { url, ms: null as number | null };
        }
      })
    )
      .then((rows) => {
        if (cancelled) return;
        const fastest = rows
          .filter((r) => typeof r.ms === "number")
          .sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0))[0];
        if (fastest?.url) {
          setBaseUrl(fastest.url);
        }
      })
      .finally(() => {
        if (cancelled) return;
        setBaseUrlPicking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, provider]);

  async function copyTextOrToast(text: string, okMessage: string) {
    try {
      await copyText(text);
      toast(okMessage);
    } catch (err) {
      logToConsole("error", "复制失败", { error: String(err) });
      toast("复制失败：当前环境不支持剪贴板");
    }
  }

  async function runValidationSuite() {
    if (validating) return;

    const curProvider = providerRef.current;
    if (!open || !curProvider) return;

    if (!baseUrl.trim()) {
      toast("请先选择 Endpoint（Base URL）");
      return;
    }

    const normalizedModel = model.trim();
    if (!normalizedModel) {
      toast("请先填写/选择模型");
      return;
    }

    let apiKeyPlaintextForSnapshot = apiKeyPlaintext;
    if (!apiKeyPlaintextForSnapshot) {
      try {
        const fetched = await claudeProviderGetApiKeyPlaintext(curProvider.id);
        apiKeyPlaintextForSnapshot = typeof fetched === "string" && fetched.trim() ? fetched : null;
        if (apiKeyPlaintextForSnapshot) {
          setApiKeyPlaintext(apiKeyPlaintextForSnapshot);
        }
      } catch {
        // ignore
      }
    }

    const templateApplicability = templates.map((t) => ({
      template: t,
      applicability: getClaudeTemplateApplicability(t, normalizedModel),
    }));
    const skippedTemplates = templateApplicability.filter((t) => !t.applicability.applicable);
    const suiteTemplateKeys = templateApplicability
      .filter((t) => t.applicability.applicable)
      .map((t) => t.template.key);
    const suiteRequiresCrossProvider = templateApplicability.some(
      (t) =>
        t.applicability.applicable &&
        (t.template as unknown as Record<string, unknown>).requiresCrossProvider === true
    );

    if (skippedTemplates.length > 0) {
      const shown = skippedTemplates
        .slice(0, 3)
        .map(
          (t) =>
            `${getTemplateDisplayLabel(t.template)}${
              t.applicability.reason ? `（${t.applicability.reason}）` : ""
            }`
        )
        .join("；");
      const rest = skippedTemplates.length - Math.min(3, skippedTemplates.length);
      toast(
        `已跳过 ${skippedTemplates.length} 个不适用模板：${shown}${rest > 0 ? `；+${rest}` : ""}`
      );
    }

    if (suiteTemplateKeys.length === 0) {
      toast("暂无适用验证模板");
      return;
    }

    if (suiteRequiresCrossProvider) {
      const availableCrossProviders = allClaudeProviders.filter((p) => p.id !== curProvider.id);
      if (availableCrossProviders.length === 0) {
        toast("跨供应商验证需要至少配置 2 个官方供应商");
        return;
      }
      if (!crossProviderId) {
        toast("请先选择跨供应商验证的官方供应商（用于 Step3）");
        return;
      }
      if (crossProviderId === curProvider.id) {
        toast("跨供应商验证必须选择不同于当前服务商的供应商");
        setCrossProviderId(null);
        return;
      }
      if (!availableCrossProviders.some((p) => p.id === crossProviderId)) {
        toast("所选跨供应商无效，请重新选择");
        setCrossProviderId(null);
        return;
      }
    }

    // Cancel any in-flight history refresh (dialog open / manual refresh). Otherwise a late
    // refreshHistory({selectLatest:true}) can switch the right pane into “历史记录详情” mid-suite,
    // making it look like only部分卡片/步骤执行了。
    historyReqSeqRef.current += 1;
    setHistoryLoading(false);

    setValidating(true);
    const suiteRunId = newUuidV4();
    setSelectedHistoryKey(null);
    setSuiteActiveStepIndex(null);
    setSuiteProgress({ current: 0, total: suiteTemplateKeys.length });
    setSuiteSteps(
      suiteTemplateKeys.map((k, idx) => {
        const t = getClaudeValidationTemplate(k);
        return {
          index: idx + 1,
          templateKey: t.key,
          label: getTemplateDisplayLabel(t),
          status: "pending",
          request_json: "",
          result_json: "",
          result: null,
          error: null,
        };
      })
    );
    try {
      for (let idx = 0; idx < suiteTemplateKeys.length; idx += 1) {
        const stepKey = suiteTemplateKeys[idx];
        const stepTemplate = getClaudeValidationTemplate(stepKey);
        setSuiteProgress({ current: idx + 1, total: suiteTemplateKeys.length });

        setSuiteSteps((prev) =>
          prev.map((s) =>
            s.index === idx + 1
              ? { ...s, status: "running", error: null }
              : s.status === "pending"
                ? { ...s }
                : s
          )
        );

        const sessionId = newUuidV4();
        let reqTextToSendWrapper = buildClaudeValidationRequestJson(
          stepTemplate.key,
          normalizedModel,
          null
        );
        try {
          const parsedForSend: unknown = JSON.parse(reqTextToSendWrapper);
          const bodyForSend =
            isPlainObject(parsedForSend) && "body" in parsedForSend
              ? parsedForSend.body
              : parsedForSend;

          if (isPlainObject(bodyForSend)) {
            const nextBody: Record<string, unknown> = { ...bodyForSend };
            const nextMetadata: Record<string, unknown> = isPlainObject(nextBody.metadata)
              ? { ...(nextBody.metadata as Record<string, unknown>) }
              : {};

            const existingUserId =
              typeof nextMetadata.user_id === "string" ? nextMetadata.user_id.trim() : "";
            const rotated = existingUserId
              ? rotateClaudeCliUserIdSession(existingUserId, sessionId)
              : null;
            if (rotated) {
              nextMetadata.user_id = rotated;
            } else if (!existingUserId) {
              nextMetadata.user_id = buildClaudeCliMetadataUserId(sessionId);
            }
            nextBody.metadata = nextMetadata;

            if (isPlainObject(parsedForSend) && "body" in parsedForSend) {
              const nextParsed: Record<string, unknown> = { ...parsedForSend };
              const nextHeaders: Record<string, unknown> = isPlainObject(nextParsed.headers)
                ? { ...(nextParsed.headers as Record<string, unknown>) }
                : {};
              // 用于历史聚合显示：同一次"综合验证"共享同一个 suite_run_id。
              nextParsed.suite_run_id = suiteRunId;
              nextParsed.suite_step_index = idx + 1;
              nextParsed.suite_step_total = suiteTemplateKeys.length;
              nextParsed.headers = nextHeaders;
              nextParsed.body = nextBody;

              // Add cross_provider_id to roundtrip config if template requires it
              const templateRequiresCrossProvider =
                (stepTemplate as unknown as Record<string, unknown>).requiresCrossProvider === true;
              if (
                templateRequiresCrossProvider &&
                crossProviderId &&
                isPlainObject(nextParsed.roundtrip)
              ) {
                nextParsed.roundtrip = {
                  ...(nextParsed.roundtrip as Record<string, unknown>),
                  cross_provider_id: crossProviderId,
                };
              }

              reqTextToSendWrapper = JSON.stringify(nextParsed, null, 2);
            } else {
              reqTextToSendWrapper = JSON.stringify(nextBody, null, 2);
            }
          }
        } catch {
          // ignore
        }

        const preSendRequestSnapshotText =
          buildClaudeModelValidationRequestSnapshotTextFromWrapper({
            baseUrl: baseUrl.trim(),
            wrapperJsonText: reqTextToSendWrapper,
            apiKeyPlaintext: apiKeyPlaintextForSnapshot,
          }) || reqTextToSendWrapper;

        setRequestJson(preSendRequestSnapshotText);

        setSuiteSteps((prev) =>
          prev.map((s) =>
            s.index === idx + 1 ? { ...s, request_json: preSendRequestSnapshotText } : s
          )
        );

        let resp: ClaudeModelValidationResult | null = null;
        try {
          resp = await claudeProviderValidateModel({
            provider_id: curProvider.id,
            base_url: baseUrl.trim(),
            request_json: reqTextToSendWrapper,
          });
        } catch (err) {
          logToConsole("error", "Claude Provider 模型验证失败（批量）", {
            error: String(err),
            provider_id: curProvider.id,
            attempt: idx + 1,
            template_key: stepTemplate.key,
          });
          setSuiteSteps((prev) =>
            prev.map((s) =>
              s.index === idx + 1
                ? { ...s, status: "error", error: String(err), result_json: "" }
                : s
            )
          );
          continue;
        }

        if (!resp) {
          toast("仅在 Tauri Desktop 环境可用");
          setSuiteSteps((prev) =>
            prev.map((s) =>
              s.index === idx + 1
                ? { ...s, status: "error", error: "仅在 Tauri Desktop 环境可用" }
                : s
            )
          );
          return;
        }

        setResultTemplateKey(stepTemplate.key);
        setSelectedHistoryKey(null);
        setResult(resp);

        const executedRequestSnapshotCandidate =
          buildClaudeModelValidationRequestSnapshotTextFromResult(resp, apiKeyPlaintextForSnapshot);
        const executedRequestSnapshotText = executedRequestSnapshotCandidate.trim()
          ? executedRequestSnapshotCandidate
          : preSendRequestSnapshotText;

        setRequestJson(executedRequestSnapshotText);

        const suiteResultJson = (() => {
          try {
            return JSON.stringify(resp, null, 2);
          } catch {
            return "";
          }
        })();

        setSuiteSteps((prev) =>
          prev.map((s) =>
            s.index === idx + 1
              ? {
                  ...s,
                  status: "done",
                  result: resp,
                  request_json: executedRequestSnapshotText,
                  result_json: suiteResultJson,
                  error: null,
                }
              : s
          )
        );
      }

      // 刷新历史用于左侧列表更新，但不要自动切到“历史详情”，避免用户误以为本次 suite
      // 只执行了部分步骤（右侧需保持“当前运行”视图，历史仅用于回溯）。
      await refreshHistory({ selectLatest: false, allowAutoSelectWhenNone: false });
      setSelectedHistoryKey(null);
    } catch (err) {
      logToConsole("error", "Claude Provider 模型验证失败", {
        error: String(err),
        provider_id: curProvider.id,
      });
      toast(`验证失败：${String(err)}`);
    } finally {
      setValidating(false);
      setSuiteProgress(null);
    }
  }

  async function clearProviderHistory() {
    if (historyClearing) return;

    const curProvider = providerRef.current;
    if (!open || !curProvider) return;

    setHistoryClearing(true);
    try {
      // 防止“历史刷新 in-flight”在清空后把旧数据又写回到 UI。
      historyReqSeqRef.current += 1;
      setHistoryRuns([]);
      setSelectedHistoryKey(null);

      const ok = await claudeValidationHistoryClearProvider({ provider_id: curProvider.id });
      if (ok == null) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      if (!ok) {
        toast("清空失败");
        return;
      }

      toast("已清空历史");
      await refreshHistory({ selectLatest: true });
    } catch (err) {
      toast(`清空失败：${String(err)}`);
      void refreshHistory({ selectLatest: true });
    } finally {
      setHistoryClearing(false);
      setConfirmClearOpen(false);
    }
  }

  const title = provider ? `Claude · 模型验证：${provider.name}` : "Claude · 模型验证";

  type ClaudeModelValidationHistoryGroup = {
    key: string;
    suiteRunId: string | null;
    isSuite: boolean;
    createdAt: number;
    latestRunId: number;
    expectedTotal: number;
    missingCount: number;
    passCount: number;
    failCount: number;
    overallPass: boolean;
    grade: ClaudeValidationGrade | null;
    modelName: string;
    runs: Array<{
      run: ClaudeModelValidationRunView;
      meta: SuiteMeta;
      evaluation: ReturnType<typeof evaluateClaudeValidation>;
    }>;
  };

  const historyGroups = useMemo((): ClaudeModelValidationHistoryGroup[] => {
    const groups = new Map<
      string,
      {
        key: string;
        suiteRunId: string | null;
        createdAt: number;
        latestRunId: number;
        runs: Array<{
          run: ClaudeModelValidationRunView;
          meta: SuiteMeta;
          templateKeyLike: string | null;
        }>;
      }
    >();

    for (const run of historyRuns) {
      const meta = extractSuiteMetaFromRequestJson(run.request_json ?? "");
      const groupKey = getHistoryGroupKey(run);
      const existing = groups.get(groupKey);
      const next = existing ?? {
        key: groupKey,
        suiteRunId: meta.suiteRunId,
        createdAt: run.created_at,
        latestRunId: run.id,
        runs: [],
      };

      next.suiteRunId = next.suiteRunId ?? meta.suiteRunId;
      next.createdAt = Math.max(next.createdAt, run.created_at);
      next.latestRunId = Math.max(next.latestRunId, run.id);
      next.runs.push({
        run,
        meta,
        templateKeyLike: extractTemplateKeyFromRequestJson(run.request_json ?? ""),
      });

      groups.set(groupKey, next);
    }

    const out: ClaudeModelValidationHistoryGroup[] = [];
    for (const group of groups.values()) {
      const sortedRuns = [...group.runs].sort((a, b) => {
        const ia = a.meta.suiteStepIndex ?? Number.MAX_SAFE_INTEGER;
        const ib = b.meta.suiteStepIndex ?? Number.MAX_SAFE_INTEGER;
        if (ia !== ib) return ia - ib;
        return a.run.id - b.run.id;
      });

      const expectedTotal = (() => {
        const totals = sortedRuns
          .map((r) => r.meta.suiteStepTotal)
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
        if (totals.length > 0) return Math.max(...totals);
        return sortedRuns.length;
      })();

      const evaluatedRuns = sortedRuns.map((r) => ({
        run: r.run,
        meta: r.meta,
        evaluation: evaluateClaudeValidation(r.templateKeyLike, r.run.parsed_result),
      }));

      const passCount = evaluatedRuns.filter((r) => r.evaluation.overallPass === true).length;
      const failCount = Math.max(0, evaluatedRuns.length - passCount);
      const grade = suitePickEvidenceGrade(evaluatedRuns.map((r) => r.evaluation.grade));
      const allPass =
        expectedTotal === evaluatedRuns.length &&
        evaluatedRuns.every((r) => r.evaluation.overallPass === true);

      const modelName =
        evaluatedRuns[evaluatedRuns.length - 1]?.evaluation.derived.modelName ??
        evaluatedRuns[0]?.evaluation.derived.modelName ??
        "—";

      out.push({
        key: group.key,
        suiteRunId: group.suiteRunId,
        isSuite: Boolean(group.suiteRunId),
        createdAt: group.createdAt,
        latestRunId: group.latestRunId,
        expectedTotal,
        missingCount: Math.max(0, expectedTotal - evaluatedRuns.length),
        passCount,
        failCount,
        overallPass: allPass,
        grade,
        modelName,
        runs: evaluatedRuns,
      });
    }

    return out.sort((a, b) => b.latestRunId - a.latestRunId);
  }, [historyRuns]);

  const selectedHistoryGroup = useMemo(() => {
    if (!selectedHistoryKey) return null;
    return historyGroups.find((g) => g.key === selectedHistoryKey) ?? null;
  }, [historyGroups, selectedHistoryKey]);

  const selectedHistoryLatest =
    selectedHistoryGroup?.runs[selectedHistoryGroup.runs.length - 1] ?? null;
  const activeResult = selectedHistoryLatest?.run.parsed_result ?? result;
  const activeResultTemplateKey = useMemo(() => {
    if (selectedHistoryLatest?.run.request_json) {
      const key = extractTemplateKeyFromRequestJson(selectedHistoryLatest.run.request_json);
      return getClaudeValidationTemplate(key).key;
    }
    if (result) return resultTemplateKey;
    return templateKey;
  }, [selectedHistoryLatest?.run.request_json, result, resultTemplateKey, templateKey]);

  const currentSuiteSummary = useMemo(() => {
    if (suiteSteps.length === 0) return null;
    if (selectedHistoryGroup) return null;
    const normalizedModel = model.trim();
    const rows: SuiteSummaryRow[] = suiteSteps.map((s) => ({
      templateKey: s.templateKey,
      label: s.label,
      status: s.status,
      evaluation: evaluateClaudeValidation(s.templateKey, s.result),
      result: s.result,
      errorText: s.error,
    }));
    return buildSuiteSummary(rows, normalizedModel);
  }, [model, selectedHistoryGroup, suiteSteps]);

  const historySuiteSummary = useMemo(() => {
    if (!selectedHistoryGroup?.isSuite) return null;

    const expectedTotal = selectedHistoryGroup.expectedTotal;
    const expectedKeys = templates
      .filter((t) => getClaudeTemplateApplicability(t, selectedHistoryGroup.modelName).applicable)
      .map((t) => t.key);

    const byIndex = new Map<number, (typeof selectedHistoryGroup.runs)[number]>();
    for (const r of selectedHistoryGroup.runs) {
      const idx = r.meta.suiteStepIndex ?? 0;
      if (!Number.isFinite(idx) || idx <= 0) continue;
      const prev = byIndex.get(idx);
      if (!prev || r.run.id > prev.run.id) byIndex.set(idx, r);
    }

    const rows: SuiteSummaryRow[] = [];
    for (let idx = 1; idx <= expectedTotal; idx += 1) {
      const step = byIndex.get(idx) ?? null;
      const expectedKey = expectedKeys[idx - 1] ?? step?.evaluation.templateKey;
      const templateKeyForUi = (expectedKey ??
        DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY) as ClaudeValidationTemplateKey;
      const template = getClaudeValidationTemplate(templateKeyForUi);
      rows.push({
        templateKey: templateKeyForUi,
        label: getTemplateDisplayLabel(template),
        status: step ? "done" : "missing",
        evaluation: step ? step.evaluation : evaluateClaudeValidation(templateKeyForUi, null),
        result: step?.run.parsed_result ?? null,
        errorText: null,
      });
    }

    return buildSuiteSummary(rows, selectedHistoryGroup.modelName);
  }, [selectedHistoryGroup, templates]);

  const suiteSummaryForHeader = currentSuiteSummary ?? historySuiteSummary;
  const hasSuiteContext =
    (suiteSteps.length > 0 && !selectedHistoryGroup) || selectedHistoryGroup?.isSuite === true;

  useEffect(() => {
    if (hasSuiteContext) return;
    if (detailsTab !== "steps") return;
    setDetailsTab("overview");
  }, [detailsTab, hasSuiteContext]);

  const detailsTabItems: Array<{ key: ValidationDetailsTab; label: string; disabled?: boolean }> =
    useMemo(() => {
      const overviewLabel = hasSuiteContext ? "总结" : "结果";
      return [
        { key: "overview" as ValidationDetailsTab, label: overviewLabel },
        ...(hasSuiteContext ? [{ key: "steps" as ValidationDetailsTab, label: "步骤" }] : []),
        { key: "debug" as ValidationDetailsTab, label: "调试" },
      ];
    }, [hasSuiteContext]);

  const suiteHeaderMetaText = (() => {
    if (!suiteSummaryForHeader) return null;
    const nonPass =
      suiteSummaryForHeader.stats.fail +
      suiteSummaryForHeader.stats.error +
      suiteSummaryForHeader.stats.missing;
    const parts: string[] = [];
    parts.push(`完成 ${suiteSummaryForHeader.stats.done}/${suiteSummaryForHeader.stats.total}`);
    parts.push(`通过 ${suiteSummaryForHeader.stats.pass}`);
    parts.push(`未通过 ${nonPass}`);
    if (suiteSummaryForHeader.stats.missing > 0)
      parts.push(`缺失 ${suiteSummaryForHeader.stats.missing}`);
    return parts.join(" · ");
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      className="max-w-[95vw] sm:max-w-[95vw] md:max-w-[95vw] lg:max-w-[95vw] xl:max-w-[1600px] 2xl:max-w-[1800px] w-full"
    >
      {!provider ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          未选择服务商
        </div>
      ) : (
        <div className="space-y-6">
          {/* Provider Info Banner */}
          <div className="flex flex-wrap items-center justify-between rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/30 px-5 py-4 text-sm shadow-sm backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-6 text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/50 dark:to-slate-900 shadow-sm ring-1 ring-indigo-100 dark:ring-indigo-800/50">
                  <Server className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    服务商
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                    {provider.name}
                  </div>
                </div>
              </div>
              <div className="hidden h-10 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/50 dark:to-slate-900 shadow-sm ring-1 ring-sky-100 dark:ring-sky-800/50">
                  <Network className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    模式
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {provider.base_url_mode === "ping" ? "自动测速" : "顺序轮询"}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-slate-100/80 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                      {provider.base_urls.length} 个地址
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-slate-50/40 dark:bg-slate-800/40 p-5 sm:grid-cols-12 shadow-sm">
            <div className="sm:col-span-4">
              <FormField
                label="Endpoint"
                hint={provider.base_url_mode === "ping" && baseUrlPicking ? "测速中..." : null}
              >
                <Select
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.currentTarget.value)}
                  disabled={validating}
                  mono
                  className="h-10 bg-white/80 dark:bg-slate-900/80 text-xs shadow-sm"
                >
                  <option value="" disabled>
                    选择 Endpoint...
                  </option>
                  {provider.base_urls.map((url) => (
                    <option key={url} value={url}>
                      {url}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="sm:col-span-4">
              <FormField label="Model">
                <Select
                  value={model}
                  onChange={(e) => setModel(e.currentTarget.value)}
                  disabled={validating || modelPricesLoading || modelOptions.length === 0}
                  mono
                  className="h-10 bg-white/80 dark:bg-slate-900/80 text-xs shadow-sm"
                >
                  <option value="" disabled>
                    {modelOptions.length === 0 ? "无可用模型" : "选择 Model..."}
                  </option>
                  {!modelOptions.includes(model) && model.trim() ? (
                    <option value={model}>{model} (当前)</option>
                  ) : null}
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="flex items-end sm:col-span-4">
              <Button
                onClick={() => void runValidationSuite()}
                variant="primary"
                size="md"
                disabled={validating}
                className="w-full h-10 shadow-sm"
              >
                {validating ? (
                  <>
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                    {suiteProgress
                      ? `执行中 (${suiteProgress.current}/${suiteProgress.total})...`
                      : "执行中..."}
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-3.5 w-3.5 fill-current" />
                    开始验证 ({templates.length})
                  </>
                )}
              </Button>
            </div>

            {/* Cross-provider selector for signature validation */}
            {hasCrossProviderTemplate && crossProviderOptions.length > 0 && (
              <div className="sm:col-span-12">
                <FormField
                  label="Cross-Provider Validation"
                  hint="用于 Step3 的跨供应商 Signature 验证"
                >
                  <Select
                    value={crossProviderId?.toString() ?? ""}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setCrossProviderId(val ? parseInt(val, 10) : null);
                    }}
                    disabled={validating}
                    className="h-10 bg-white/80 dark:bg-slate-900/80 text-xs shadow-sm"
                  >
                    <option value="">选择官方供应商...</option>
                    {crossProviderOptions.map((p) => (
                      <option key={p.id} value={p.id.toString()}>
                        {p.name} ({p.base_urls[0] ?? "无 URL"})
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6 lg:flex-row h-[70vh] min-h-[600px] max-h-[800px]">
            {/* Left Column: History List */}
            <div className="flex flex-col gap-4 h-full min-h-0 w-full lg:flex-[0_1_420px] lg:max-w-[420px]">
              <Card padding="none" className="flex h-full flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      History
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => void refreshHistory({ selectLatest: false })}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={historyLoading || historyAvailable === false}
                      title="刷新"
                    >
                      <RefreshCw className={cn("h-4 w-4", historyLoading && "animate-spin")} />
                    </Button>
                    <Button
                      onClick={() => {
                        if (!provider) return;
                        setConfirmClearOpen(true);
                      }}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                      disabled={historyLoading || historyAvailable === false || historyClearing}
                      title="清空历史"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden">
                  {historyAvailable === false ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <Cpu className="h-8 w-8 text-slate-200 dark:text-slate-600" />
                      <span className="text-xs">仅限桌面端</span>
                    </div>
                  ) : historyLoading && historyGroups.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                      加载中...
                    </div>
                  ) : historyGroups.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <History className="h-8 w-8 text-slate-200 dark:text-slate-600" />
                      <span className="text-xs">No History</span>
                    </div>
                  ) : (
                    <div className="custom-scrollbar h-full overflow-y-auto p-3 space-y-2">
                      {historyGroups.map((group) => {
                        const active = group.key === selectedHistoryKey;
                        const mentionsBedrock = group.runs.some((r) => {
                          const signals = r.run.parsed_result?.signals;
                          return Boolean(
                            signals &&
                            typeof signals === "object" &&
                            (signals as Record<string, unknown>).mentions_amazon_bedrock
                          );
                        });

                        const statusPill = (() => {
                          if (!group.isSuite) {
                            return {
                              text: group.overallPass ? "通过" : "未通过",
                              cls: group.overallPass
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
                            };
                          }

                          if (group.overallPass) {
                            return {
                              text: `通过 ${group.passCount}/${group.expectedTotal}`,
                              cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                            };
                          }

                          if (group.missingCount > 0 && group.failCount === 0) {
                            return {
                              text: `缺失 ${group.missingCount}`,
                              cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
                            };
                          }

                          return {
                            text: `未通过 ${group.passCount}/${group.expectedTotal}`,
                            cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
                          };
                        })();

                        const evidencePill = (() => {
                          if (!group.grade) return null;
                          if (group.grade.label === "通过" || group.grade.label === "未通过")
                            return null;

                          const hint = (() => {
                            const label = group.grade.label ?? "";
                            if (label.includes("第一方") && label.includes("强")) return "强";
                            if (label.includes("第一方") && label.includes("中")) return "中";
                            if (label.includes("弱")) return "弱";
                            if (label.includes("风险")) return "风险";
                            return label.replace(/[（）()]/g, "") || "—";
                          })();

                          const cls =
                            group.grade.level === "A"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : group.grade.level === "B"
                                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                : group.grade.level === "C"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";

                          return (
                            <span
                              className={cn("rounded px-2 py-0.5 text-[10px] font-semibold", cls)}
                              title={group.grade.title}
                            >
                              {group.grade.level} {hint}
                            </span>
                          );
                        })();

                        const metaText = (() => {
                          const parts = [
                            `#${group.latestRunId}`,
                            formatUnixSeconds(group.createdAt),
                          ];
                          if (group.isSuite) parts.unshift("Suite");
                          return parts.join(" · ");
                        })();

                        const titleText = (() => {
                          if (group.isSuite) return group.modelName;
                          const latest = group.runs[group.runs.length - 1]?.evaluation.template;
                          if (!latest) return group.modelName;
                          return getTemplateDisplayLabel(latest);
                        })();

                        return (
                          <button
                            key={group.key}
                            type="button"
                            onClick={() => {
                              setSelectedHistoryKey(group.key);
                              setDetailsTab("overview");
                            }}
                            className={cn(
                              "group w-full text-left rounded-xl border px-3 py-2 transition-all",
                              active
                                ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-sm ring-1 ring-indigo-500/20"
                                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700 hover:shadow-sm"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                        {titleText}
                                      </span>
                                      {!group.isSuite ? (
                                        <span className="rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 shrink-0">
                                          {group.modelName}
                                        </span>
                                      ) : (
                                        <span className="rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 shrink-0">
                                          Suite
                                        </span>
                                      )}
                                      {mentionsBedrock ? (
                                        <span
                                          className="rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 shrink-0"
                                          title="signals.mentions_amazon_bedrock=true"
                                        >
                                          Bedrock
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                      {metaText}
                                    </div>
                                  </div>

                                  <div className="shrink-0 flex flex-col items-end gap-1">
                                    <span
                                      className={cn(
                                        "rounded px-2 py-0.5 text-[10px] font-semibold",
                                        statusPill.cls
                                      )}
                                    >
                                      {statusPill.text}
                                    </span>
                                    {evidencePill}
                                  </div>
                                </div>
                              </div>

                              <ChevronRight
                                className={cn(
                                  "mt-0.5 h-4 w-4 text-slate-300 transition-transform",
                                  active && "text-indigo-400"
                                )}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Right Column: Details Pane */}
            <div className="flex flex-col gap-4 h-full min-h-0 min-w-0 flex-1 overflow-y-auto custom-scrollbar pr-1">
              <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/80 backdrop-blur border-b border-slate-100 dark:border-slate-700 pb-3 pt-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {suiteSteps.length > 0 && !selectedHistoryGroup ? (
                        <>
                          <Activity className="h-4 w-4 text-sky-500" />
                          Running
                        </>
                      ) : selectedHistoryGroup ? (
                        <>
                          <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                          Details
                        </>
                      ) : (
                        <>
                          <Settings2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          Ready
                        </>
                      )}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {selectedHistoryGroup
                        ? selectedHistoryGroup.isSuite
                          ? `Suite #${selectedHistoryGroup.latestRunId} · ${formatUnixSeconds(selectedHistoryGroup.createdAt)}${suiteHeaderMetaText ? ` · ${suiteHeaderMetaText}` : ""}`
                          : `Log #${selectedHistoryGroup.latestRunId} · ${formatUnixSeconds(selectedHistoryGroup.createdAt)}`
                        : suiteSteps.length > 0
                          ? `Running ${suiteProgress?.current ?? 0}/${suiteSteps.length} templates...${suiteHeaderMetaText ? ` · ${suiteHeaderMetaText}` : ""}`
                          : activeResult
                            ? "Latest (Unsaved)"
                            : "Waiting..."}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <TabList
                    ariaLabel="验证详情视图"
                    items={detailsTabItems}
                    value={detailsTab}
                    onChange={setDetailsTab}
                    className="shrink-0"
                    buttonClassName="!py-1.5"
                  />

                  {hasSuiteContext && detailsTab === "steps" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">只看异常</span>
                      <Switch
                        size="sm"
                        checked={suiteIssuesOnly}
                        onCheckedChange={setSuiteIssuesOnly}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {(() => {
                const isCurrentSuite = suiteSteps.length > 0 && !selectedHistoryGroup;
                const isHistorySuite = selectedHistoryGroup?.isSuite === true;
                const suiteSummary = isCurrentSuite
                  ? currentSuiteSummary
                  : isHistorySuite
                    ? historySuiteSummary
                    : null;

                const suiteDebugPanel = suiteSummary ? (
                  <div className="space-y-4">
                    <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                          <FileJson className="h-4 w-4" />
                          <span>可复制总结（纯文本）</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={(e) => {
                              stopDetailsToggle(e);
                              return void Promise.resolve(
                                copyTextOrToast(suiteSummary.plainText, "已复制验证总结")
                              );
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={!suiteSummary.plainText.trim()}
                            title="复制总结"
                            aria-label="复制总结"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                        </div>
                      </summary>
                      <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3">
                        <Textarea
                          mono
                          readOnly
                          className="h-[220px] resize-none text-[11px] leading-relaxed bg-white dark:bg-slate-900"
                          value={suiteSummary.plainText}
                        />
                      </div>
                    </details>

                    <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                          <Settings2 className="h-4 w-4" />
                          <span>执行模板（全部）</span>
                        </div>
                        <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-2">
                        {suiteSummary.templateRows.map((r) => (
                          <div
                            key={r.templateKey}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2"
                            title={r.grade?.title ?? ""}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                {r.label}
                              </div>
                              <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                {r.templateKey}
                              </div>
                            </div>
                            <div className="shrink-0">
                              {r.status === "done" ? (
                                <OutcomePill pass={r.overallPass} />
                              ) : r.status === "missing" ? (
                                <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                                  未记录
                                </span>
                              ) : r.status === "running" ? (
                                <span className="rounded bg-sky-100 dark:bg-sky-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
                                  执行中
                                </span>
                              ) : r.status === "error" ? (
                                <span className="rounded bg-rose-100 dark:bg-rose-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                                  失败
                                </span>
                              ) : (
                                <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                                  待执行
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>

                    <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                          <Activity className="h-4 w-4" />
                          <span>官方协议检查点（全部）</span>
                        </div>
                        <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {suiteSummary.protocol.map((p) => (
                          <div
                            key={p.key}
                            className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2"
                            title={p.detail ?? ""}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              {p.ok == null ? (
                                <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700" />
                              ) : p.ok ? (
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <XCircle className="mt-0.5 h-3.5 w-3.5 text-rose-500 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-xs text-slate-800 dark:text-slate-200">
                                  {p.label}
                                  {!p.required ? (
                                    <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">
                                      (参考)
                                    </span>
                                  ) : null}
                                </div>
                                {p.detail ? (
                                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                    {p.detail}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    暂无调试信息（请先运行验证或选择一条 suite 历史记录）。
                  </div>
                );

                const renderSuiteStepsMasterDetail = (allSteps: SuiteStepView[]) => {
                  const visible = suiteIssuesOnly
                    ? allSteps.filter((step) => {
                        if (step.status === "error") return true;
                        if (step.status === "running") return true;
                        if (step.status === "missing") return true;
                        if (step.status !== "done") return false;
                        return step.evaluation.overallPass !== true;
                      })
                    : allSteps;

                  if (suiteIssuesOnly && visible.length === 0) {
                    return (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        暂无异常，已隐藏通过项（关闭“只看异常”可查看全部步骤）。
                      </div>
                    );
                  }

                  const activeIndex = (() => {
                    if (
                      suiteActiveStepIndex != null &&
                      visible.some((s) => s.index === suiteActiveStepIndex)
                    ) {
                      return suiteActiveStepIndex;
                    }
                    const running = visible.find((s) => s.status === "running");
                    if (running) return running.index;
                    const issue = visible.find(
                      (s) =>
                        s.status === "error" ||
                        s.status === "missing" ||
                        (s.status === "done" && s.evaluation.overallPass !== true)
                    );
                    if (issue) return issue.index;
                    return visible[0]?.index ?? null;
                  })();

                  const activeStep =
                    activeIndex != null
                      ? (visible.find((s) => s.index === activeIndex) ?? null)
                      : null;

                  const statusBadge = (step: SuiteStepView) => {
                    if (step.status === "done")
                      return <OutcomePill pass={step.evaluation.overallPass} />;
                    if (step.status === "running") {
                      return (
                        <span className="rounded bg-sky-100 dark:bg-sky-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
                          执行中
                        </span>
                      );
                    }
                    if (step.status === "error") {
                      return (
                        <span className="rounded bg-rose-100 dark:bg-rose-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                          失败
                        </span>
                      );
                    }
                    if (step.status === "missing") {
                      return (
                        <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                          未记录
                        </span>
                      );
                    }
                    return (
                      <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                        待执行
                      </span>
                    );
                  };

                  const evidenceBadge = (step: SuiteStepView) => {
                    if (step.status !== "done") return null;
                    const grade = step.evaluation.grade;
                    if (!grade) return null;
                    if (grade.label === "通过" || grade.label === "未通过") return null;

                    const hint = (() => {
                      const label = grade.label ?? "";
                      if (label.includes("第一方") && label.includes("强")) return "强";
                      if (label.includes("第一方") && label.includes("中")) return "中";
                      if (label.includes("弱")) return "弱";
                      if (label.includes("风险")) return "风险";
                      return label.replace(/[（）()]/g, "") || "—";
                    })();

                    const cls =
                      grade.level === "A"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : grade.level === "B"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                          : grade.level === "C"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";

                    return (
                      <span
                        className={cn("rounded px-2 py-0.5 text-[10px] font-semibold", cls)}
                        title={grade.title}
                      >
                        {grade.level} {hint}
                      </span>
                    );
                  };

                  const stepMeta = (step: SuiteStepView) => {
                    if (!step.result) return null;
                    const parts: string[] = [];
                    const status =
                      typeof step.result.status === "number" && Number.isFinite(step.result.status)
                        ? step.result.status
                        : null;
                    const ms =
                      typeof step.result.duration_ms === "number" &&
                      Number.isFinite(step.result.duration_ms)
                        ? step.result.duration_ms
                        : null;
                    if (status != null) parts.push(`HTTP ${status}`);
                    if (ms != null) parts.push(`${ms}ms`);
                    return parts.length > 0 ? parts.join(" · ") : null;
                  };

                  const activeRequestText = (() => {
                    if (!activeStep) return "";
                    const executed = buildClaudeModelValidationRequestSnapshotTextFromResult(
                      activeStep.result,
                      apiKeyPlaintext
                    );
                    return executed.trim() ? executed : (activeStep.requestJsonText ?? "");
                  })();
                  const activeResultText = activeStep
                    ? prettyJsonOrFallback(activeStep.resultJsonText ?? "")
                    : "";
                  const activeSseText = activeStep ? (activeStep.sseRawText ?? "") : "";

                  return (
                    <div className="grid gap-4 lg:grid-cols-5">
                      <div className="lg:col-span-2">
                        <div className="space-y-2">
                          {visible.map((step) => {
                            const active = step.index === activeIndex;
                            const meta = stepMeta(step);
                            return (
                              <button
                                key={`${step.templateKey}_${step.index}`}
                                type="button"
                                onClick={() => setSuiteActiveStepIndex(step.index)}
                                className={cn(
                                  "w-full text-left rounded-xl border px-3 py-2 transition-all",
                                  active
                                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-sm ring-1 ring-indigo-500/20"
                                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700 hover:shadow-sm"
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                      {step.index}/{step.total} · {step.label}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                      {meta ? `${meta} · ` : ""}
                                      {step.templateKey}
                                    </div>
                                  </div>
                                  <div className="shrink-0 flex flex-col items-end gap-1">
                                    {statusBadge(step)}
                                    {evidenceBadge(step)}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="lg:col-span-3 space-y-3">
                        {activeStep ? (
                          <>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    步骤 {activeStep.index}/{activeStep.total}：{activeStep.label}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {stepMeta(activeStep) ? `${stepMeta(activeStep)} · ` : ""}
                                    {activeStep.templateKey}
                                  </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <Button
                                    onClick={(e) => {
                                      stopDetailsToggle(e);
                                      return void copyTextOrToast(
                                        activeRequestText,
                                        "已复制请求 JSON"
                                      );
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    disabled={!activeRequestText.trim()}
                                    title="复制请求 JSON"
                                    aria-label="复制请求 JSON"
                                  >
                                    <FileJson className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      stopDetailsToggle(e);
                                      return void copyTextOrToast(
                                        activeResultText,
                                        "已复制 Result JSON"
                                      );
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    disabled={!activeResultText.trim()}
                                    title="复制 Result JSON"
                                    aria-label="复制 Result JSON"
                                  >
                                    <FileJson className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      stopDetailsToggle(e);
                                      return void copyTextOrToast(activeSseText, "已复制 SSE 原文");
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    disabled={!activeSseText.trim()}
                                    title="复制 SSE 原文"
                                    aria-label="复制 SSE 原文"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              {activeStep.errorText ? (
                                <div className="mt-3 rounded bg-rose-50 dark:bg-rose-900/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
                                  {activeStep.errorText}
                                </div>
                              ) : null}
                            </div>

                            <ClaudeModelValidationResultPanel
                              templateKey={activeStep.templateKey}
                              result={activeStep.result}
                              mode="compact"
                            />

                            <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                                  <Settings2 className="h-4 w-4" />
                                  <span>请求 JSON</span>
                                </div>
                                <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                              </summary>
                              <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3">
                                <Textarea
                                  mono
                                  readOnly
                                  className="h-[160px] resize-none text-[10px] leading-relaxed bg-white dark:bg-slate-900"
                                  value={activeRequestText}
                                />
                              </div>
                            </details>

                            <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                                  <Activity className="h-4 w-4" />
                                  <span>响应原文</span>
                                </div>
                                <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                              </summary>
                              <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-3">
                                <div className="space-y-2">
                                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                    Result JSON
                                  </div>
                                  <Textarea
                                    mono
                                    readOnly
                                    className="h-[160px] resize-none text-[10px] leading-relaxed bg-white dark:bg-slate-900"
                                    value={activeResultText || ""}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                    SSE 原文
                                  </div>
                                  <pre className="custom-scrollbar max-h-60 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-[10px] leading-relaxed text-slate-300">
                                    {activeSseText ? (
                                      activeSseText
                                    ) : (
                                      <span className="text-slate-600 dark:text-slate-400 italic">
                                        // 暂无 SSE 数据
                                      </span>
                                    )}
                                  </pre>
                                </div>
                              </div>
                            </details>
                          </>
                        ) : (
                          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                            请选择一个步骤查看详情。
                          </div>
                        )}
                      </div>
                    </div>
                  );
                };

                const renderCurrentSuiteSteps = () => {
                  if (suiteSteps.length === 0) return null;
                  const total = suiteSteps.length;
                  const stepViews: SuiteStepView[] = suiteSteps.map((s) => ({
                    index: s.index,
                    total,
                    templateKey: s.templateKey,
                    label: s.label,
                    status: s.status,
                    evaluation: evaluateClaudeValidation(s.templateKey, s.result),
                    result: s.result,
                    requestJsonText: s.request_json ?? "",
                    resultJsonText: s.result_json ?? "",
                    sseRawText: s.result?.raw_excerpt ?? "",
                    errorText: s.error,
                  }));
                  return renderSuiteStepsMasterDetail(stepViews);
                };

                const renderHistorySuiteSteps = () => {
                  if (!selectedHistoryGroup?.isSuite) return null;
                  const expectedTotal = selectedHistoryGroup.expectedTotal;
                  const expectedKeys = templates
                    .filter(
                      (t) =>
                        getClaudeTemplateApplicability(t, selectedHistoryGroup.modelName).applicable
                    )
                    .map((t) => t.key);

                  const byIndex = new Map<number, (typeof selectedHistoryGroup.runs)[number]>();
                  for (const r of selectedHistoryGroup.runs) {
                    const idx = r.meta.suiteStepIndex ?? 0;
                    if (!Number.isFinite(idx) || idx <= 0) continue;
                    const prev = byIndex.get(idx);
                    if (!prev || r.run.id > prev.run.id) byIndex.set(idx, r);
                  }

                  const stepViews: SuiteStepView[] = [];
                  for (let idx = 1; idx <= expectedTotal; idx += 1) {
                    const step = byIndex.get(idx) ?? null;
                    const expectedKey = expectedKeys[idx - 1] ?? step?.evaluation.templateKey;
                    const templateKeyForUi = (expectedKey ??
                      DEFAULT_CLAUDE_VALIDATION_TEMPLATE_KEY) as ClaudeValidationTemplateKey;
                    const template = getClaudeValidationTemplate(templateKeyForUi);
                    stepViews.push({
                      index: idx,
                      total: expectedTotal,
                      templateKey: templateKeyForUi,
                      label: getTemplateDisplayLabel(template),
                      status: step ? "done" : "missing",
                      evaluation: step
                        ? step.evaluation
                        : evaluateClaudeValidation(templateKeyForUi, null),
                      result: step?.run.parsed_result ?? null,
                      requestJsonText: step?.run.request_json ?? "",
                      resultJsonText: prettyJsonOrFallback(step?.run.result_json ?? ""),
                      sseRawText: step?.run.parsed_result?.raw_excerpt ?? "",
                      errorText: step
                        ? null
                        : "该步骤未出现在历史中：可能是历史写入失败、被清空，或被保留数量上限淘汰。请在“当前运行”查看完整诊断。",
                    });
                  }

                  return renderSuiteStepsMasterDetail(stepViews);
                };

                if (detailsTab === "overview") {
                  if (isCurrentSuite) {
                    return currentSuiteSummary ? (
                      <SuiteSummaryCard summary={currentSuiteSummary} copyText={copyTextOrToast} />
                    ) : (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        暂无综合总结（执行后生成）。
                      </div>
                    );
                  }
                  if (isHistorySuite) {
                    return historySuiteSummary ? (
                      <SuiteSummaryCard summary={historySuiteSummary} copyText={copyTextOrToast} />
                    ) : (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        暂无综合总结（历史数据不足）。
                      </div>
                    );
                  }
                  if (selectedHistoryGroup) {
                    return selectedHistoryLatest ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
                          {(() => {
                            const ev = selectedHistoryLatest.evaluation;
                            const result = selectedHistoryLatest.run.parsed_result;
                            const grade = ev.grade;
                            const evidenceGrade =
                              grade && grade.label !== "通过" && grade.label !== "未通过"
                                ? grade
                                : null;
                            const evidencePill = evidenceGrade ? (
                              <span
                                className={cn(
                                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                                  evidenceGrade.level === "A"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : evidenceGrade.level === "B"
                                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                      : evidenceGrade.level === "C"
                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                )}
                                title={evidenceGrade.title}
                              >
                                证据 {evidenceGrade.level} · {evidenceGrade.label}
                              </span>
                            ) : null;

                            const requestText = (() => {
                              const executed =
                                buildClaudeModelValidationRequestSnapshotTextFromResult(
                                  result,
                                  apiKeyPlaintext
                                );
                              return executed.trim()
                                ? executed
                                : (selectedHistoryLatest.run.request_json ?? "");
                            })();
                            const resultText = prettyJsonOrFallback(
                              selectedHistoryLatest.run.result_json ?? ""
                            );
                            const sseText = result?.raw_excerpt ?? "";

                            const meta = (() => {
                              const parts: string[] = [];
                              if (typeof result?.status === "number")
                                parts.push(`HTTP ${result.status}`);
                              if (typeof result?.duration_ms === "number")
                                parts.push(`${result.duration_ms}ms`);
                              return parts.length > 0 ? parts.join(" · ") : null;
                            })();

                            return (
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    验证：{getTemplateDisplayTitle(ev.template)}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {meta ? `${meta} · ` : ""}
                                    {ev.templateKey}
                                  </div>
                                </div>

                                <div className="shrink-0 flex items-center gap-2">
                                  <OutcomePill pass={ev.overallPass} />
                                  {evidencePill}
                                  <Button
                                    onClick={(e) => {
                                      stopDetailsToggle(e);
                                      return void copyTextOrToast(requestText, "已复制请求 JSON");
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    disabled={!requestText.trim()}
                                    title="复制请求 JSON"
                                    aria-label="复制请求 JSON"
                                  >
                                    <FileJson className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      stopDetailsToggle(e);
                                      return void copyTextOrToast(resultText, "已复制 Result JSON");
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    disabled={!resultText.trim()}
                                    title="复制 Result JSON"
                                    aria-label="复制 Result JSON"
                                  >
                                    <FileJson className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      stopDetailsToggle(e);
                                      return void copyTextOrToast(sseText, "已复制 SSE 原文");
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    disabled={!sseText.trim()}
                                    title="复制 SSE 原文"
                                    aria-label="复制 SSE 原文"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <ClaudeModelValidationResultPanel
                          templateKey={selectedHistoryLatest.evaluation.templateKey}
                          result={selectedHistoryLatest.run.parsed_result}
                          mode="compact"
                        />

                        <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                              <Settings2 className="h-4 w-4" />
                              <span>请求 JSON</span>
                            </div>
                            <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3">
                            <Textarea
                              mono
                              readOnly
                              className="h-[160px] resize-none text-[10px] leading-relaxed bg-white dark:bg-slate-900"
                              value={(() => {
                                const result = selectedHistoryLatest.run.parsed_result;
                                const executed =
                                  buildClaudeModelValidationRequestSnapshotTextFromResult(
                                    result,
                                    apiKeyPlaintext
                                  );
                                return executed.trim()
                                  ? executed
                                  : (selectedHistoryLatest.run.request_json ?? "");
                              })()}
                            />
                          </div>
                        </details>

                        <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                              <Activity className="h-4 w-4" />
                              <span>响应原文</span>
                            </div>
                            <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                          </summary>

                          <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-3">
                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                Result JSON
                              </div>
                              <Textarea
                                mono
                                readOnly
                                className="h-[160px] resize-none text-[10px] leading-relaxed bg-white dark:bg-slate-900"
                                value={prettyJsonOrFallback(
                                  selectedHistoryLatest.run.result_json ?? ""
                                )}
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                SSE 原文
                              </div>
                              <pre className="custom-scrollbar max-h-60 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-[10px] leading-relaxed text-slate-300">
                                {selectedHistoryLatest.run.parsed_result?.raw_excerpt ? (
                                  selectedHistoryLatest.run.parsed_result.raw_excerpt
                                ) : (
                                  <span className="text-slate-600 dark:text-slate-400 italic">
                                    // 暂无 SSE 数据
                                  </span>
                                )}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </div>
                    ) : (
                      <div className="flex h-40 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                        暂无历史数据
                      </div>
                    );
                  }
                  return (
                    <ClaudeModelValidationResultPanel
                      templateKey={activeResultTemplateKey}
                      result={activeResult}
                      mode="compact"
                    />
                  );
                }

                if (detailsTab === "steps") {
                  if (isCurrentSuite) return renderCurrentSuiteSteps();
                  if (isHistorySuite) return renderHistorySuiteSteps();
                  return (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      当前不是测试套件视图（请选择一条 suite 历史记录或运行套件）。
                    </div>
                  );
                }

                // debug tab
                if (hasSuiteContext) return suiteDebugPanel;

                // non-suite debug: advanced request & SSE preview
                if (!selectedHistoryGroup && suiteSteps.length === 0) {
                  return (
                    <div className="space-y-4">
                      <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                            <Settings2 className="h-4 w-4" />
                            <span>高级请求配置</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={(e) => {
                                stopDetailsToggle(e);
                                return void copyTextOrToast(requestJson ?? "", "已复制请求 JSON");
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={!(requestJson ?? "").trim()}
                              title="复制请求 JSON"
                              aria-label="复制请求 JSON"
                            >
                              <FileJson className="h-4 w-4" />
                            </Button>
                            <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                          </div>
                        </summary>

                        <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3">
                          <Textarea
                            mono
                            className="h-[220px] resize-none text-xs leading-5 bg-white dark:bg-slate-900 shadow-sm focus:ring-indigo-500"
                            value={requestJson}
                            onChange={(e) => {
                              setRequestJson(e.currentTarget.value);
                            }}
                            placeholder='{"template_key":"official_max_tokens_5","headers":{...},"body":{...},"expect":{...}}'
                          />
                        </div>
                      </details>

                      <details className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm open:ring-2 open:ring-indigo-500/10 transition-all">
                        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 select-none">
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 group-open:text-indigo-600 dark:group-open:text-indigo-400">
                            <Activity className="h-4 w-4" />
                            <span>SSE 流式响应预览</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={(e) => {
                                stopDetailsToggle(e);
                                return void copyTextOrToast(
                                  activeResult?.raw_excerpt ?? "",
                                  "已复制 SSE 原文"
                                );
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={!(activeResult?.raw_excerpt ?? "").trim()}
                              title="复制 SSE 原文"
                              aria-label="复制 SSE 原文"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                          </div>
                        </summary>
                        <div className="border-t border-slate-100 dark:border-slate-700 p-0">
                          <pre className="custom-scrollbar max-h-60 overflow-auto bg-slate-950 p-4 font-mono text-[10px] leading-relaxed text-slate-300">
                            <span className="text-slate-500 dark:text-slate-400">
                              {(() => {
                                const t = getClaudeValidationTemplate(activeResultTemplateKey);
                                return `// SSE: ${getTemplateDisplayLabel(t)} (${t.key})`;
                              })()}
                              {"\n"}
                            </span>
                            {activeResult?.raw_excerpt || (
                              <span className="text-slate-600 dark:text-slate-400 italic">
                                // 暂无 SSE 数据
                              </span>
                            )}
                          </pre>
                        </div>
                      </details>
                    </div>
                  );
                }

                // history single run: reuse step card for debugging
                if (selectedHistoryGroup && selectedHistoryLatest) {
                  return (
                    <ClaudeModelValidationHistoryStepCard
                      title={`验证：${getTemplateDisplayTitle(selectedHistoryLatest.evaluation.template)}`}
                      rightBadge={
                        <OutcomePill pass={selectedHistoryLatest.evaluation.overallPass} />
                      }
                      templateKey={selectedHistoryLatest.evaluation.templateKey}
                      result={selectedHistoryLatest.run.parsed_result}
                      apiKeyPlaintext={apiKeyPlaintext}
                      requestJsonText={selectedHistoryLatest.run.request_json ?? ""}
                      resultJsonText={prettyJsonOrFallback(
                        selectedHistoryLatest.run.result_json ?? ""
                      )}
                      sseRawText={selectedHistoryLatest.run.parsed_result?.raw_excerpt ?? ""}
                      defaultOpen={true}
                      copyText={copyTextOrToast}
                    />
                  );
                }

                return (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    暂无调试信息。
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {confirmClearOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[60]">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => {
                  if (historyClearing) return;
                  setConfirmClearOpen(false);
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-card">
                  <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      确认清空历史？
                    </div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      即将清空{" "}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {provider?.name ?? "Provider"}
                      </span>{" "}
                      的验证历史，操作不可撤销。
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 px-5 py-4">
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={historyClearing}
                      onClick={() => setConfirmClearOpen(false)}
                    >
                      取消
                    </Button>
                    <Button
                      variant="danger"
                      size="md"
                      disabled={historyClearing}
                      onClick={() => void clearProviderHistory()}
                    >
                      {historyClearing ? "清空中…" : "确认清空"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </Dialog>
  );
}
