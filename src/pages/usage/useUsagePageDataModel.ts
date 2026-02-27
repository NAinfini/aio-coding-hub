import type { CliKey } from "../../services/providers";
import type { CliFilterKey } from "../../constants/clis";
import type {
  UsageLeaderboardRow,
  UsagePeriod,
  UsageProviderCacheRateTrendRowV1,
  UsageScope,
  UsageSummary,
} from "../../services/usage";
import type { CustomDateRangeApplied, CustomDateRangeBounds } from "../../hooks/useCustomDateRange";
import {
  useUsageLeaderboardV2Query,
  useUsageProviderCacheRateTrendV1Query,
  useUsageSummaryV2Query,
} from "../../query/usage";
import { hasTauriRuntime } from "../../services/tauriInvoke";
import { formatUnknownError } from "../../utils/errors";
import { LEADERBOARD_LIMIT } from "./constants";
import type { UsageTableTab } from "./types";

type UsagePageDataModelArgs = {
  tableTab: UsageTableTab;
  scope: UsageScope;
  period: UsagePeriod;
  cliKey: CliFilterKey;
  customApplied: CustomDateRangeApplied | null;
  bounds: CustomDateRangeBounds;
};

export type UsagePageDataModel = {
  tauriAvailable: boolean;
  shouldLoad: boolean;
  customPending: boolean;
  loading: boolean;
  dataLoading: boolean;
  cacheTrendLoading: boolean;
  dataStale: boolean;
  cacheTrendStale: boolean;
  errorText: string | null;
  summary: UsageSummary | null;
  rows: UsageLeaderboardRow[];
  cacheTrendRows: UsageProviderCacheRateTrendRowV1[];
  cacheTrendProviderCount: number;
  totalCostUsd: number;
  handleRetry: () => void;
};

function toCliKeyOrNull(cliKey: CliFilterKey): CliKey | null {
  return cliKey === "all" ? null : cliKey;
}

function totalCostUsdFromRows(rows: UsageLeaderboardRow[]): number {
  return rows.reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);
}

function providerCountFromRows(rows: UsageProviderCacheRateTrendRowV1[]): number {
  return new Set(rows.map((row) => row.key)).size;
}

function useUsagePageQueryInput({
  period,
  cliKey,
  customApplied,
  bounds,
}: Pick<UsagePageDataModelArgs, "period" | "cliKey" | "customApplied" | "bounds">) {
  const tauriAvailable = hasTauriRuntime();
  const shouldLoad = period !== "custom" || customApplied != null;
  const customPending = period === "custom" && !customApplied;
  const input = { startTs: bounds.startTs, endTs: bounds.endTs, cliKey: toCliKeyOrNull(cliKey) };

  return { tauriAvailable, shouldLoad, customPending, input };
}

function useUsagePageQueries({
  scope,
  period,
  tableTab,
  shouldLoad,
  input,
}: Pick<UsagePageDataModelArgs, "scope" | "period" | "tableTab"> & {
  shouldLoad: boolean;
  input: { startTs: number | null; endTs: number | null; cliKey: CliKey | null };
}) {
  const dataEnabled = shouldLoad;
  const cacheTrendEnabled = shouldLoad && tableTab === "cacheTrend";
  const summaryQuery = useUsageSummaryV2Query(period, input, { enabled: dataEnabled });
  const leaderboardQuery = useUsageLeaderboardV2Query(
    scope,
    period,
    { ...input, limit: LEADERBOARD_LIMIT },
    { enabled: dataEnabled }
  );
  const cacheTrendQuery = useUsageProviderCacheRateTrendV1Query(
    period,
    { ...input, limit: null },
    { enabled: cacheTrendEnabled }
  );

  const dataLoading = dataEnabled && (summaryQuery.isFetching || leaderboardQuery.isFetching);
  const cacheTrendLoading = cacheTrendEnabled && cacheTrendQuery.isFetching;
  const loading = shouldLoad && (dataLoading || cacheTrendLoading);

  const dataStale =
    dataEnabled &&
    (summaryQuery.isFetching || leaderboardQuery.isFetching) &&
    (summaryQuery.data != null || leaderboardQuery.data != null);
  const cacheTrendStale =
    cacheTrendEnabled && cacheTrendQuery.isFetching && cacheTrendQuery.data != null;

  function handleRetry() {
    if (tableTab === "cacheTrend") void cacheTrendQuery.refetch();
    else {
      void summaryQuery.refetch();
      void leaderboardQuery.refetch();
    }
  }

  return {
    summaryQuery,
    leaderboardQuery,
    cacheTrendQuery,
    dataLoading,
    cacheTrendLoading,
    loading,
    dataStale,
    cacheTrendStale,
    handleRetry,
  };
}

export function useUsagePageDataModel({
  tableTab,
  scope,
  period,
  cliKey,
  customApplied,
  bounds,
}: UsagePageDataModelArgs): UsagePageDataModel {
  const { tauriAvailable, shouldLoad, customPending, input } = useUsagePageQueryInput({
    period,
    cliKey,
    customApplied,
    bounds,
  });
  const {
    summaryQuery,
    leaderboardQuery,
    cacheTrendQuery,
    dataLoading,
    cacheTrendLoading,
    loading,
    dataStale,
    cacheTrendStale,
    handleRetry,
  } = useUsagePageQueries({ scope, period, tableTab, shouldLoad, input });

  const summary: UsageSummary | null = summaryQuery.data ?? null;
  const rows: UsageLeaderboardRow[] = leaderboardQuery.data ?? [];
  const cacheTrendRows: UsageProviderCacheRateTrendRowV1[] = cacheTrendQuery.data ?? [];

  const cacheTrendProviderCount = providerCountFromRows(cacheTrendRows);
  const totalCostUsd = totalCostUsdFromRows(rows);

  const err =
    tableTab === "cacheTrend"
      ? cacheTrendQuery.error
      : (summaryQuery.error ?? leaderboardQuery.error);
  const errorText = err ? formatUnknownError(err) : null;

  return {
    tauriAvailable,
    shouldLoad,
    customPending,
    loading,
    dataLoading,
    cacheTrendLoading,
    dataStale,
    cacheTrendStale,
    errorText,
    summary,
    rows,
    cacheTrendRows,
    cacheTrendProviderCount,
    totalCostUsd,
    handleRetry,
  };
}
