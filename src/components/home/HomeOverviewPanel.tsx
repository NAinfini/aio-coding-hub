// Usage:
// - Used by `src/pages/HomePage.tsx` to render the "概览" tab content.
// - This module is intentionally kept thin: it composes smaller, cohesive sub-components.

import type { GatewayActiveSession } from "../../services/gateway";
import type { CliKey } from "../../services/providers";
import type { RequestLogSummary } from "../../services/requestLogs";
import type { SortModeSummary } from "../../services/sortModes";
import type { TraceSession } from "../../services/traceStore";
import type { UsageHourlyRow } from "../../services/usage";
import { HomeActiveSessionsCard } from "./HomeActiveSessionsCard";
import { HomeRequestLogsPanel } from "./HomeRequestLogsPanel";
import { HomeUsageSection } from "./HomeUsageSection";
import { HomeWorkStatusCard } from "./HomeWorkStatusCard";

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
  traces,
  requestLogs,
  requestLogsLoading,
  requestLogsRefreshing,
  requestLogsAvailable,
  onRefreshRequestLogs,
  selectedLogId,
  onSelectLogId,
}: HomeOverviewPanelProps) {
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
        <div className="flex flex-col gap-3 lg:col-span-5">
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

          <div className="flex-1 min-h-0">
            <HomeActiveSessionsCard
              activeSessions={activeSessions}
              activeSessionsLoading={activeSessionsLoading}
              activeSessionsAvailable={activeSessionsAvailable}
            />
          </div>
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
