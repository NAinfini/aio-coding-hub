import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCustomDateRange } from "../useCustomDateRange";

describe("hooks/useCustomDateRange", () => {
  it("returns null bounds when not using custom period", () => {
    const { result } = renderHook(() => useCustomDateRange("24h"));
    expect(result.current.showCustomForm).toBe(false);
    expect(result.current.bounds).toEqual({ startTs: null, endTs: null });
  });

  it("validates and applies/clears custom range", () => {
    const onInvalid = vi.fn();
    const { result } = renderHook(() => useCustomDateRange("custom", { onInvalid }));

    act(() => {
      expect(result.current.applyCustomRange()).toBe(false);
    });
    expect(onInvalid).toHaveBeenCalledWith("请选择有效的开始/结束日期");

    act(() => {
      result.current.setCustomStartDate("2026-01-02");
      result.current.setCustomEndDate("2026-01-01");
    });
    act(() => {
      expect(result.current.applyCustomRange()).toBe(false);
    });
    expect(onInvalid).toHaveBeenCalledWith("日期范围无效：结束日期必须不早于开始日期");

    act(() => {
      result.current.setCustomStartDate("2026-01-01");
      result.current.setCustomEndDate("2026-01-03");
    });
    act(() => {
      expect(result.current.applyCustomRange()).toBe(true);
    });
    expect(result.current.bounds.startTs).not.toBeNull();
    expect(result.current.bounds.endTs).not.toBeNull();

    act(() => {
      result.current.clearCustomRange();
    });
    expect(result.current.customApplied).toBeNull();
    expect(result.current.customStartDate).toBe("");
    expect(result.current.customEndDate).toBe("");
  });
});
