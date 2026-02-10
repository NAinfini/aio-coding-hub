import { useCallback, useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hasTauriRuntime } from "../services/tauriInvoke";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "aio-theme";

// ---------------------------------------------------------------------------
// Module-level shared store — single source of truth for ALL useTheme() calls
// ---------------------------------------------------------------------------

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (stored as Theme) || "system";
}

interface ThemeSnapshot {
  theme: Theme;
  resolvedTheme: "light" | "dark";
}

function resolve(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

let currentSnapshot: ThemeSnapshot = (() => {
  const t = readStoredTheme();
  return { theme: t, resolvedTheme: resolve(t) };
})();

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemeSnapshot {
  return currentSnapshot;
}

// SSR / test fallback — same as initial client snapshot
function getServerSnapshot(): ThemeSnapshot {
  return { theme: "system", resolvedTheme: "light" };
}

// ---------------------------------------------------------------------------
// Side-effects: DOM class + native titlebar
// ---------------------------------------------------------------------------

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
  const resolved = resolve(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  syncNativeTheme(theme);
}

// ---------------------------------------------------------------------------
// Store mutations
// ---------------------------------------------------------------------------

function setThemeInternal(next: Theme) {
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
  currentSnapshot = { theme: next, resolvedTheme: resolve(next) };
  emitChange();
}

// ---------------------------------------------------------------------------
// System theme media query listener (singleton, always active)
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    // Only react when the user preference is "system"
    if (currentSnapshot.theme !== "system") return;
    applyTheme("system");
    const newResolved = getSystemTheme();
    if (currentSnapshot.resolvedTheme !== newResolved) {
      currentSnapshot = { ...currentSnapshot, resolvedTheme: newResolved };
      emitChange();
    }
  });

  // Apply theme on module load to ensure DOM is in sync
  applyTheme(currentSnapshot.theme);
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    setThemeInternal(next);
  }, []);

  return { theme: snapshot.theme, resolvedTheme: snapshot.resolvedTheme, setTheme } as const;
}
