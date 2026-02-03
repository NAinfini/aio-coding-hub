// Usage: Usage analytics page. Backend commands: `usage_summary_v2`, `usage_leaderboard_v2` (and related `usage_*`).

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { UsageLeaderboardRow, UsagePeriod, UsageScope, UsageSummary } from "../services/usage";
import { CLI_FILTER_ITEMS, type CliFilterKey } from "../constants/clis";
import { PERIOD_ITEMS } from "../constants/periods";
import { useCustomDateRange } from "../hooks/useCustomDateRange";
import { UsageProviderCacheRateTrendChart } from "../components/UsageProviderCacheRateTrendChart";
import {
  useUsageLeaderboardV2Query,
  useUsageProviderCacheRateTrendV1Query,
  useUsageSummaryV2Query,
} from "../query/usage";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { TabList, type TabListItem } from "../ui/TabList";
import { formatUnknownError } from "../utils/errors";
import {
  formatDurationMs,
  formatInteger,
  formatPercent,
  formatTokensPerSecond,
  formatUsd,
} from "../utils/formatters";

type ScopeItem = { key: UsageScope; label: string };

const SCOPE_ITEMS: ScopeItem[] = [
  { key: "provider", label: "供应商" },
  { key: "cli", label: "CLI" },
  { key: "model", label: "模型" },
];

const FILTER_LABEL_CLASS = "w-16 shrink-0 pt-1.5 text-right text-xs font-medium text-slate-600";
const FILTER_OPTIONS_CLASS = "min-w-0 flex flex-1 flex-wrap items-center gap-2";
const FILTER_OPTION_BUTTON_CLASS = "w-24 whitespace-nowrap";

function TokenBreakdown({
  totalTokens,
  inputTokens,
  outputTokens,
  totalTokensWithCache,
}: {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokensWithCache?: number;
}) {
  return (
    <div className="space-y-0.5">
      <div>{formatInteger(totalTokens)}</div>
      <div className="text-[10px] leading-4 text-slate-500">
        输入 <span className="text-slate-700">{formatInteger(inputTokens)}</span>
      </div>
      <div className="text-[10px] leading-4 text-slate-500">
        输出 <span className="text-slate-700">{formatInteger(outputTokens)}</span>
      </div>
      {totalTokensWithCache != null && Number.isFinite(totalTokensWithCache) ? (
        <div className="text-[10px] leading-4 text-slate-500">
          含缓存 <span className="text-slate-700">{formatInteger(totalTokensWithCache)}</span>
        </div>
      ) : null}
    </div>
  );
}

function CacheBreakdown({
  inputTokens,
  cacheCreationInputTokens,
  cacheReadInputTokens,
}: {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}) {
  const denom = inputTokens + cacheReadInputTokens;
  const hitRate = denom > 0 ? cacheReadInputTokens / denom : NaN;

  return (
    <div className="space-y-0.5 text-[10px] leading-4">
      <div className="text-slate-500">
        创建 <span className="text-slate-700">{formatInteger(cacheCreationInputTokens)}</span>
      </div>
      <div className="text-slate-500">
        读取 <span className="text-slate-700">{formatInteger(cacheReadInputTokens)}</span>
      </div>
      <div className="text-slate-500">
        命中率 <span className="text-slate-700">{formatPercent(hitRate, 2)}</span>
      </div>
    </div>
  );
}

type UsageTableTab = "usage" | "cacheTrend";

const USAGE_TABLE_TAB_ITEMS = [
  { key: "usage", label: "用量" },
  { key: "cacheTrend", label: "缓存走势图" },
] satisfies Array<TabListItem<UsageTableTab>>;

export function UsagePage() {
  const [tableTab, setTableTab] = useState<UsageTableTab>("usage");
  const [scope, setScope] = useState<UsageScope>("provider");
  const [period, setPeriod] = useState<UsagePeriod>("daily");
  const [cliKey, setCliKey] = useState<CliFilterKey>("all");
  const scopeBeforeCacheTrendRef = useRef<UsageScope>("provider");

  const {
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    customApplied,
    bounds,
    showCustomForm,
    applyCustomRange,
    clearCustomRange,
  } = useCustomDateRange(period, { onInvalid: (message) => toast(message) });

  const tauriRuntime = hasTauriRuntime();
  const shouldLoad = period !== "custom" || customApplied != null;
  const filterCliKey = cliKey === "all" ? null : cliKey;
  const input = useMemo(
    () => ({
      startTs: bounds.startTs,
      endTs: bounds.endTs,
      cliKey: filterCliKey,
    }),
    [bounds.endTs, bounds.startTs, filterCliKey]
  );

  const usageEnabled = shouldLoad && tableTab === "usage";
  const cacheTrendEnabled = shouldLoad && tableTab === "cacheTrend";

  const summaryQuery = useUsageSummaryV2Query(period, input, { enabled: usageEnabled });
  const leaderboardQuery = useUsageLeaderboardV2Query(
    scope,
    period,
    { ...input, limit: 50 },
    { enabled: usageEnabled }
  );
  const cacheTrendQuery = useUsageProviderCacheRateTrendV1Query(
    period,
    { ...input, limit: null },
    { enabled: cacheTrendEnabled }
  );

  const usageLoading = usageEnabled && (summaryQuery.isFetching || leaderboardQuery.isFetching);
  const cacheTrendLoading = cacheTrendEnabled && cacheTrendQuery.isFetching;
  const loading = shouldLoad && (usageLoading || cacheTrendLoading);

  const errorText = (() => {
    const err =
      tableTab === "cacheTrend"
        ? cacheTrendQuery.error
        : (summaryQuery.error ?? leaderboardQuery.error);
    return err ? formatUnknownError(err) : null;
  })();
  const errorToastLastRef = useRef<string | null>(null);

  useEffect(() => {
    if (!errorText) {
      errorToastLastRef.current = null;
      return;
    }
    if (errorToastLastRef.current === errorText) return;
    errorToastLastRef.current = errorText;
    toast("加载用量失败：请重试（详情见页面错误信息）");
  }, [errorText]);

  const tauriAvailable: boolean | null = shouldLoad ? tauriRuntime : null;
  const summary: UsageSummary | null = summaryQuery.data ?? null;
  const rows: UsageLeaderboardRow[] = leaderboardQuery.data ?? [];
  const cacheTrendRows = cacheTrendQuery.data ?? [];
  const cacheTrendProviderCount = useMemo(
    () => new Set(cacheTrendRows.map((row) => row.key)).size,
    [cacheTrendRows]
  );

  function onChangeTableTab(next: UsageTableTab) {
    if (next === tableTab) return;

    if (next === "cacheTrend") {
      scopeBeforeCacheTrendRef.current = scope;
      if (scope !== "provider") setScope("provider");
    } else {
      const prev = scopeBeforeCacheTrendRef.current;
      if (prev && prev !== scope) setScope(prev);
    }
    setTableTab(next);
  }

  function successRate(row: UsageLeaderboardRow) {
    if (row.requests_total <= 0) return NaN;
    return row.requests_success / row.requests_total;
  }

  const tableTitle = useMemo(() => {
    switch (scope) {
      case "cli":
        return "CLI";
      case "provider":
        return "供应商";
      case "model":
        return "模型";
      default:
        return "Leaderboard";
    }
  }, [scope]);

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100vh-40px)] lg:overflow-hidden">
      <div className="shrink-0">
        <PageHeader title="用量" />
      </div>

      <Card padding="md" className="shrink-0 space-y-4">
        <div className="flex items-start gap-3">
          <span className={FILTER_LABEL_CLASS}>CLI：</span>
          <div className={FILTER_OPTIONS_CLASS}>
            {CLI_FILTER_ITEMS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={cliKey === item.key ? "primary" : "secondary"}
                onClick={() => setCliKey(item.key)}
                disabled={loading}
                className={FILTER_OPTION_BUTTON_CLASS}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className={FILTER_LABEL_CLASS}>维度：</span>
          <div className={FILTER_OPTIONS_CLASS}>
            {SCOPE_ITEMS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={scope === item.key ? "primary" : "secondary"}
                onClick={() => setScope(item.key)}
                disabled={loading || tableTab === "cacheTrend"}
                className={FILTER_OPTION_BUTTON_CLASS}
              >
                {item.label}
              </Button>
            ))}
            {tableTab === "cacheTrend" ? (
              <span className="w-full pt-1 text-xs text-slate-500">
                缓存走势图仅支持供应商维度（已锁定）
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className={FILTER_LABEL_CLASS}>时间窗：</span>
          <div className={FILTER_OPTIONS_CLASS}>
            {PERIOD_ITEMS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={period === item.key ? "primary" : "secondary"}
                onClick={() => setPeriod(item.key)}
                disabled={loading}
                className={FILTER_OPTION_BUTTON_CLASS}
              >
                {item.label}
              </Button>
            ))}
            {period === "custom" ? (
              <span className="w-full pt-1 text-xs text-slate-500">
                endDate 包含（按本地日期边界计算）
              </span>
            ) : null}
          </div>
        </div>

        {showCustomForm ? (
          <div className="flex items-start gap-3 border-t border-slate-100 pt-4">
            <div className="w-16 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex flex-1 flex-col gap-3 md:flex-row md:items-end">
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-slate-600">开始日期</div>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.currentTarget.value)}
                  aria-label="开始日期"
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-medium text-slate-600">结束日期</div>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.currentTarget.value)}
                  aria-label="结束日期"
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 md:pb-0.5">
                <Button size="sm" variant="primary" onClick={applyCustomRange} disabled={loading}>
                  应用
                </Button>
                <Button size="sm" variant="secondary" onClick={clearCustomRange} disabled={loading}>
                  清空
                </Button>
                {customApplied ? (
                  <span className="text-xs font-medium text-slate-600">
                    已应用：{customApplied.startDate} → {customApplied.endDate}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">请选择日期范围后点击"应用"</span>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      {errorText ? (
        <Card padding="md" className="shrink-0 border-rose-200 bg-rose-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-rose-900">加载失败</div>
              <div className="mt-1 text-sm text-rose-800">
                用量数据刷新失败，请重试；必要时查看 Console 日志定位 error_code。
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (tableTab === "cacheTrend") {
                  void cacheTrendQuery.refetch();
                  return;
                }
                void summaryQuery.refetch();
                void leaderboardQuery.refetch();
              }}
              disabled={loading}
              className="border-rose-200 bg-white text-rose-800 hover:bg-rose-50"
            >
              重试
            </Button>
          </div>
          <div className="mt-3 rounded-lg border border-rose-200 bg-white/60 p-3 font-mono text-xs text-slate-800">
            {errorText}
          </div>
        </Card>
      ) : null}

      {tauriAvailable === false ? (
        <Card padding="md" className="shrink-0">
          <div className="text-sm text-slate-600">
            当前环境未检测到 Tauri Runtime。请通过桌面端运行（`pnpm tauri dev`）后查看用量。
          </div>
        </Card>
      ) : null}

      <Card padding="none" className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-0 pt-5">
          <div className="flex items-center gap-3">
            <TabList
              ariaLabel="用量数据视图"
              items={USAGE_TABLE_TAB_ITEMS}
              value={tableTab}
              onChange={onChangeTableTab}
              className="shrink-0"
              size="sm"
            />
          </div>
          <div className="text-xs text-slate-500">
            {tableTab === "cacheTrend"
              ? cacheTrendProviderCount > 0
                ? `${formatInteger(cacheTrendProviderCount)} · 命中率走势`
                : "命中率走势"
              : `Top 50 · ${tableTitle}（按请求数）`}
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 lg:overflow-y-auto scrollbar-overlay">
          {tableTab === "cacheTrend" ? (
            <div className="px-6 pb-6">
              {cacheTrendLoading && cacheTrendRows.length === 0 ? (
                <div className="h-80 animate-pulse rounded-lg bg-slate-100" />
              ) : cacheTrendRows.length === 0 ? (
                <div className="text-sm text-slate-600">
                  {errorText
                    ? '加载失败：暂无可展示的数据。请点击上方"重试"。'
                    : period === "custom" && !customApplied
                      ? '自定义范围：请选择日期后点击"应用"。'
                      : "暂无可展示的缓存命中率数据。"}
                </div>
              ) : (
                <>
                  <div className="h-80">
                    <UsageProviderCacheRateTrendChart
                      rows={cacheTrendRows}
                      period={period}
                      customApplied={customApplied}
                      className="h-full"
                    />
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    命中率=读取 /（有效输入 + 读取）。有效输入：Codex/Gemini 做 input-cache_read
                    纠偏；Claude 原样。预警阈值：60%（低于阈值的时间段会高亮背景）。
                  </div>
                </>
              )}
            </div>
          ) : loading ? (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">#</th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">名称</th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">请求数</th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">成功率</th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
                      总 Token
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
                      缓存 / 命中率
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
                      平均耗时
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
                      平均首字
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
                      平均速率
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5">
                      花费金额
                    </th>
                  </tr>
                </thead>
                <tbody className="animate-pulse">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-5 rounded-md bg-slate-200" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-32 rounded-md bg-slate-200" />
                        <div className="mt-2 h-3 w-48 rounded-md bg-slate-100" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-14 rounded-md bg-slate-200" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-12 rounded-md bg-slate-200" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-16 rounded-md bg-slate-200" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-20 rounded-md bg-slate-200" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-14 rounded-md bg-slate-200" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-14 rounded-md bg-slate-200" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-16 rounded-md bg-slate-200" />
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3.5">
                        <div className="h-3 w-14 rounded-md bg-slate-200" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : rows.length === 0 && !summary ? (
            <div className="px-6 pb-5 text-sm text-slate-600">
              {errorText
                ? '加载失败：暂无可展示的数据。请点击上方"重试"。'
                : period === "custom" && !customApplied
                  ? '自定义范围：请选择日期后点击"应用"。'
                  : "暂无用量数据。请先通过网关发起请求。"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      #
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      名称
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      请求数
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      成功率
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      总 Token
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      缓存 / 命中率
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      平均耗时
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      平均首字
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      平均速率
                    </th>
                    <th className="border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 backdrop-blur-sm">
                      花费金额
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className="align-top">
                      <td
                        colSpan={10}
                        className="border-b border-slate-100 px-3 py-4 text-sm text-slate-600"
                      >
                        {errorText
                          ? '加载失败：暂无可展示的数据。请点击上方"重试"。'
                          : summary
                            ? "暂无 Leaderboard 数据。"
                            : "暂无可展示的数据。"}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr
                        key={row.key}
                        className="align-top transition-colors hover:bg-slate-50/50"
                      >
                        <td className="border-b border-slate-100 px-3 py-3 text-xs tabular-nums text-slate-400">
                          {index + 1}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3">
                          <div className="font-medium text-slate-900">{row.name}</div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs tabular-nums text-slate-700">
                          {formatInteger(row.requests_total)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs tabular-nums text-slate-700">
                          {formatPercent(successRate(row))}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs tabular-nums text-slate-700">
                          <TokenBreakdown
                            totalTokens={row.io_total_tokens}
                            inputTokens={row.input_tokens}
                            outputTokens={row.output_tokens}
                            totalTokensWithCache={row.total_tokens}
                          />
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs tabular-nums text-slate-700">
                          <CacheBreakdown
                            inputTokens={row.input_tokens}
                            cacheCreationInputTokens={row.cache_creation_input_tokens}
                            cacheReadInputTokens={row.cache_read_input_tokens}
                          />
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs tabular-nums text-slate-700">
                          {formatDurationMs(row.avg_duration_ms)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs tabular-nums text-slate-700">
                          {formatDurationMs(row.avg_ttfb_ms)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs tabular-nums text-slate-700">
                          {formatTokensPerSecond(row.avg_output_tokens_per_second)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs tabular-nums text-slate-700">
                          {formatUsd(row.cost_usd)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {summary ? (
                  <tfoot>
                    <tr className="align-top bg-slate-100/80">
                      <td className="border-b border-slate-200 px-3 py-3 text-sm font-semibold text-slate-500">
                        Σ
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3">
                        <div className="font-semibold text-slate-900">总计</div>
                        <div className="mt-1 text-xs leading-relaxed text-slate-500">
                          {formatInteger(summary.requests_total)} 请求 ·{" "}
                          {formatInteger(summary.requests_with_usage)} 有用量
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          仅统计成功请求（{formatInteger(summary.requests_success)}）
                        </div>
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs font-medium tabular-nums text-slate-900">
                        {formatInteger(summary.requests_total)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs font-medium tabular-nums text-slate-900">
                        {formatPercent(
                          summary.requests_total > 0
                            ? summary.requests_success / summary.requests_total
                            : NaN
                        )}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs font-medium tabular-nums text-slate-900">
                        <TokenBreakdown
                          totalTokens={summary.io_total_tokens}
                          inputTokens={summary.input_tokens}
                          outputTokens={summary.output_tokens}
                          totalTokensWithCache={summary.total_tokens}
                        />
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs font-medium tabular-nums text-slate-900">
                        <CacheBreakdown
                          inputTokens={summary.input_tokens}
                          cacheCreationInputTokens={summary.cache_creation_input_tokens}
                          cacheReadInputTokens={summary.cache_read_input_tokens}
                        />
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs font-medium tabular-nums text-slate-900">
                        {formatDurationMs(summary.avg_duration_ms)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs font-medium tabular-nums text-slate-900">
                        {formatDurationMs(summary.avg_ttfb_ms)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs font-medium tabular-nums text-slate-900">
                        {formatTokensPerSecond(summary.avg_output_tokens_per_second)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-3 font-mono text-xs font-medium tabular-nums text-slate-500">
                        —
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
