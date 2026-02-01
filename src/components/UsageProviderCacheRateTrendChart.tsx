import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { CustomDateRangeApplied } from "../hooks/useCustomDateRange";
import type { UsagePeriod, UsageProviderCacheRateTrendRowV1 } from "../services/usage";
import { cn } from "../utils/cn";
import { buildRecentDayKeys, dayKeyFromLocalDate } from "../utils/dateKeys";
import { parseYyyyMmDd } from "../utils/localDate";
import { formatInteger, formatPercent } from "../utils/formatters";
import { EChartsCanvas } from "./charts/EChartsCanvas";

function toMmDd(dayKey: string) {
  const mmdd = dayKey.slice(5);
  return mmdd.replace("-", "/");
}

function buildDayKeysInRangeInclusive(startDay: string, endDay: string): string[] {
  const start = parseYyyyMmDd(startDay);
  const end = parseYyyyMmDd(endDay);
  if (!start || !end) return [];

  const startDate = new Date(start.year, start.month - 1, start.day, 0, 0, 0, 0);
  const endDate = new Date(end.year, end.month - 1, end.day, 0, 0, 0, 0);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return [];

  const out: string[] = [];
  const d = new Date(startDate);
  while (d.getTime() <= endDate.getTime()) {
    out.push(dayKeyFromLocalDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function buildMonthToTodayDayKeys(): string[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(now.getTime())) return [];

  const out: string[] = [];
  const d = new Date(start);
  while (d.getTime() <= now.getTime()) {
    out.push(dayKeyFromLocalDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function buildMonthKeysFromData(rows: UsageProviderCacheRateTrendRowV1[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (!row.day) continue;
    // AllTime 聚合会返回 YYYY-MM
    if (/^\d{4}-\d{2}$/.test(row.day)) set.add(row.day);
  }
  return Array.from(set).sort();
}

type PointMeta = {
  denomTokens: number;
  cacheReadTokens: number;
  requestsSuccess: number;
};

const WARN_THRESHOLD = 0.6;

function pickPaletteColor(index: number): string {
  const palette = [
    "#0052FF",
    "#7C3AED",
    "#16A34A",
    "#F97316",
    "#DC2626",
    "#0EA5E9",
    "#9333EA",
    "#059669",
    "#EA580C",
    "#B91C1C",
  ];
  if (index < palette.length) return palette[index] ?? "#0052FF";

  const hue = (index * 137.508) % 360;
  return `hsl(${hue} 70% 45%)`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function UsageProviderCacheRateTrendChart({
  rows,
  period,
  customApplied,
  className,
}: {
  rows: UsageProviderCacheRateTrendRowV1[];
  period: UsagePeriod;
  customApplied: CustomDateRangeApplied | null;
  className?: string;
}) {
  const option = useMemo(() => {
    const isHourly = period === "daily";
    const isAllTime = period === "allTime";

    const xKeys = (() => {
      if (isHourly) {
        return Array.from({ length: 24 }).map((_, h) => String(h).padStart(2, "0"));
      }
      if (isAllTime) {
        return buildMonthKeysFromData(rows);
      }
      if (period === "weekly") return buildRecentDayKeys(7);
      if (period === "monthly") return buildMonthToTodayDayKeys();
      if (period === "custom" && customApplied) {
        return buildDayKeysInRangeInclusive(customApplied.startDate, customApplied.endDate);
      }
      return [];
    })();

    const xLabels = (() => {
      if (isHourly) return xKeys;
      if (isAllTime) return xKeys;
      return xKeys.map(toMmDd);
    })();

    const byProvider = new Map<
      string,
      {
        name: string;
        totalDenomTokens: number;
        points: Map<string, UsageProviderCacheRateTrendRowV1>;
      }
    >();

    for (const row of rows) {
      const key = row.key;
      if (!key) continue;
      const provider = byProvider.get(key) ?? {
        name: row.name || row.key,
        totalDenomTokens: 0,
        points: new Map(),
      };

      const xKey = (() => {
        if (isHourly) {
          const h = row.hour == null ? NaN : Number(row.hour);
          if (!Number.isFinite(h)) return null;
          return String(h).padStart(2, "0");
        }
        return row.day || null;
      })();
      if (!xKey) continue;

      provider.name = row.name || provider.name;
      provider.totalDenomTokens += Number(row.denom_tokens) || 0;
      provider.points.set(xKey, row);
      byProvider.set(key, provider);
    }

    const providers = Array.from(byProvider.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.totalDenomTokens - a.totalDenomTokens);

    const warnAtX = Array.from({ length: xKeys.length }).fill(false) as boolean[];
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;

    const series = providers.map((provider, idx) => {
      const color = pickPaletteColor(idx);

      const data = xKeys.map((xKey, xIndex) => {
        const row = provider.points.get(xKey);
        if (!row) return null;

        const denom = Number(row.denom_tokens) || 0;
        const read = Number(row.cache_read_input_tokens) || 0;
        const ok = Number(row.requests_success) || 0;
        if (!Number.isFinite(denom) || denom <= 0) return null;

        const rateRaw = read / denom;
        if (!Number.isFinite(rateRaw)) return null;

        const value = Math.max(0, Math.min(1, rateRaw));
        globalMin = Math.min(globalMin, value);
        globalMax = Math.max(globalMax, value);
        if (value < WARN_THRESHOLD) warnAtX[xIndex] = true;

        return {
          value,
          denomTokens: denom,
          cacheReadTokens: read,
          requestsSuccess: ok,
        };
      });

      return {
        name: provider.name,
        type: "line",
        data,
        showSymbol: false,
        smooth: true,
        lineStyle: { color, width: providers.length > 25 ? 1.5 : 2 },
        emphasis: { focus: "series" },
      };
    });

    const yAxisRange = (() => {
      if (!Number.isFinite(globalMin) || !Number.isFinite(globalMax)) {
        return { min: 0, max: 1, interval: 0.1 };
      }

      const span = Math.max(0.02, globalMax - globalMin);
      const pad = Math.min(0.15, span * 0.25 + 0.02);

      let min = Math.max(0, globalMin - pad);
      let max = Math.min(1, globalMax + pad);

      if (max - min < 0.08) {
        const mid = (min + max) / 2;
        min = Math.max(0, mid - 0.04);
        max = Math.min(1, mid + 0.04);
      }

      const nextSpan = max - min;
      const interval = (() => {
        // Use fixed, "percent-friendly" steps (divides 1.0) to avoid uneven last tick spacing.
        const steps = [0.01, 0.02, 0.05, 0.1];
        const maxTicks = 10;
        return steps.find((step) => Math.ceil(nextSpan / step) <= maxTicks) ?? 0.1;
      })();

      min = Math.floor(min / interval) * interval;
      max = Math.ceil(max / interval) * interval;

      min = Math.max(0, min);
      max = Math.min(1, max);

      if (max - min < interval) {
        max = Math.min(1, min + interval);
      }

      return {
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        interval,
      };
    })();

    const warnRanges = (() => {
      if (xLabels.length === 0) return [];

      const ranges: Array<[number, number]> = [];
      let start: number | null = null;
      for (let i = 0; i < warnAtX.length; i += 1) {
        if (warnAtX[i]) {
          if (start == null) start = i;
          continue;
        }
        if (start != null) {
          ranges.push([start, i - 1]);
          start = null;
        }
      }
      if (start != null) ranges.push([start, warnAtX.length - 1]);

      return ranges
        .filter(([from, to]) => xLabels[from] != null && xLabels[to] != null)
        .map(([from, to]) => [{ xAxis: xLabels[from]! }, { xAxis: xLabels[to]! }]);
    })();

    const warnOverlaySeries = {
      name: "__warn_threshold_60__",
      type: "line",
      data: xLabels.map(() => WARN_THRESHOLD),
      symbol: "none",
      showSymbol: false,
      silent: true,
      lineStyle: { color: "rgba(220,38,38,0.70)", width: 1, type: "dashed" },
      tooltip: { show: false },
      emphasis: { disabled: true },
      ...(warnRanges.length > 0
        ? {
            markArea: {
              silent: true,
              itemStyle: { color: "rgba(220,38,38,0.06)" },
              data: warnRanges,
            },
          }
        : null),
    };

    const allSeries = [warnOverlaySeries, ...series];

    const opt: EChartsOption = {
      animation: false,
      color: providers.map((_, idx) => pickPaletteColor(idx)),
      grid: { left: 0, right: 16, top: 56, bottom: 24, containLabel: true },
      legend: {
        type: "scroll",
        top: 8,
        left: 0,
        right: 16,
        data: providers.map((provider) => provider.name),
        textStyle: { color: "#475569", fontSize: 11 },
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "line" },
        formatter: (params) => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as any;
          const axis = String(first?.axisValueLabel ?? first?.axisValue ?? first?.name ?? "");

          const lines: string[] = [];
          lines.push(`<div style=\"margin-bottom:6px;font-weight:600;\">${axis}</div>`);

          const items = list
            .map((item) => {
              const d = (item as any)?.data as (PointMeta & { value: number }) | null;
              const v = d?.value;
              if (v == null || !Number.isFinite(v)) return null;

              const name = String((item as any)?.seriesName ?? "");
              const color = String((item as any)?.color ?? "#0052FF");

              return {
                name,
                color,
                value: v,
                denomTokens: Number(d?.denomTokens) || 0,
                cacheReadTokens: Number(d?.cacheReadTokens) || 0,
                requestsSuccess: Number(d?.requestsSuccess) || 0,
              };
            })
            .filter((v): v is NonNullable<typeof v> => v != null);

          const warnItems = items
            .filter((item) => item.value < WARN_THRESHOLD)
            .sort((a, b) => a.value - b.value);
          const okItems = items
            .filter((item) => item.value >= WARN_THRESHOLD)
            .sort((a, b) => b.denomTokens - a.denomTokens);

          const MAX_ITEMS = 12;
          const renderItems = warnItems.length > 0 ? warnItems : okItems;
          const sliced = renderItems.slice(0, MAX_ITEMS);
          const hidden = renderItems.length - sliced.length;

          if (warnItems.length > 0) {
            lines.push(
              `<div style=\"margin-bottom:6px;color:#b91c1c;\">预警（<60%）: ${warnItems.length}</div>`
            );
          } else {
            lines.push(
              `<div style=\"margin-bottom:6px;color:#64748b;\">供应商: ${items.length}</div>`
            );
          }

          for (const item of sliced) {
            const name = escapeHtml(item.name);
            const color = escapeHtml(item.color);
            const isWarn = item.value < WARN_THRESHOLD;
            const valueColor = isWarn ? "#b91c1c" : "#0f172a";

            lines.push(
              `<div style=\"display:flex;align-items:center;gap:8px;\">\n` +
                `  <span style=\"display:inline-block;width:8px;height:8px;border-radius:999px;background:${color};\"></span>\n` +
                `  <span style=\"flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">${name}</span>\n` +
                `  <span style=\"font-variant-numeric:tabular-nums;color:${valueColor};\">${formatPercent(item.value, 2)}</span>\n` +
                `</div>` +
                `<div style=\"margin:2px 0 8px 16px;color:#64748b;font-size:11px;\">\n` +
                `  denom ${formatInteger(item.denomTokens)} · read ${formatInteger(item.cacheReadTokens)} · ok ${formatInteger(item.requestsSuccess)}\n` +
                `</div>`
            );
          }

          if (hidden > 0) {
            lines.push(
              `<div style=\"margin-top:4px;color:#64748b;\">… +${hidden}（可通过 legend 过滤）</div>`
            );
          }

          return lines.join("");
        },
      },
      xAxis: {
        type: "category",
        data: xLabels,
        boundaryGap: false,
        axisLabel: { color: "#64748b", fontSize: 10, interval: isHourly ? 1 : 2 },
        axisLine: { lineStyle: { color: "rgba(15,23,42,0.12)" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: yAxisRange.min,
        max: yAxisRange.max,
        interval: yAxisRange.interval,
        axisLabel: {
          color: "#64748b",
          fontSize: 10,
          formatter: (v: number) => formatPercent(v, 0),
        },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "rgba(0,82,255,0.10)", type: "dashed" } },
      },
      series: allSeries as any,
    };

    return opt;
  }, [customApplied, period, rows]);

  return <EChartsCanvas option={option} className={cn("h-full w-full", className)} />;
}
