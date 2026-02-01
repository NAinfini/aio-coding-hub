import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWindowForeground } from "../useWindowForeground";

describe("hooks/useWindowForeground", () => {
  it("does nothing when disabled", () => {
    const onForeground = vi.fn();
    renderHook(() => useWindowForeground({ enabled: false, onForeground, throttleMs: 1000 }));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onForeground).not.toHaveBeenCalled();
  });

  it("fires on focus/visibility with throttle", () => {
    vi.useFakeTimers();
    const base = 1_700_000_000_000;
    vi.setSystemTime(base);

    const onForeground = vi.fn();
    renderHook(() => useWindowForeground({ enabled: true, onForeground, throttleMs: 1000 }));

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onForeground).toHaveBeenCalledTimes(1);

    vi.setSystemTime(base + 500);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onForeground).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    vi.setSystemTime(base + 1100);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onForeground).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
