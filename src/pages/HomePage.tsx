// Usage: Dashboard / overview page. Backend commands: `request_logs_*`, `request_attempt_logs_*`, `usage_*`, `gateway_*`, `providers_*`, `sort_modes_*`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CLIS } from "../constants/clis";
import { HomeCostPanel } from "../components/home/HomeCostPanel";
import { HomeOverviewPanel } from "../components/home/HomeOverviewPanel";
import { RequestLogDetailDialog } from "../components/home/RequestLogDetailDialog";
import { logToConsole } from "../services/consoleLog";
import { ProviderCircuitBadge, type OpenCircuitRow } from "../components/ProviderCircuitBadge";
import { useCliProxy } from "../hooks/useCliProxy";
import { useWindowForeground } from "../hooks/useWindowForeground";
import { gatewayKeys } from "../query/keys";
import {
  useGatewayCircuitResetProviderMutation,
  useGatewayCircuitStatusQuery,
  useGatewaySessionsListQuery,
} from "../query/gateway";
import {
  useRequestAttemptLogsByTraceIdQuery,
  useRequestLogDetailQuery,
  useRequestLogsListAllQuery,
} from "../query/requestLogs";
import {
  useSortModeActiveListQuery,
  useSortModeActiveSetMutation,
  useSortModesListQuery,
} from "../query/sortModes";
import { useUsageHourlySeriesQuery } from "../query/usage";
import { useProvidersListQuery } from "../query/providers";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Dialog } from "../ui/Dialog";
import { PageHeader } from "../ui/PageHeader";
import { TabList } from "../ui/TabList";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { useTraceStore } from "../services/traceStore";
import type { CliKey } from "../services/providers";

type HomeTabKey = "overview" | "cost" | "more";
type PendingSortModeSwitch = {
  cliKey: CliKey;
  modeId: number | null;
  activeSessionCount: number;
};

const HOME_TABS: Array<{ key: HomeTabKey; label: string }> = [
  { key: "overview", label: "概览" },
  { key: "cost", label: "花费" },
  { key: "more", label: "更多" },
];

export function HomePage() {
  const { traces } = useTraceStore();
  const tauriRuntime = hasTauriRuntime();
  const showCustomTooltip = tauriRuntime;

  const queryClient = useQueryClient();

  const cliProxy = useCliProxy();

  const [tab, setTab] = useState<HomeTabKey>("overview");
  const tabRef = useRef(tab);

  const [switchingCliKey, setSwitchingCliKey] = useState<CliKey | null>(null);
  const [pendingSortModeSwitch, setPendingSortModeSwitch] = useState<PendingSortModeSwitch | null>(
    null
  );

  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

  const [resettingProviderIds, setResettingProviderIds] = useState<Set<number>>(new Set());
  const openCircuitsAutoRefreshTimerRef = useRef<number | null>(null);

  const resetCircuitProviderMutation = useGatewayCircuitResetProviderMutation();
  const claudeCircuitsQuery = useGatewayCircuitStatusQuery("claude");
  const codexCircuitsQuery = useGatewayCircuitStatusQuery("codex");
  const geminiCircuitsQuery = useGatewayCircuitStatusQuery("gemini");
  const claudeProvidersQuery = useProvidersListQuery("claude");
  const codexProvidersQuery = useProvidersListQuery("codex");
  const geminiProvidersQuery = useProvidersListQuery("gemini");

  const openCircuits = useMemo<OpenCircuitRow[]>(() => {
    if (!tauriRuntime) return [];

    const specs = [
      {
        cliKey: "claude" as const,
        circuits: claudeCircuitsQuery.data ?? [],
        providers: claudeProvidersQuery.data ?? [],
      },
      {
        cliKey: "codex" as const,
        circuits: codexCircuitsQuery.data ?? [],
        providers: codexProvidersQuery.data ?? [],
      },
      {
        cliKey: "gemini" as const,
        circuits: geminiCircuitsQuery.data ?? [],
        providers: geminiProvidersQuery.data ?? [],
      },
    ];

    const rows: OpenCircuitRow[] = [];
    for (const spec of specs) {
      const unavailable = spec.circuits.filter(
        (row) =>
          row.state === "OPEN" ||
          (row.cooldown_until != null && Number.isFinite(row.cooldown_until))
      );
      if (unavailable.length === 0) continue;

      const providerNameById: Record<number, string> = {};
      for (const provider of spec.providers) {
        const name = provider.name?.trim();
        if (!name) continue;
        providerNameById[provider.id] = name;
      }

      for (const row of unavailable) {
        const cooldownUntil = row.cooldown_until ?? null;
        if (row.state !== "OPEN") {
          rows.push({
            cli_key: spec.cliKey,
            provider_id: row.provider_id,
            provider_name: providerNameById[row.provider_id] ?? "未知",
            open_until: cooldownUntil,
          });
          continue;
        }

        const openUntil = row.open_until ?? null;
        const until =
          openUntil == null
            ? cooldownUntil
            : cooldownUntil == null
              ? openUntil
              : Math.max(openUntil, cooldownUntil);

        rows.push({
          cli_key: spec.cliKey,
          provider_id: row.provider_id,
          provider_name: providerNameById[row.provider_id] ?? "未知",
          open_until: until,
        });
      }
    }

    rows.sort((a, b) => {
      const aUntil = a.open_until ?? Number.POSITIVE_INFINITY;
      const bUntil = b.open_until ?? Number.POSITIVE_INFINITY;
      if (aUntil !== bUntil) return aUntil - bUntil;
      if (a.cli_key !== b.cli_key) return a.cli_key.localeCompare(b.cli_key);
      return a.provider_name.localeCompare(b.provider_name);
    });

    return rows;
  }, [
    claudeCircuitsQuery.data,
    claudeProvidersQuery.data,
    codexCircuitsQuery.data,
    codexProvidersQuery.data,
    geminiCircuitsQuery.data,
    geminiProvidersQuery.data,
    tauriRuntime,
  ]);

  const handleResetProvider = useCallback(
    async (providerId: number) => {
      if (resettingProviderIds.has(providerId)) return;

      setResettingProviderIds((prev) => new Set(prev).add(providerId));
      try {
        const result = await resetCircuitProviderMutation.mutateAsync({ providerId });
        if (result) {
          toast.success("已解除熔断");
        } else {
          toast.error("解除熔断失败");
        }
      } catch (err) {
        logToConsole("error", "解除熔断失败", { providerId, error: String(err) });
        toast.error("解除熔断失败");
      } finally {
        setResettingProviderIds((prev) => {
          const next = new Set(prev);
          next.delete(providerId);
          return next;
        });
      }
    },
    [resetCircuitProviderMutation, resettingProviderIds]
  );

  useEffect(() => {
    if (openCircuitsAutoRefreshTimerRef.current != null) {
      window.clearTimeout(openCircuitsAutoRefreshTimerRef.current);
      openCircuitsAutoRefreshTimerRef.current = null;
    }

    if (!tauriRuntime) return;
    if (openCircuits.length === 0) return;

    const nowUnix = Math.floor(Date.now() / 1000);
    let nextOpenUntil: number | null = null;
    for (const row of openCircuits) {
      const until = row.open_until;
      if (until == null) continue;
      if (nextOpenUntil == null || until < nextOpenUntil) nextOpenUntil = until;
    }

    const delayMs =
      nextOpenUntil != null ? Math.max(200, (nextOpenUntil - nowUnix) * 1000 + 250) : 30_000;

    openCircuitsAutoRefreshTimerRef.current = window.setTimeout(() => {
      openCircuitsAutoRefreshTimerRef.current = null;
      queryClient.invalidateQueries({ queryKey: gatewayKeys.circuits() });
    }, delayMs);

    return () => {
      if (openCircuitsAutoRefreshTimerRef.current != null) {
        window.clearTimeout(openCircuitsAutoRefreshTimerRef.current);
        openCircuitsAutoRefreshTimerRef.current = null;
      }
    };
  }, [openCircuits, queryClient, tauriRuntime]);

  const usageHeatmapQuery = useUsageHourlySeriesQuery(15, { enabled: tab === "overview" });
  const usageHeatmapRows = usageHeatmapQuery.data ?? [];
  const usageHeatmapLoading = usageHeatmapQuery.isFetching;

  const sessionsQuery = useGatewaySessionsListQuery(50, {
    enabled: tab === "overview",
    refetchIntervalMs: 5000,
  });
  const activeSessions = sessionsQuery.data ?? [];
  const activeSessionsLoading = sessionsQuery.isLoading;
  const activeSessionsAvailable: boolean | null = !tauriRuntime
    ? false
    : sessionsQuery.isLoading
      ? null
      : sessionsQuery.data != null;

  const requestLogsQuery = useRequestLogsListAllQuery(50, { enabled: tab === "overview" });
  const requestLogs = requestLogsQuery.data ?? [];
  const requestLogsLoading = requestLogsQuery.isLoading;
  const requestLogsRefreshing = requestLogsQuery.isFetching && !requestLogsQuery.isLoading;
  const requestLogsAvailable: boolean | null = !tauriRuntime
    ? false
    : requestLogsQuery.isLoading
      ? null
      : requestLogsQuery.data != null;

  const sortModesQuery = useSortModesListQuery();
  const sortModeActiveQuery = useSortModeActiveListQuery();
  const sortModeActiveSetMutation = useSortModeActiveSetMutation();

  const sortModes = sortModesQuery.data ?? [];
  const sortModesLoading = sortModesQuery.isLoading || sortModeActiveQuery.isLoading;
  const sortModesAvailable: boolean | null = !tauriRuntime
    ? false
    : sortModesLoading
      ? null
      : sortModesQuery.data != null && sortModeActiveQuery.data != null;

  const activeModeByCli = useMemo<Record<CliKey, number | null>>(() => {
    const next: Record<CliKey, number | null> = {
      claude: null,
      codex: null,
      gemini: null,
    };
    for (const row of sortModeActiveQuery.data ?? []) {
      next[row.cli_key] = row.mode_id ?? null;
    }
    return next;
  }, [sortModeActiveQuery.data]);

  const activeModeToggling = useMemo<Record<CliKey, boolean>>(
    () => ({
      claude: switchingCliKey === "claude",
      codex: switchingCliKey === "codex",
      gemini: switchingCliKey === "gemini",
    }),
    [switchingCliKey]
  );

  const setCliActiveMode = useCallback(
    async (cliKey: CliKey, modeId: number | null) => {
      if (switchingCliKey != null) return;

      const prev = activeModeByCli[cliKey] ?? null;
      if (prev === modeId) return;

      setSwitchingCliKey(cliKey);
      try {
        const res = await sortModeActiveSetMutation.mutateAsync({ cliKey, modeId });
        if (!res) {
          toast("仅在 Tauri Desktop 环境可用");
          return;
        }

        const next = res.mode_id ?? null;
        if (next == null) {
          toast("已切回：Default");
          return;
        }
        const label = sortModes.find((m) => m.id === next)?.name ?? `#${next}`;
        toast(`已激活：${label}`);
      } catch (err) {
        toast(`切换排序模板失败：${String(err)}`);
        logToConsole("error", "切换排序模板失败", {
          cli: cliKey,
          mode_id: modeId,
          error: String(err),
        });
      } finally {
        setSwitchingCliKey(null);
      }
    },
    [activeModeByCli, sortModeActiveSetMutation, sortModes, switchingCliKey]
  );

  const requestCliActiveModeSwitch = useCallback(
    (cliKey: CliKey, modeId: number | null) => {
      if (activeModeToggling[cliKey] || sortModesLoading) return;

      const prev = activeModeByCli[cliKey] ?? null;
      if (prev === modeId) return;

      const activeSessionCount = activeSessions.filter((row) => row.cli_key === cliKey).length;
      if (activeSessionCount > 0) {
        setPendingSortModeSwitch({ cliKey, modeId, activeSessionCount });
        return;
      }

      void setCliActiveMode(cliKey, modeId);
    },
    [activeModeByCli, activeModeToggling, activeSessions, setCliActiveMode, sortModesLoading]
  );

  const refreshUsageHeatmap = useCallback(() => {
    void usageHeatmapQuery.refetch().then((res) => {
      if (res.error) toast("刷新用量失败：请查看控制台日志");
    });
  }, [usageHeatmapQuery]);

  const refreshRequestLogs = useCallback(() => {
    void requestLogsQuery.refetch().then((res) => {
      if (res.error) toast("读取使用记录失败：请查看控制台日志");
    });
  }, [requestLogsQuery]);

  useEffect(() => {
    const prev = tabRef.current;
    tabRef.current = tab;
    if (!tauriRuntime) return;
    if (prev !== "overview" && tab === "overview") {
      void usageHeatmapQuery.refetch();
      void requestLogsQuery.refetch();
    }
  }, [requestLogsQuery, tab, tauriRuntime, usageHeatmapQuery]);

  useWindowForeground({
    enabled: tauriRuntime && tab === "overview",
    throttleMs: 1000,
    onForeground: () => {
      void usageHeatmapQuery.refetch();
      void requestLogsQuery.refetch();
    },
  });

  const selectedLogQuery = useRequestLogDetailQuery(selectedLogId);
  const selectedLog = selectedLogQuery.data ?? null;
  const selectedLogLoading = selectedLogQuery.isFetching;

  const attemptLogsQuery = useRequestAttemptLogsByTraceIdQuery(selectedLog?.trace_id ?? null, 50);
  const attemptLogs = attemptLogsQuery.data ?? [];
  const attemptLogsLoading = attemptLogsQuery.isFetching;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="首页"
        actions={
          <>
            <ProviderCircuitBadge
              rows={openCircuits}
              onResetProvider={handleResetProvider}
              resettingProviderIds={resettingProviderIds}
            />
            <TabList ariaLabel="首页视图切换" items={HOME_TABS} value={tab} onChange={setTab} />
          </>
        }
      />

      {tab === "overview" ? (
        <HomeOverviewPanel
          showCustomTooltip={showCustomTooltip}
          usageHeatmapRows={usageHeatmapRows}
          usageHeatmapLoading={usageHeatmapLoading}
          onRefreshUsageHeatmap={refreshUsageHeatmap}
          sortModes={sortModes}
          sortModesLoading={sortModesLoading}
          sortModesAvailable={sortModesAvailable}
          activeModeByCli={activeModeByCli}
          activeModeToggling={activeModeToggling}
          onSetCliActiveMode={requestCliActiveModeSwitch}
          cliProxyEnabled={cliProxy.enabled}
          cliProxyToggling={cliProxy.toggling}
          onSetCliProxyEnabled={cliProxy.setCliProxyEnabled}
          activeSessions={activeSessions}
          activeSessionsLoading={activeSessionsLoading}
          activeSessionsAvailable={activeSessionsAvailable}
          traces={traces}
          requestLogs={requestLogs}
          requestLogsLoading={requestLogsLoading}
          requestLogsRefreshing={requestLogsRefreshing}
          requestLogsAvailable={requestLogsAvailable}
          onRefreshRequestLogs={refreshRequestLogs}
          selectedLogId={selectedLogId}
          onSelectLogId={setSelectedLogId}
        />
      ) : tab === "cost" ? (
        <HomeCostPanel onSelectLogId={setSelectedLogId} />
      ) : (
        <Card padding="md">
          <div className="text-sm text-slate-600">更多功能开发中…</div>
        </Card>
      )}

      <Dialog
        open={pendingSortModeSwitch != null}
        onOpenChange={(open) => {
          if (!open) setPendingSortModeSwitch(null);
        }}
        title={
          pendingSortModeSwitch
            ? `确认切换 ${CLIS.find((cli) => cli.key === pendingSortModeSwitch.cliKey)?.name ?? pendingSortModeSwitch.cliKey} 模板？`
            : "确认切换模板？"
        }
        description={
          pendingSortModeSwitch
            ? `目前还有 ${pendingSortModeSwitch.activeSessionCount} 个活跃 Session，切换模板可能导致会话中断，是否确认？`
            : undefined
        }
      >
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={() => setPendingSortModeSwitch(null)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              const pending = pendingSortModeSwitch;
              if (!pending) return;
              setPendingSortModeSwitch(null);
              void setCliActiveMode(pending.cliKey, pending.modeId);
            }}
          >
            确认切换
          </Button>
        </div>
      </Dialog>

      <RequestLogDetailDialog
        selectedLogId={selectedLogId}
        onSelectLogId={setSelectedLogId}
        selectedLog={selectedLog}
        selectedLogLoading={selectedLogLoading}
        attemptLogs={attemptLogs}
        attemptLogsLoading={attemptLogsLoading}
      />
    </div>
  );
}
