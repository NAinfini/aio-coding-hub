// Usage:
// - Rendered by `src/pages/HomePage.tsx` when the Home tab is switched to "花费".
// - Provides cost analytics with period + CLI + provider + model filters and charts.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Label,
  ScatterChart,
  Scatter,
  ZAxis,
  LabelList,
} from "recharts";
import { cliShortLabel } from "../../constants/clis";
import { PERIOD_ITEMS } from "../../constants/periods";
import { useCustomDateRange } from "../../hooks/useCustomDateRange";
import { useTheme } from "../../hooks/useTheme";
import { useCostAnalyticsV1Query } from "../../query/cost";
import { hasTauriRuntime } from "../../services/tauriInvoke";
import type { CliKey } from "../../services/providers";
import type { CostPeriod, CostScatterCliProviderModelRowV1 } from "../../services/cost";
import { Card } from "../../ui/Card";
import { Input } from "../../ui/Input";
import { cn } from "../../utils/cn";
import { buildRecentDayKeys, dayKeyFromLocalDate } from "../../utils/dateKeys";
import {
  formatDurationMs,
  formatDurationMsShort,
  formatInteger,
  formatPercent,
  formatUsd,
  formatUsdShort,
} from "../../utils/formatters";
import { pickTopSlices, toDateLabel } from "../../utils/chartHelpers";
import {
  CHART_COLORS,
  getAxisStyle,
  getGridLineStyle,
  getTooltipStyle,
  getAxisLineStroke,
  getCursorStroke,
  CHART_ANIMATION,
} from "../charts/chartTheme";
import { Calendar, Filter, RefreshCw, ChevronDown } from "lucide-react";

type CliFilter = "all" | CliKey;

type CliItem = { key: CliFilter; label: string };

const CLI_ITEMS: CliItem[] = [
  { key: "all", label: "全部" },
  { key: "claude", label: "Claude" },
  { key: "codex", label: "Codex" },
  { key: "gemini", label: "Gemini" },
];

// Pie chart color palette
const PIE_COLORS = [
  "#0052FF",
  "#7C3AED",
  "#16A34A",
  "#F97316",
  "#DC2626",
  "#0EA5E9",
  "#9333EA",
  "#64748b",
];

// Scatter chart colors by CLI
const SCATTER_COLORS: Record<CliKey, string> = {
  claude: CHART_COLORS.primary,
  codex: CHART_COLORS.secondary,
  gemini: CHART_COLORS.success,
};

function buildDayKeysBetweenUnixSeconds(startTs: number, endTs: number) {
  const startMs = startTs * 1000;
  const endMs = (endTs - 1) * 1000;
  const start = new Date(startMs);
  const end = new Date(endMs);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(dayKeyFromLocalDate(cur));
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);
    if (out.length > 3660) break;
  }
  return out;
}

function buildMonthDayKeysToToday() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(dayKeyFromLocalDate(cur));
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);
    if (out.length > 62) break;
  }
  return out;
}

function StatCard({
  title,
  value,
  hint,
  className,
  "data-testid": testId,
}: {
  title: string;
  value: string;
  hint?: string;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <Card padding="md" className={cn("flex h-full flex-col", className)} data-testid={testId}>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 xl:text-xl">
        {value}
      </div>
      {hint ? (
        <div className="mt-auto pt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
      ) : null}
    </Card>
  );
}

function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card padding="md" className={cn("h-full animate-pulse", className)}>
      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-8 w-28 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-3 w-44 rounded bg-slate-100 dark:bg-slate-600" />
    </Card>
  );
}

// Trend Line Chart Component
function TrendAreaChart({
  data,
  isHourly,
  isDark,
}: {
  data: Array<{ label: string; cost: number }>;
  isHourly: boolean;
  isDark: boolean;
}) {
  const axisStyle = useMemo(() => getAxisStyle(isDark), [isDark]);
  const gridLineStyle = useMemo(() => getGridLineStyle(isDark), [isDark]);
  const tooltipStyle = useMemo(() => getTooltipStyle(isDark), [isDark]);
  const axisLineStroke = getAxisLineStroke(isDark);
  const cursorStroke = getCursorStroke(isDark);

  const xAxisTicks = useMemo(() => {
    const interval = isHourly ? 4 : 3;
    return data.filter((_, i) => i % interval === 0).map((d) => d.label);
  }, [data, isHourly]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="costAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          stroke={gridLineStyle.stroke}
          strokeDasharray={gridLineStyle.strokeDasharray}
        />
        <XAxis
          dataKey="label"
          axisLine={{ stroke: axisLineStroke }}
          tickLine={false}
          tick={{ ...axisStyle }}
          ticks={xAxisTicks}
          interval="preserveStartEnd"
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ ...axisStyle }}
          tickFormatter={formatUsdShort}
          width={50}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ fontWeight: 600, marginBottom: 4 }}
          formatter={(value: number) => [formatUsd(value), "Cost"]}
          cursor={{ stroke: cursorStroke, strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="cost"
          stroke={CHART_COLORS.primary}
          strokeWidth={3}
          fill="url(#costAreaGradient)"
          animationDuration={CHART_ANIMATION.animationDuration}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Donut Chart Component
function DonutChart({
  data,
  total,
  isDark,
}: {
  data: Array<{ name: string; value: number }>;
  total: number;
  isDark: boolean;
}) {
  const tooltipStyle = useMemo(() => getTooltipStyle(isDark), [isDark]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="50%"
          outerRadius="75%"
          paddingAngle={2}
          dataKey="value"
          animationDuration={CHART_ANIMATION.animationDuration}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={PIE_COLORS[index % PIE_COLORS.length]}
              stroke={isDark ? "#1e293b" : "#fff"}
              strokeWidth={2}
            />
          ))}
          <Label
            value={formatUsdShort(total)}
            position="center"
            style={{
              fontSize: 14,
              fontWeight: 600,
              fill: isDark ? "#e2e8f0" : "#334155",
            }}
          />
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [
            `${formatUsd(value)} (${((value / total) * 100).toFixed(1)}%)`,
            name,
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Scatter Chart Component
type ScatterPoint = {
  name: string;
  shortLabel: string;
  x: number;
  y: number;
  z: number;
  cli: CliKey;
  meta: CostScatterCliProviderModelRowV1;
};

function CostScatterChart({ data, isDark }: { data: ScatterPoint[]; isDark: boolean }) {
  const axisStyle = useMemo(() => getAxisStyle(isDark), [isDark]);
  const tooltipStyle = useMemo(() => getTooltipStyle(isDark), [isDark]);
  const axisLineStroke = getAxisLineStroke(isDark);

  const byCliData = useMemo(() => {
    const grouped: Record<CliKey, ScatterPoint[]> = {
      claude: [],
      codex: [],
      gemini: [],
    };
    for (const point of data) {
      grouped[point.cli]?.push(point);
    }
    return grouped;
  }, [data]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const point = payload[0]?.payload as ScatterPoint | undefined;
    if (!point) return null;

    const meta = point.meta;
    const cliLabel = cliShortLabel(meta.cli_key);
    const providerRaw = meta.provider_name?.trim() ? meta.provider_name.trim() : "Unknown";
    const modelRaw = meta.model?.trim() ? meta.model.trim() : "Unknown";
    const providerText = providerRaw === "Unknown" ? "未知" : providerRaw;
    const modelText = modelRaw === "Unknown" ? "未知" : modelRaw;
    const requests = Number.isFinite(meta.requests_success)
      ? Math.max(0, meta.requests_success)
      : 0;
    const avgCostUsd = requests > 0 ? meta.total_cost_usd / requests : null;
    const avgDurationMs = requests > 0 ? meta.total_duration_ms / requests : null;

    return (
      <div style={{ ...tooltipStyle, minWidth: 200 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          {cliLabel} · {providerText} · {modelText}
        </div>
        <div style={{ fontSize: 11, color: isDark ? "#94a3b8" : "#64748b" }}>
          总成本：{formatUsd(meta.total_cost_usd)}
        </div>
        <div style={{ fontSize: 11, color: isDark ? "#94a3b8" : "#64748b" }}>
          总耗时：{formatDurationMs(meta.total_duration_ms)}
        </div>
        <div style={{ fontSize: 11, color: isDark ? "#94a3b8" : "#64748b" }}>
          请求数：{formatInteger(requests)}
        </div>
        <div style={{ fontSize: 11, color: isDark ? "#cbd5e1" : "#94a3b8" }}>
          {avgCostUsd == null
            ? "均值：—"
            : `均值：${formatUsd(avgCostUsd)} / ${formatDurationMs(avgDurationMs ?? 0)}`}
        </div>
      </div>
    );
  };

  const cliOrder: CliKey[] = ["claude", "codex", "gemini"];
  const activeClis = cliOrder.filter((cli) => byCliData[cli].length > 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid
          stroke={isDark ? "rgba(100, 150, 255, 0.1)" : "rgba(15,23,42,0.08)"}
          strokeDasharray="3 3"
        />
        <XAxis
          type="number"
          dataKey="x"
          name="Cost"
          axisLine={{ stroke: axisLineStroke }}
          tickLine={false}
          tick={{ ...axisStyle }}
          tickFormatter={formatUsdShort}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Duration"
          axisLine={false}
          tickLine={false}
          tick={{ ...axisStyle }}
          tickFormatter={formatDurationMsShort}
          width={56}
        />
        <ZAxis type="number" dataKey="z" range={[60, 400]} />
        <Tooltip content={<CustomTooltip />} />
        {activeClis.map((cli) => (
          <Scatter
            key={cli}
            name={cliShortLabel(cli)}
            data={byCliData[cli]}
            fill={SCATTER_COLORS[cli]}
            fillOpacity={0.85}
            animationDuration={CHART_ANIMATION.animationDuration}
          >
            <LabelList
              dataKey="shortLabel"
              position="right"
              offset={6}
              style={{ fontSize: 9, fill: isDark ? "#cbd5e1" : "#94a3b8", fontWeight: 500 }}
            />
          </Scatter>
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function HomeCostPanel() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [period, setPeriod] = useState<CostPeriod>("daily");
  const [cliKey, setCliKey] = useState<CliFilter>("all");
  const [providerId, setProviderId] = useState<number | null>(null);
  const [model, setModel] = useState<string | null>(null);

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

  const [scatterCliFilter, setScatterCliFilter] = useState<CliFilter>("all");

  const filters = useMemo(() => {
    const filterCliKey = cliKey === "all" ? null : cliKey;
    return {
      cliKey: filterCliKey,
      providerId,
      model,
      ...bounds,
    };
  }, [bounds, cliKey, model, providerId]);

  const tauriRuntime = hasTauriRuntime();
  const queryEnabled = tauriRuntime && (period !== "custom" || Boolean(customApplied));

  const costQuery = useCostAnalyticsV1Query(period, filters, { enabled: queryEnabled });
  const loading = costQuery.isLoading;
  const fetching = costQuery.isFetching;
  const errorText = costQuery.error ? String(costQuery.error) : null;

  const tauriAvailable: boolean | null = !tauriRuntime
    ? false
    : !queryEnabled
      ? null
      : loading
        ? null
        : costQuery.data != null;

  const summary = costQuery.data?.summary ?? null;
  const trendRows = costQuery.data?.trend ?? [];
  const providerRows = costQuery.data?.providers ?? [];
  const modelRows = costQuery.data?.models ?? [];
  const scatterRows = costQuery.data?.scatter ?? [];

  useEffect(() => {
    if (!costQuery.error) return;
    toast("加载花费失败：请重试（详情见页面错误信息）");
  }, [costQuery.error]);

  const providerOptions = useMemo(() => {
    const sorted = providerRows.slice().sort((a, b) => b.cost_usd - a.cost_usd);
    return sorted.filter((row) => Number.isFinite(row.provider_id) && row.provider_id > 0);
  }, [providerRows]);

  const modelOptions = useMemo(() => {
    return modelRows.slice().sort((a, b) => b.cost_usd - a.cost_usd);
  }, [modelRows]);

  useEffect(() => {
    if (providerId == null) return;
    if (providerOptions.some((row) => row.provider_id === providerId)) return;
    setProviderId(null);
  }, [providerId, providerOptions]);

  useEffect(() => {
    if (model == null) return;
    if (modelOptions.some((row) => row.model === model)) return;
    setModel(null);
  }, [model, modelOptions]);

  const coverage = useMemo(() => {
    if (!summary) return null;
    const denom = summary.requests_success;
    if (!Number.isFinite(denom) || denom <= 0) return null;
    return summary.cost_covered_success / denom;
  }, [summary]);

  const trendDayKeys = useMemo(() => {
    if (period === "daily") return [];
    if (period === "weekly") return buildRecentDayKeys(7);
    if (period === "monthly") return buildMonthDayKeysToToday();
    if (period === "custom" && customApplied) {
      return buildDayKeysBetweenUnixSeconds(customApplied.startTs, customApplied.endTs);
    }
    const uniq = Array.from(new Set(trendRows.map((r) => r.day))).sort();
    return uniq;
  }, [customApplied, period, trendRows]);

  const trendChartData = useMemo(() => {
    const isHourly = period === "daily";

    if (isHourly) {
      const byHour = new Map<number, number>();
      for (const row of trendRows) {
        if (row.hour == null) continue;
        byHour.set(row.hour, Number(row.cost_usd) || 0);
      }
      return Array.from({ length: 24 }).map((_, h) => ({
        label: String(h).padStart(2, "0"),
        cost: byHour.get(h) ?? 0,
      }));
    }

    const byDay = new Map<string, number>();
    for (const row of trendRows) {
      byDay.set(row.day, Number(row.cost_usd) || 0);
    }
    return trendDayKeys.map((d) => ({
      label: toDateLabel(d),
      cost: byDay.get(d) ?? 0,
    }));
  }, [period, trendDayKeys, trendRows]);

  const providerDonutData = useMemo(() => {
    const filtered = providerRows.filter((row) => row.cost_usd > 0);
    const { head, tailSum } = pickTopSlices(filtered, 7);
    const seriesData = head.map((row) => ({
      name: `${cliShortLabel(row.cli_key)} · ${row.provider_name}`,
      value: row.cost_usd,
    }));
    if (tailSum > 0) seriesData.push({ name: "其他", value: tailSum });

    const total = seriesData.reduce((sum, d) => sum + d.value, 0);
    return { data: seriesData, total };
  }, [providerRows]);

  const modelDonutData = useMemo(() => {
    const filtered = modelRows.filter((row) => row.cost_usd > 0);
    const { head, tailSum } = pickTopSlices(filtered, 7);
    const seriesData = head.map((row) => ({
      name: row.model,
      value: row.cost_usd,
    }));
    if (tailSum > 0) seriesData.push({ name: "其他", value: tailSum });

    const total = seriesData.reduce((sum, d) => sum + d.value, 0);
    return { data: seriesData, total };
  }, [modelRows]);

  const scatterChartData = useMemo<{ data: ScatterPoint[]; activeClis: CliKey[] }>(() => {
    const symbolSize = (costForSizing: number) => {
      const size = 10 + Math.log10(1 + Math.max(0, costForSizing)) * 10;
      return Math.max(10, Math.min(26, size));
    };

    const filteredRows =
      scatterCliFilter === "all"
        ? scatterRows
        : scatterRows.filter((row) => row.cli_key === scatterCliFilter);

    const points: ScatterPoint[] = filteredRows.map((row) => {
      const providerRaw = row.provider_name?.trim() ? row.provider_name.trim() : "Unknown";
      const modelRaw = row.model?.trim() ? row.model.trim() : "Unknown";
      const providerText = providerRaw === "Unknown" ? "未知" : providerRaw;
      const modelText = modelRaw === "Unknown" ? "未知" : modelRaw;
      const cliLabel = cliShortLabel(row.cli_key);

      return {
        name: `${cliLabel} · ${providerText} · ${modelText}`,
        shortLabel: modelText,
        x: row.total_cost_usd,
        y: row.total_duration_ms,
        z: symbolSize(row.total_cost_usd),
        cli: row.cli_key,
        meta: row,
      };
    });

    const uniqueClis = new Set(points.map((p) => p.cli));
    const activeClis = (["claude", "codex", "gemini"] as CliKey[]).filter((c) => uniqueClis.has(c));

    return { data: points, activeClis };
  }, [scatterCliFilter, scatterRows]);

  const summaryCards = useMemo(() => {
    if (!summary) return [];

    const successHint = `${formatInteger(summary.requests_success)} 成功 · ${formatInteger(
      summary.requests_failed
    )} 失败`;

    return [
      {
        title: "总花费（已计算）",
        value: formatUsd(summary.total_cost_usd),
        hint: successHint,
        testId: "home-cost-total-cost",
      },
      {
        title: "成本覆盖率",
        value: coverage == null ? "—" : formatPercent(coverage, 1),
        hint: `${formatInteger(summary.cost_covered_success)} / ${formatInteger(
          summary.requests_success
        )} 成功请求有成本`,
        testId: "home-cost-coverage",
      },
    ];
  }, [coverage, summary]);

  const providerSelectValue = providerId == null ? "all" : String(providerId);
  const modelSelectValue = model == null ? "all" : model;

  return (
    <div className="flex flex-col gap-5 h-full overflow-auto">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card padding="md" className="lg:col-span-7" data-testid="home-cost-filter-panel">
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  筛选条件
                </span>
              </div>
              <button
                type="button"
                onClick={() => void costQuery.refetch()}
                disabled={fetching}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  fetching
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                    : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                )}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin")} />
                刷新
              </button>
            </div>

            {/* Primary Filters: CLI + Period in one row */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  CLI
                </span>
                <div className="flex items-center gap-1">
                  {CLI_ITEMS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setCliKey(item.key)}
                      disabled={fetching}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                        cliKey === item.key
                          ? "bg-indigo-500 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600",
                        fetching && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <div className="flex items-center gap-1">
                  {PERIOD_ITEMS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setPeriod(item.key)}
                      disabled={fetching}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                        period === item.key
                          ? "bg-indigo-500 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600",
                        fetching && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom Date Range */}
            {showCustomForm && (
              <div
                className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3"
                data-testid="home-cost-custom-range"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 flex-1">
                    <label className="sr-only" htmlFor="home-cost-custom-start-date">
                      开始日期
                    </label>
                    <Input
                      id="home-cost-custom-start-date"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.currentTarget.value)}
                      className="h-8 text-xs border-slate-200 dark:border-slate-700 flex-1"
                      disabled={fetching}
                    />
                    <span className="text-slate-400 dark:text-slate-500 text-xs">→</span>
                    <label className="sr-only" htmlFor="home-cost-custom-end-date">
                      结束日期
                    </label>
                    <Input
                      id="home-cost-custom-end-date"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.currentTarget.value)}
                      className="h-8 text-xs border-slate-200 dark:border-slate-700 flex-1"
                      disabled={fetching}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={applyCustomRange}
                      disabled={fetching}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        fetching
                          ? "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                          : "bg-indigo-500 text-white hover:bg-indigo-600"
                      )}
                    >
                      应用
                    </button>
                    <button
                      type="button"
                      onClick={clearCustomRange}
                      disabled={fetching}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                        fetching
                          ? "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      )}
                    >
                      清空
                    </button>
                    {customApplied && (
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
                        {customApplied.startDate} → {customApplied.endDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Filters */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  供应商
                </label>
                <div className="relative flex-1">
                  <select
                    value={providerSelectValue}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      if (v === "all") {
                        setProviderId(null);
                        return;
                      }
                      const n = Number(v);
                      if (!Number.isFinite(n) || n <= 0) {
                        setProviderId(null);
                        return;
                      }
                      setProviderId(Math.floor(n));
                    }}
                    disabled={fetching || tauriAvailable === false}
                    title="选择供应商"
                    className={cn(
                      "w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-8 py-1.5 text-xs text-slate-700 dark:text-slate-300",
                      "focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-100",
                      "disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed",
                      "appearance-none cursor-pointer"
                    )}
                  >
                    <option value="all">全部</option>
                    {providerOptions.map((row) => (
                      <option
                        key={`${row.cli_key}:${row.provider_id}`}
                        value={String(row.provider_id)}
                      >
                        {cliShortLabel(row.cli_key)} · {row.provider_name} (
                        {formatUsd(row.cost_usd)})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  模型
                </label>
                <div className="relative flex-1">
                  <select
                    value={modelSelectValue}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setModel(v === "all" ? null : v);
                    }}
                    disabled={fetching || tauriAvailable === false}
                    title="选择模型"
                    className={cn(
                      "w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-8 py-1.5 text-xs text-slate-700 dark:text-slate-300",
                      "focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-100",
                      "disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed",
                      "appearance-none cursor-pointer"
                    )}
                  >
                    <option value="all">全部</option>
                    {modelOptions.map((row) => (
                      <option key={row.model} value={row.model}>
                        {row.model} ({formatUsd(row.cost_usd)})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Tauri Warning */}
            {tauriAvailable === false && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                当前环境未检测到 Tauri Runtime。请通过桌面端运行后查看花费。
              </div>
            )}
          </div>
        </Card>

        <div className="lg:col-span-5 flex flex-col gap-3">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, idx) => (
                <StatCardSkeleton key={idx} />
              ))}
            </div>
          ) : summaryCards.length === 0 ? (
            <Card padding="md">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {period === "custom" && !customApplied
                  ? "自定义范围：请选择日期后点击「应用」。"
                  : "暂无花费数据。"}
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {summaryCards.map((card) => (
                <StatCard
                  key={card.title}
                  title={card.title}
                  value={card.value}
                  hint={card.hint}
                  data-testid={card.testId}
                />
              ))}
            </div>
          )}

          {/* Cost Distribution Donut Charts */}
          <Card
            padding="sm"
            className="flex flex-col min-h-[180px]"
            data-testid="home-cost-donut-charts"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                花费占比
              </div>
            </div>
            {loading ? (
              <div className="text-sm text-slate-400 dark:text-slate-500">加载中…</div>
            ) : summary && summary.requests_success > 0 ? (
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div className="flex flex-col">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    供应商
                  </div>
                  <div className="h-[140px]">
                    <DonutChart
                      data={providerDonutData.data}
                      total={providerDonutData.total}
                      isDark={isDark}
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    模型
                  </div>
                  <div className="h-[140px]">
                    <DonutChart
                      data={modelDonutData.data}
                      total={modelDonutData.total}
                      isDark={isDark}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {period === "custom" && !customApplied
                  ? "自定义范围：请选择日期后点击「应用」。"
                  : "暂无花费数据。"}
              </div>
            )}
          </Card>
        </div>
      </div>

      {errorText ? (
        <Card
          padding="md"
          className="border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/30"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-rose-900 dark:text-rose-400">加载失败</div>
              <div className="mt-1 text-sm text-rose-800 dark:text-rose-300">
                花费数据刷新失败，请重试。
              </div>
            </div>
            <button
              type="button"
              onClick={() => void costQuery.refetch()}
              disabled={fetching}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-all",
                "border border-rose-200 dark:border-rose-700 bg-white dark:bg-slate-800 text-rose-800 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30",
                fetching && "opacity-50 cursor-not-allowed"
              )}
            >
              重试
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-rose-200 dark:border-rose-700 bg-white/60 dark:bg-slate-800/60 p-3 font-mono text-xs text-slate-800 dark:text-slate-300">
            {errorText}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card
          padding="sm"
          className="lg:col-span-6 flex flex-col min-h-[320px]"
          data-testid="home-cost-trend-chart"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                总花费趋势
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {period === "daily" ? "按小时" : "按天"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {CLI_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCliKey(item.key)}
                    disabled={fetching}
                    className={cn(
                      "px-3 py-1 text-xs rounded-lg font-medium transition-all",
                      cliKey === item.key
                        ? "bg-indigo-500 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-slate-400 dark:text-slate-500">加载中…</div>
          ) : summary && summary.requests_success > 0 ? (
            <div className="h-[280px] flex-1">
              <TrendAreaChart data={trendChartData} isHourly={period === "daily"} isDark={isDark} />
            </div>
          ) : (
            <div className="text-sm text-slate-600 dark:text-slate-400">暂无可展示的数据。</div>
          )}
        </Card>

        <Card
          padding="sm"
          className="lg:col-span-6 flex flex-col min-h-[320px]"
          data-testid="home-cost-scatter-chart"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                总成本 × 总耗时
              </span>
              {scatterChartData.activeClis.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {scatterChartData.activeClis.map((cli) => (
                    <div key={cli} className="flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: SCATTER_COLORS[cli] }}
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {cliShortLabel(cli)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {CLI_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setScatterCliFilter(item.key)}
                  disabled={fetching}
                  className={cn(
                    "px-3 py-1 text-xs rounded-lg font-medium transition-all",
                    scatterCliFilter === item.key
                      ? "bg-indigo-500 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-slate-400 dark:text-slate-500">加载中…</div>
          ) : scatterRows.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">暂无可展示的数据。</div>
          ) : (
            <div className="h-[280px] flex-1 min-h-0">
              <CostScatterChart data={scatterChartData.data} isDark={isDark} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
