import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UsageHeatmap15d } from "../UsageHeatmap15d";
import { dayKeyFromLocalDate } from "../../utils/dateKeys";

describe("components/UsageHeatmap15d", () => {
  it("renders grid, supports hover tooltip, and triggers refresh", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));

    const day = dayKeyFromLocalDate(new Date());
    const rows = [
      {
        day,
        hour: 3,
        requests_total: 10,
        requests_with_usage: 10,
        requests_success: 9,
        requests_failed: 1,
        total_tokens: 2_500_000,
      },
    ] as any[];

    const onRefresh = vi.fn();

    const { container } = render(
      <UsageHeatmap15d rows={rows} days={1} onRefresh={onRefresh} refreshing={false} />
    );

    const cells = container.querySelectorAll("div[style*='aspect-ratio']");
    expect(cells).toHaveLength(24);

    // Hover hour=3 cell
    fireEvent.mouseEnter(cells[3] as Element);
    expect(screen.getByText(new RegExp(`^${day} 03:00$`))).toBeInTheDocument();
    expect(screen.getByText("请求")).toBeInTheDocument();
    expect(screen.getByText("成功率")).toBeInTheDocument();
    expect(screen.getByText("Token")).toBeInTheDocument();

    // Refresh button
    fireEvent.click(screen.getByTitle("刷新"));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Hide tooltip
    fireEvent.mouseLeave(container.firstElementChild as Element);
    expect(screen.queryByText(new RegExp(`^${day} 03:00$`))).not.toBeInTheDocument();
  });

  it("clamps tooltip position and chooses placement=above when there is enough space", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));

    const day = dayKeyFromLocalDate(new Date());
    const rows = [
      {
        day,
        hour: 0,
        requests_total: 0,
        requests_with_usage: 0,
        requests_success: 0,
        requests_failed: 0,
        total_tokens: 0,
      },
    ] as any[];

    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    getBoundingClientRect.mockImplementation(() => {
      return {
        x: 10,
        y: 400,
        top: 400,
        left: 10,
        bottom: 420,
        right: 30,
        width: 20,
        height: 20,
        toJSON() {},
      } as any;
    });

    const { container } = render(<UsageHeatmap15d rows={rows} days={1} />);
    const cells = container.querySelectorAll("div[style*='aspect-ratio']");
    fireEvent.mouseEnter(cells[0] as Element);

    expect(screen.getByText("↑ 本地时间")).toBeInTheDocument();

    getBoundingClientRect.mockRestore();
  });
});
