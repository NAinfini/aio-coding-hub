import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTheme: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../services/tauriInvoke", () => ({
  hasTauriRuntime: () => false,
}));

describe("hooks/useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  async function importFreshUseTheme() {
    vi.resetModules();
    return await import("../useTheme");
  }

  it("defaults to system theme", async () => {
    const { useTheme } = await importFreshUseTheme();
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("system");
    // matchMedia mock returns matches:false, so resolvedTheme = "light"
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("setTheme(dark) updates theme and classList", async () => {
    const { useTheme } = await importFreshUseTheme();
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("aio-theme")).toBe("dark");
  });

  it("setTheme(light) removes dark class", async () => {
    const { useTheme } = await importFreshUseTheme();
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.setTheme("light");
    });
    expect(result.current.theme).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("reads stored theme from localStorage", async () => {
    localStorage.setItem("aio-theme", "dark");
    const { useTheme } = await importFreshUseTheme();
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("setTheme(system) follows matchMedia", async () => {
    localStorage.setItem("aio-theme", "dark");
    const { useTheme } = await importFreshUseTheme();
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("system");
    });

    expect(result.current.theme).toBe("system");
    // matchMedia mock returns matches:false → light
    expect(result.current.resolvedTheme).toBe("light");
  });
});
