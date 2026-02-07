// Usage:
// - Used by `src/pages/HomePage.tsx` to render the "概览" tab content.
// - This module is intentionally kept thin: it composes smaller, cohesive sub-components.

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { GatewayActiveSession } from "../../services/gateway";
import type { CliKey } from "../../services/providers";
import type { ProviderLimitUsageRow } from "../../services/providerLimitUsage";
import type { RequestLogSummary } from "../../services/requestLogs";
import type { SortModeSummary } from "../../services/sortModes";
import type { TraceSession } from "../../services/traceStore";
import type { UsageHourlyRow } from "../../services/usage";
import { Card } from "../../ui/Card";
import { TabList } from "../../ui/TabList";
import { cn } from "../../utils/cn";
import { HomeActiveSessionsCardContent } from "./HomeActiveSessionsCard";
import { HomeProviderLimitPanelContent } from "./HomeProviderLimitPanel";
import { HomeRequestLogsPanel } from "./HomeRequestLogsPanel";
import { HomeUsageSection } from "./HomeUsageSection";
import { HomeWorkStatusCard } from "./HomeWorkStatusCard";

type SessionsTabKey = "sessions" | "providerLimit";

const SESSIONS_TABS: Array<{ key: SessionsTabKey; label: string }> = [
  { key: "sessions", label: "活跃 Session" },
  { key: "providerLimit", label: "供应商限额" },
];

export type HomeOverviewPanelProps = {
  showCustomTooltip: boolean;

  usageHeatmapRows: UsageHourlyRow[];
  usageHeatmapLoading: boolean;
  onRefreshUsageHeatmap: () => void;

  sortModes: SortModeSummary[];
  sortModesLoading: boolean;
  sortModesAvailable: boolean | null;
  activeModeByCli: Record<CliKey, number | null>;
  activeModeToggling: Record<CliKey, boolean>;
  onSetCliActiveMode: (cliKey: CliKey, modeId: number | null) => void;

  cliProxyEnabled: Record<CliKey, boolean>;
  cliProxyToggling: Record<CliKey, boolean>;
  onSetCliProxyEnabled: (cliKey: CliKey, enabled: boolean) => void;

  activeSessions: GatewayActiveSession[];
  activeSessionsLoading: boolean;
  activeSessionsAvailable: boolean | null;

  providerLimitRows: ProviderLimitUsageRow[];
  providerLimitLoading: boolean;
  providerLimitAvailable: boolean | null;
  providerLimitRefreshing: boolean;
  onRefreshProviderLimit: () => void;

  traces: TraceSession[];

  requestLogs: RequestLogSummary[];
  requestLogsLoading: boolean;
  requestLogsRefreshing: boolean;
  requestLogsAvailable: boolean | null;
  onRefreshRequestLogs: () => void;

  selectedLogId: number | null;
  onSelectLogId: (id: number | null) => void;
};

export function HomeOverviewPanel({
  showCustomTooltip,
  usageHeatmapRows,
  usageHeatmapLoading,
  onRefreshUsageHeatmap,
  sortModes,
  sortModesLoading,
  sortModesAvailable,
  activeModeByCli,
  activeModeToggling,
  onSetCliActiveMode,
  cliProxyEnabled,
  cliProxyToggling,
  onSetCliProxyEnabled,
  activeSessions,
  activeSessionsLoading,
  activeSessionsAvailable,
  providerLimitRows,
  providerLimitLoading,
  providerLimitAvailable,
  providerLimitRefreshing,
  onRefreshProviderLimit,
  traces,
  requestLogs,
  requestLogsLoading,
  requestLogsRefreshing,
  requestLogsAvailable,
  onRefreshRequestLogs,
  selectedLogId,
  onSelectLogId,
}: HomeOverviewPanelProps) {
  const [sessionsTab, setSessionsTab] = useState<SessionsTabKey>("sessions");

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0">
        <HomeUsageSection
          usageHeatmapRows={usageHeatmapRows}
          usageHeatmapLoading={usageHeatmapLoading}
          onRefreshUsageHeatmap={onRefreshUsageHeatmap}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12 flex-1 min-h-0">
        <div className="flex flex-col gap-3 lg:col-span-5 min-h-0">
          <div className="shrink-0">
            <HomeWorkStatusCard
              sortModes={sortModes}
              sortModesLoading={sortModesLoading}
              sortModesAvailable={sortModesAvailable}
              activeModeByCli={activeModeByCli}
              activeModeToggling={activeModeToggling}
              onSetCliActiveMode={onSetCliActiveMode}
              cliProxyEnabled={cliProxyEnabled}
              cliProxyToggling={cliProxyToggling}
              onSetCliProxyEnabled={onSetCliProxyEnabled}
            />
          </div>

          <Card padding="sm" className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <TabList
                ariaLabel="Session/供应商限额切换"
                items={SESSIONS_TABS}
                value={sessionsTab}
                onChange={setSessionsTab}
                size="sm"
              />
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>
                  {sessionsTab === "sessions"
                    ? activeSessions.length
                    : `${providerLimitRows.length} 个供应商`}
                </span>
                {sessionsTab === "providerLimit" && (
                  <button
                    type="button"
                    onClick={onRefreshProviderLimit}
                    disabled={providerLimitRefreshing}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all",
                      providerLimitRefreshing
                        ? "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                    )}
                  >
                    <RefreshCw
                      className={cn("h-3 w-3", providerLimitRefreshing && "animate-spin")}
                    />
                    刷新
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 mt-3">
              {sessionsTab === "sessions" ? (
                <HomeActiveSessionsCardContent
                  activeSessions={activeSessions}
                  activeSessionsLoading={activeSessionsLoading}
                  activeSessionsAvailable={activeSessionsAvailable}
                />
              ) : (
                <HomeProviderLimitPanelContent
                  rows={providerLimitRows}
                  loading={providerLimitLoading}
                  available={providerLimitAvailable}
                />
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-7 min-h-0">
          <HomeRequestLogsPanel
            showCustomTooltip={showCustomTooltip}
            traces={traces}
            requestLogs={requestLogs}
            requestLogsLoading={requestLogsLoading}
            requestLogsRefreshing={requestLogsRefreshing}
            requestLogsAvailable={requestLogsAvailable}
            onRefreshRequestLogs={onRefreshRequestLogs}
            selectedLogId={selectedLogId}
            onSelectLogId={onSelectLogId}
          />
        </div>
      </div>
    </div>
  );
}
