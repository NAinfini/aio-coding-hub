import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hasTauriRuntime } from "../services/tauriInvoke";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "aio-theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Sync native window titlebar theme with the resolved app theme. */
function syncNativeTheme(theme: Theme) {
  if (!hasTauriRuntime()) return;

  const nativeTheme = theme === "system" ? null : theme;
  try {
    getCurrentWindow()
      .setTheme(nativeTheme ?? undefined)
      .catch(() => {
        // Non-Tauri environment (browser dev) — ignore silently.
      });
  } catch {
    // Non-Tauri environment (browser dev / tests) — ignore silently.
  }
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  syncNativeTheme(theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as Theme) || "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    return theme === "system" ? getSystemTheme() : theme;
  });

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    setResolvedTheme(next === "system" ? getSystemTheme() : next);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    setResolvedTheme(theme === "system" ? getSystemTheme() : theme);
  }, [theme]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyTheme("system");
      setResolvedTheme(getSystemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, resolvedTheme, setTheme } as const;
}
