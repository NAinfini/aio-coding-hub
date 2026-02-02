import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { clearTauriRuntime, setTauriRuntime } from "../../../test/utils/tauriRuntime";
import { useCustomDateRange } from "../../../hooks/useCustomDateRange";
import { useCostAnalyticsV1Query } from "../../../query/cost";
import { HomeCostPanel } from "../HomeCostPanel";

vi.mock("sonner", () => ({ toast: vi.fn() }));

const chartOptions: any[] = [];

vi.mock("../../charts/EChartsCanvas", () => ({
  EChartsCanvas: ({ option }: any) => {
    chartOptions.push(option);
    return <div data-testid="echarts" />;
  },
}));

vi.mock("../../../hooks/useCustomDateRange", async () => {
  const actual = await vi.importActual<typeof import("../../../hooks/useCustomDateRange")>(
    "../../../hooks/useCustomDateRange"
  );
  return { ...actual, useCustomDateRange: vi.fn() };
});

vi.mock("../../../query/cost", async () => {
  const actual = await vi.importActual<typeof import("../../../query/cost")>("../../../query/cost");
  return {
    ...actual,
    useCostAnalyticsV1Query: vi.fn(),
  };
});

describe("components/home/HomeCostPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chartOptions.length = 0;
  });

  it("renders with data and allows selecting a top request", () => {
    setTauriRuntime();

    vi.mocked(useCustomDateRange).mockReturnValue({
      customStartDate: "",
      setCustomStartDate: vi.fn(),
      customEndDate: "",
      setCustomEndDate: vi.fn(),
      customApplied: null,
      bounds: { startTs: null, endTs: null },
      showCustomForm: false,
      applyCustomRange: vi.fn(),
      clearCustomRange: vi.fn(),
    } as any);

    vi.mocked(useCostAnalyticsV1Query).mockReturnValue({
      data: {
        summary: {
          requests_total: 100,
          requests_success: 90,
          requests_failed: 10,
          cost_covered_success: 80,
          total_cost_usd: 12.34,
          avg_cost_usd_per_covered_success: 0.12,
        },
        trend: [
          {
            day: "2026-01-01",
            hour: null,
            cost_usd: 1.2,
            requests_success: 3,
            cost_covered_success: 2,
          },
        ],
        providers: [
          {
            cli_key: "claude",
            provider_id: 1,
            provider_name: "P1",
            requests_success: 10,
            cost_covered_success: 8,
            cost_usd: 3.21,
          },
        ],
        models: [
          {
            model: "claude-3-opus",
            requests_success: 10,
            cost_covered_success: 8,
            cost_usd: 3.21,
          },
        ],
        scatter: [
          {
            cli_key: "claude",
            provider_name: "P1",
            model: "claude-3-opus",
            requests_success: 10,
            total_cost_usd: 3.21,
            total_duration_ms: 1234,
          },
        ],
        topRequests: [
          {
            log_id: 1,
            trace_id: "t1",
            cli_key: "claude",
            method: "POST",
            path: "/v1/messages",
            requested_model: "claude-3-opus",
            provider_id: 1,
            provider_name: "P1",
            duration_ms: 1234,
            ttfb_ms: 120,
            cost_usd: 1.23,
            cost_multiplier: 1,
            created_at: Math.floor(Date.now() / 1000),
          },
          {
            log_id: 2,
            trace_id: "t2",
            cli_key: "claude",
            method: "POST",
            path: "/v1/messages",
            requested_model: " ",
            provider_id: 2,
            provider_name: "P2",
            duration_ms: 2222,
            ttfb_ms: 220,
            cost_usd: 2.34,
            cost_multiplier: 1.5,
            created_at: Math.floor(Date.now() / 1000),
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const _unusedSelectLogId = vi.fn();

    render(<HomeCostPanel />);

    expect(screen.getByText("Top 50 最贵请求")).toBeInTheDocument();

    fireEvent.click(screen.getByText("P1"));
    expect(_unusedSelectLogId).toHaveBeenCalledWith(1);

    expect(screen.getByText("x1.50")).toBeInTheDocument();
    expect(screen.getByText("未知")).toBeInTheDocument();

    fireEvent.click(screen.getByText("P2"));
    expect(_unusedSelectLogId).toHaveBeenCalledWith(2);
  });

  it("drives filter controls and triggers refetch", () => {
    setTauriRuntime();

    vi.mocked(useCustomDateRange).mockReturnValue({
      customStartDate: "",
      setCustomStartDate: vi.fn(),
      customEndDate: "",
      setCustomEndDate: vi.fn(),
      customApplied: null,
      bounds: { startTs: null, endTs: null },
      showCustomForm: false,
      applyCustomRange: vi.fn(),
      clearCustomRange: vi.fn(),
    } as any);

    const refetch = vi.fn();
    vi.mocked(useCostAnalyticsV1Query).mockReturnValue({
      data: {
        summary: {
          requests_total: 10,
          requests_success: 10,
          requests_failed: 0,
          cost_covered_success: 10,
          total_cost_usd: 1.23,
          avg_cost_usd_per_covered_success: 0.12,
        },
        trend: [
          {
            day: "2026-01-01",
            hour: 1,
            cost_usd: 1.2,
            requests_success: 3,
            cost_covered_success: 2,
          },
        ],
        providers: [
          {
            cli_key: "claude",
            provider_id: 1,
            provider_name: "P1",
            requests_success: 10,
            cost_covered_success: 8,
            cost_usd: 3.21,
          },
        ],
        models: [
          {
            model: "claude-3-opus",
            requests_success: 10,
            cost_covered_success: 8,
            cost_usd: 3.21,
          },
        ],
        scatter: [],
        topRequests: [],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch,
    } as any);

    render(<HomeCostPanel />);

    // Top refresh button.
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(refetch).toHaveBeenCalled();

    // Filter rows.
    const cliRow = screen.getByText("CLI：").parentElement;
    expect(cliRow).toBeTruthy();
    fireEvent.click(within(cliRow as HTMLElement).getByRole("button", { name: "Codex" }));

    const periodRow = screen.getByText("时间窗：").parentElement;
    expect(periodRow).toBeTruthy();
    fireEvent.click(within(periodRow as HTMLElement).getByRole("button", { name: "近 7 天" }));

    const providerRow = screen.getByText("供应商：").parentElement;
    expect(providerRow).toBeTruthy();
    const providerSelect = within(providerRow as HTMLElement).getByRole("combobox");
    fireEvent.change(providerSelect, { target: { value: "1" } });
    fireEvent.change(providerSelect, { target: { value: "0" } });
    fireEvent.change(providerSelect, { target: { value: "all" } });

    const modelRow = screen.getByText("模型：").parentElement;
    expect(modelRow).toBeTruthy();
    const modelSelect = within(modelRow as HTMLElement).getByRole("combobox");
    fireEvent.change(modelSelect, { target: { value: "claude-3-opus" } });
    fireEvent.change(modelSelect, { target: { value: "all" } });

    // Chart filter buttons are separate handlers.
    const trendHeader = screen.getByText("总花费趋势").parentElement?.parentElement;
    expect(trendHeader).toBeTruthy();
    fireEvent.click(within(trendHeader as HTMLElement).getByRole("button", { name: "Claude" }));

    const scatterHeader = screen.getByText("总成本 × 总耗时").parentElement;
    expect(scatterHeader).toBeTruthy();
    fireEvent.click(within(scatterHeader as HTMLElement).getByRole("button", { name: "Claude" }));

    // Query hook should have been called with multiple periods/filters across rerenders.
    const calls = vi.mocked(useCostAnalyticsV1Query).mock.calls;
    expect(calls.some((call) => call[0] === "weekly")).toBe(true);
    expect(calls.some((call) => call[1]?.cliKey === "codex")).toBe(true);
  });

  it("shows tauri hint when runtime is unavailable", () => {
    clearTauriRuntime();

    vi.mocked(useCustomDateRange).mockReturnValue({
      customStartDate: "",
      setCustomStartDate: vi.fn(),
      customEndDate: "",
      setCustomEndDate: vi.fn(),
      customApplied: null,
      bounds: { startTs: null, endTs: null },
      showCustomForm: false,
      applyCustomRange: vi.fn(),
      clearCustomRange: vi.fn(),
    } as any);

    vi.mocked(useCostAnalyticsV1Query).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<HomeCostPanel />);
    expect(screen.getByText(/未检测到 Tauri Runtime/)).toBeInTheDocument();
  });

  it("renders custom range controls and triggers apply/clear handlers", () => {
    setTauriRuntime();

    const applyCustomRange = vi.fn();
    const clearCustomRange = vi.fn();
    const setCustomStartDate = vi.fn();
    const setCustomEndDate = vi.fn();

    vi.mocked(useCustomDateRange).mockImplementation((period: any) => {
      const custom = period === "custom";
      return {
        customStartDate: "2026-01-01",
        setCustomStartDate,
        customEndDate: "2026-01-03",
        setCustomEndDate,
        customApplied: null,
        bounds: { startTs: null, endTs: null },
        showCustomForm: custom,
        applyCustomRange,
        clearCustomRange,
      } as any;
    });

    vi.mocked(useCostAnalyticsV1Query).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<HomeCostPanel />);

    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-01-01")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("2026-01-01"), { target: { value: "2026-01-02" } });
    expect(setCustomStartDate).toHaveBeenCalledWith("2026-01-02");
    fireEvent.change(screen.getByDisplayValue("2026-01-03"), { target: { value: "2026-01-04" } });
    expect(setCustomEndDate).toHaveBeenCalledWith("2026-01-04");

    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    expect(applyCustomRange).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(clearCustomRange).toHaveBeenCalled();

    expect(screen.getByText('请选择日期范围后点击"应用"')).toBeInTheDocument();
  });

  it("toasts when cost query errors", async () => {
    setTauriRuntime();

    vi.mocked(useCustomDateRange).mockReturnValue({
      customStartDate: "",
      setCustomStartDate: vi.fn(),
      customEndDate: "",
      setCustomEndDate: vi.fn(),
      customApplied: null,
      bounds: { startTs: null, endTs: null },
      showCustomForm: false,
      applyCustomRange: vi.fn(),
      clearCustomRange: vi.fn(),
    } as any);

    const refetch = vi.fn();
    vi.mocked(useCostAnalyticsV1Query).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
      error: new Error("boom"),
      refetch,
    } as any);

    render(<HomeCostPanel />);
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith("加载花费失败：请重试（详情见页面错误信息）");
    });
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders loading skeleton cards and triggers onInvalid callback", async () => {
    setTauriRuntime();

    vi.mocked(useCustomDateRange).mockImplementation((period: any, options: any) => {
      void period;
      if (typeof options?.onInvalid === "function") {
        options.onInvalid("bad-range");
      }
      return {
        customStartDate: "",
        setCustomStartDate: vi.fn(),
        customEndDate: "",
        setCustomEndDate: vi.fn(),
        customApplied: null,
        bounds: { startTs: null, endTs: null },
        showCustomForm: false,
        applyCustomRange: vi.fn(),
        clearCustomRange: vi.fn(),
      } as any;
    });

    vi.mocked(useCostAnalyticsV1Query).mockReturnValue({
      data: null,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<HomeCostPanel />);

    expect(toast).toHaveBeenCalledWith("bad-range");
    expect(document.querySelectorAll(".animate-pulse").length).toBe(3);
  });

  it("executes chart formatters for branch/function coverage", async () => {
    setTauriRuntime();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T00:00:00Z"));

    vi.mocked(useCustomDateRange).mockImplementation((period: any) => {
      const customApplied =
        period === "custom"
          ? {
              startTs: Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000),
              endTs: Math.floor(new Date("2026-01-03T00:00:00Z").getTime() / 1000) + 1,
            }
          : null;
      return {
        customStartDate: "2026-01-01",
        setCustomStartDate: vi.fn(),
        customEndDate: "2026-01-03",
        setCustomEndDate: vi.fn(),
        customApplied,
        bounds: { startTs: customApplied?.startTs ?? null, endTs: customApplied?.endTs ?? null },
        showCustomForm: period === "custom",
        applyCustomRange: vi.fn(),
        clearCustomRange: vi.fn(),
      } as any;
    });

    vi.mocked(useCostAnalyticsV1Query).mockReturnValue({
      data: {
        summary: {
          requests_total: 10,
          requests_success: 10,
          requests_failed: 0,
          cost_covered_success: 10,
          total_cost_usd: 12.34,
          avg_cost_usd_per_covered_success: 0.12,
        },
        trend: [
          {
            day: "2026-01-01",
            hour: null,
            cost_usd: 1,
            requests_success: 1,
            cost_covered_success: 1,
          },
          {
            day: "2026-01-02",
            hour: null,
            cost_usd: 2,
            requests_success: 1,
            cost_covered_success: 1,
          },
          {
            day: "2026-01-03",
            hour: null,
            cost_usd: 3,
            requests_success: 1,
            cost_covered_success: 1,
          },
        ],
        providers: Array.from({ length: 10 }).map((_, idx) => ({
          cli_key: "claude",
          provider_id: idx + 1,
          provider_name: `P${idx + 1}`,
          requests_success: 10,
          cost_covered_success: 8,
          cost_usd: 10 - idx,
        })),
        models: Array.from({ length: 10 }).map((_, idx) => ({
          model: `M${idx + 1}`,
          requests_success: 10,
          cost_covered_success: 8,
          cost_usd: 10 - idx,
        })),
        scatter: [
          {
            cli_key: "claude",
            provider_name: "  ",
            model: "",
            requests_success: 0,
            total_cost_usd: 3.21,
            total_duration_ms: 1234,
          },
          {
            cli_key: "claude",
            provider_name: "P1",
            model: "M1",
            requests_success: 2,
            total_cost_usd: 5,
            total_duration_ms: 1000,
          },
          {
            cli_key: "codex",
            provider_name: "P2",
            model: "M2",
            requests_success: 1,
            total_cost_usd: 6,
            total_duration_ms: 2000,
          },
        ],
        topRequests: [],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<HomeCostPanel />);

    // Switch to monthly and custom to hit day-key builders.
    fireEvent.click(screen.getByRole("button", { name: "本月" }));
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));

    const hourlyLineOption = chartOptions.find(
      (o) => o?.series?.[0]?.type === "line" && o?.xAxis?.axisLabel?.interval === 3
    );
    expect(hourlyLineOption).toBeTruthy();
    hourlyLineOption.tooltip.valueFormatter(1.23);
    hourlyLineOption.yAxis.axisLabel.formatter(12.3);

    const dailyLineOption = chartOptions.find(
      (o) => o?.series?.[0]?.type === "line" && o?.xAxis?.axisLabel?.interval === 2
    );
    expect(dailyLineOption).toBeTruthy();
    dailyLineOption.tooltip.valueFormatter(1.23);
    dailyLineOption.yAxis.axisLabel.formatter(12.3);

    const pieOptions = chartOptions.filter((o) => o?.series?.[0]?.type === "pie");
    expect(pieOptions.length).toBeGreaterThan(0);
    for (const opt of pieOptions) {
      opt.tooltip.formatter({ name: "X", value: 1.2, percent: 50 });
      opt.series[0].label.formatter();
    }

    const scatterOption = chartOptions.find((o) => o?.series?.[0]?.type === "scatter");
    expect(scatterOption).toBeTruthy();
    scatterOption.series[0].symbolSize([0, 0]);
    scatterOption.series[0].label.formatter({ data: {} });
    scatterOption.series[0].label.formatter({ data: { meta: { provider_name: "", model: "" } } });
    scatterOption.tooltip.formatter({ data: {} });
    scatterOption.tooltip.formatter({
      data: {
        meta: {
          cli_key: "claude",
          provider_name: "P1",
          model: "M1",
          requests_success: 0,
          total_cost_usd: 1,
          total_duration_ms: 1,
        },
      },
    });
    scatterOption.tooltip.formatter({
      data: {
        meta: {
          cli_key: "claude",
          provider_name: "P1",
          model: "M1",
          requests_success: 2,
          total_cost_usd: 10,
          total_duration_ms: 1000,
        },
      },
    });
    scatterOption.tooltip.formatter({
      data: {
        meta: {
          cli_key: "claude",
          provider_name: "  ",
          model: "",
          requests_success: Infinity,
          total_cost_usd: 10,
          total_duration_ms: 1000,
        },
      },
    });
    scatterOption.xAxis.axisLabel.formatter(1.23);
    scatterOption.xAxis.axisPointer.label.formatter({ value: 1 });
    scatterOption.yAxis.axisLabel.formatter(1000);

    vi.useRealTimers();
  });
});
