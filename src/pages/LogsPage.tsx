// Usage:
// - Logs page aligned with claude-code-hub `/dashboard/logs` (status codes like 499/524).
// - Entry: Home "日志" button -> `/#/logs`.
// - Backend commands: `request_logs_list_all`, `request_logs_list_after_id_all`, `request_log_get`, `request_attempt_logs_by_trace_id`.

import { useMemo, useState } from "react";
import { HomeRequestLogsPanel } from "../components/home/HomeRequestLogsPanel";
import { RequestLogDetailDialog } from "../components/home/RequestLogDetailDialog";
import { CLI_FILTER_ITEMS, type CliFilterKey } from "../constants/clis";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { useDocumentVisibility } from "../hooks/useDocumentVisibility";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { PageHeader } from "../ui/PageHeader";
import { Switch } from "../ui/Switch";
import { TabList } from "../ui/TabList";
import {
  useRequestAttemptLogsByTraceIdQuery,
  useRequestLogDetailQuery,
  useRequestLogsIncrementalPollQuery,
  useRequestLogsListAllQuery,
} from "../query/requestLogs";
import { useWindowForeground } from "../hooks/useWindowForeground";

const LOGS_PAGE_LIMIT = 200;
const AUTO_REFRESH_INTERVAL_MS = 2000;

type StatusPredicate = (status: number | null) => boolean;

function buildStatusPredicate(query: string): StatusPredicate | null {
  const raw = query.trim();
  if (!raw) return null;

  const exact = raw.match(/^(\d{3})$/);
  if (exact) {
    const target = Number(exact[1]);
    return (status) => status === target;
  }

  const not = raw.match(/^!\s*(\d{3})$/);
  if (not) {
    const target = Number(not[1]);
    return (status) => status == null || status !== target;
  }

  const gte = raw.match(/^>=\s*(\d{3})$/);
  if (gte) {
    const target = Number(gte[1]);
    return (status) => status != null && status >= target;
  }

  const lte = raw.match(/^<=\s*(\d{3})$/);
  if (lte) {
    const target = Number(lte[1]);
    return (status) => status != null && status <= target;
  }

  return null;
}

export function LogsPage() {
  const tauriRuntime = hasTauriRuntime();
  const showCustomTooltip = tauriRuntime;
  const foregroundActive = useDocumentVisibility();

  const [cliKey, setCliKey] = useState<CliFilterKey>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [errorCodeFilter, setErrorCodeFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const incrementalPollingEnabled = autoRefresh && foregroundActive;
  const requestLogsQuery = useRequestLogsListAllQuery(LOGS_PAGE_LIMIT);
  const incrementalPollQuery = useRequestLogsIncrementalPollQuery(LOGS_PAGE_LIMIT, {
    enabled: incrementalPollingEnabled,
    refetchIntervalMs: incrementalPollingEnabled ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  useWindowForeground({
    enabled: tauriRuntime,
    throttleMs: 1000,
    onForeground: () => {
      if (autoRefresh) {
        void incrementalPollQuery.refetch();
      }
    },
  });

  const requestLogs = requestLogsQuery.data ?? [];
  const requestLogsLoading = requestLogsQuery.isLoading;
  const requestLogsRefreshing =
    (requestLogsQuery.isFetching && !requestLogsQuery.isLoading) || incrementalPollQuery.isFetching;
  const requestLogsAvailable: boolean | null = !tauriRuntime
    ? false
    : requestLogsQuery.isLoading
      ? null
      : requestLogsQuery.data != null;

  const statusPredicate = useMemo(() => buildStatusPredicate(statusFilter), [statusFilter]);
  const statusFilterValid = statusFilter.trim().length === 0 || statusPredicate != null;

  const filteredLogs = useMemo(() => {
    const errorNeedle = errorCodeFilter.trim().toLowerCase();
    const pathNeedle = pathFilter.trim().toLowerCase();

    return requestLogs.filter((log) => {
      if (cliKey !== "all" && log.cli_key !== cliKey) return false;
      if (statusPredicate && !statusPredicate(log.status)) return false;
      if (errorNeedle) {
        const raw = (log.error_code ?? "").toLowerCase();
        if (!raw.includes(errorNeedle)) return false;
      }
      if (pathNeedle) {
        const haystack = `${log.method} ${log.path}`.toLowerCase();
        if (!haystack.includes(pathNeedle)) return false;
      }
      return true;
    });
  }, [cliKey, errorCodeFilter, pathFilter, requestLogs, statusPredicate]);

  const selectedLogQuery = useRequestLogDetailQuery(selectedLogId);
  const selectedLog = selectedLogQuery.data ?? null;
  const selectedLogLoading = selectedLogQuery.isFetching;

  const attemptLogsQuery = useRequestAttemptLogsByTraceIdQuery(selectedLog?.trace_id ?? null, 50);
  const attemptLogs = attemptLogsQuery.data ?? [];
  const attemptLogsLoading = attemptLogsQuery.isFetching;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="日志"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>自动刷新</span>
              <Switch
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                size="sm"
                disabled={requestLogsAvailable === false}
              />
            </div>
          </div>
        }
      />

      <Card padding="md" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">筛选</div>
            <div className="text-xs text-slate-500">
              {filteredLogs.length} / {requestLogs.length}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs font-medium text-slate-600 w-16">CLI</div>
              <TabList
                ariaLabel="CLI 过滤"
                items={CLI_FILTER_ITEMS}
                value={cliKey}
                onChange={setCliKey}
                size="sm"
                buttonClassName="px-3 py-1.5"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-slate-600">Status</div>
                <Input
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  placeholder="例：499 / 524 / !200 / >=400"
                  mono
                  disabled={requestLogsAvailable === false}
                />
                {!statusFilterValid && (
                  <div className="text-[11px] leading-4 text-rose-600">
                    表达式不合法：支持 499 / !200 / &gt;=400 / &lt;=399
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-slate-600">error_code</div>
                <Input
                  value={errorCodeFilter}
                  onChange={(e) => setErrorCodeFilter(e.target.value)}
                  placeholder="例：GW_UPSTREAM_TIMEOUT"
                  mono
                  disabled={requestLogsAvailable === false}
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xs font-medium text-slate-600">Path</div>
                <Input
                  value={pathFilter}
                  onChange={(e) => setPathFilter(e.target.value)}
                  placeholder="例：/v1/messages"
                  mono
                  disabled={requestLogsAvailable === false}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <HomeRequestLogsPanel
        showCustomTooltip={showCustomTooltip}
        title="日志列表"
        showOpenLogsPageButton={false}
        traces={[]}
        requestLogs={filteredLogs}
        requestLogsLoading={requestLogsLoading}
        requestLogsRefreshing={requestLogsRefreshing}
        requestLogsAvailable={requestLogsAvailable}
        onRefreshRequestLogs={() => void requestLogsQuery.refetch()}
        selectedLogId={selectedLogId}
        onSelectLogId={setSelectedLogId}
      />

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
