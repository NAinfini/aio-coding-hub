import { lazy, Suspense, useEffect } from "react";
import type { CSSProperties } from "react";
import type { ComponentType } from "react";
import { Toaster } from "sonner";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { HomePage } from "./pages/HomePage";
import { useGatewayQuerySync } from "./hooks/useGatewayQuerySync";
import { logToConsole } from "./services/consoleLog";
import { listenAppHeartbeat } from "./services/appHeartbeat";
import { setCacheAnomalyMonitorEnabled } from "./services/cacheAnomalyMonitor";
import { listenGatewayEvents } from "./services/gatewayEvents";
import { listenNoticeEvents } from "./services/noticeEvents";
import { settingsGet } from "./services/settings";
import {
  listenTaskCompleteNotifyEvents,
  setTaskCompleteNotifyEnabled,
} from "./services/taskCompleteNotifyEvents";
import {
  startupSyncDefaultPromptsFromFilesOncePerSession,
  startupSyncModelPricesOnce,
} from "./services/startup";
import { Spinner } from "./ui/Spinner";

// Lazy-loaded pages (non-critical path)
const CliManagerPage = lazy(() =>
  import("./pages/CliManagerPage").then((m) => ({ default: m.CliManagerPage }))
);
const ConsolePage = lazy(() =>
  import("./pages/ConsolePage").then((m) => ({ default: m.ConsolePage }))
);
const LogsPage = lazy(() => import("./pages/LogsPage").then((m) => ({ default: m.LogsPage })));
const McpPage = lazy(() => import("./pages/McpPage").then((m) => ({ default: m.McpPage })));
const PromptsPage = lazy(() =>
  import("./pages/PromptsPage").then((m) => ({ default: m.PromptsPage }))
);
const ProvidersPage = lazy(() =>
  import("./pages/ProvidersPage").then((m) => ({ default: m.ProvidersPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const SkillsPage = lazy(() =>
  import("./pages/SkillsPage").then((m) => ({ default: m.SkillsPage }))
);
const SkillsMarketPage = lazy(() =>
  import("./pages/SkillsMarketPage").then((m) => ({
    default: m.SkillsMarketPage,
  }))
);
const UsagePage = lazy(() => import("./pages/UsagePage").then((m) => ({ default: m.UsagePage })));
const WorkspacesPage = lazy(() =>
  import("./pages/WorkspacesPage").then((m) => ({ default: m.WorkspacesPage }))
);

type CssVarsStyle = CSSProperties & Record<`--toast-${string}`, string | number>;

const TOASTER_STYLE: CssVarsStyle = {
  "--toast-close-button-start": "unset",
  "--toast-close-button-end": "0",
  "--toast-close-button-transform": "translate(35%, -35%)",
};

// Minimal loading fallback for lazy-loaded pages
function PageLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );
}

function renderLazyPage(Page: ComponentType) {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Page />
    </Suspense>
  );
}

export default function App() {
  useGatewayQuerySync();

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    listenAppHeartbeat()
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        cleanup = unlisten;
      })
      .catch((error) => {
        logToConsole("warn", "应用心跳监听初始化失败", {
          stage: "listenAppHeartbeat",
          error: String(error),
        });
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    listenGatewayEvents()
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        cleanup = unlisten;
      })
      .catch((error) => {
        logToConsole("warn", "网关事件监听初始化失败", {
          stage: "listenGatewayEvents",
          error: String(error),
        });
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    listenNoticeEvents()
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        cleanup = unlisten;
      })
      .catch((error) => {
        logToConsole("warn", "通知事件监听初始化失败", {
          stage: "listenNoticeEvents",
          error: String(error),
        });
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    listenTaskCompleteNotifyEvents()
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        cleanup = unlisten;
      })
      .catch((error) => {
        logToConsole("warn", "任务结束提醒监听初始化失败", {
          stage: "listenTaskCompleteNotifyEvents",
          error: String(error),
        });
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    settingsGet()
      .then((settings) => {
        if (!settings) return;
        setCacheAnomalyMonitorEnabled(settings.enable_cache_anomaly_monitor ?? false);
        setTaskCompleteNotifyEnabled(settings.enable_task_complete_notify ?? true);
      })
      .catch((error) => {
        logToConsole("warn", "启动缓存异常监测开关同步失败", {
          stage: "startupSyncCacheAnomalyMonitorSwitch",
          error: String(error),
        });
      });
  }, []);

  useEffect(() => {
    startupSyncModelPricesOnce().catch((error) => {
      logToConsole("warn", "启动模型定价同步失败", {
        stage: "startupSyncModelPricesOnce",
        error: String(error),
      });
    });
  }, []);

  useEffect(() => {
    startupSyncDefaultPromptsFromFilesOncePerSession().catch((error) => {
      logToConsole("warn", "启动默认提示词同步失败", {
        stage: "startupSyncDefaultPromptsFromFilesOncePerSession",
        error: String(error),
      });
    });
  }, []);

  return (
    <>
      <Toaster richColors closeButton position="top-center" style={TOASTER_STYLE} />
      {/* 避免导航更新被 startTransition 降级后在启动高频更新阶段“饿死”，导致侧边栏快速点击无法切换 */}
      <HashRouter unstable_useTransitions={false}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="/providers" element={renderLazyPage(ProvidersPage)} />
            <Route path="/workspaces" element={renderLazyPage(WorkspacesPage)} />
            <Route path="/prompts" element={renderLazyPage(PromptsPage)} />
            <Route path="/mcp" element={renderLazyPage(McpPage)} />
            <Route path="/skills" element={renderLazyPage(SkillsPage)} />
            <Route path="/skills/market" element={renderLazyPage(SkillsMarketPage)} />
            <Route path="/usage" element={renderLazyPage(UsagePage)} />
            <Route path="/console" element={renderLazyPage(ConsolePage)} />
            <Route path="/logs" element={renderLazyPage(LogsPage)} />
            <Route path="/cli-manager" element={renderLazyPage(CliManagerPage)} />
            <Route path="/settings" element={renderLazyPage(SettingsPage)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </>
  );
}
