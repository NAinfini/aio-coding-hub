import type { ReactNode, RefObject } from "react";
import type { UsageDataPanelProps } from "./UsageDataPanel";
import { Button } from "../../ui/Button";
import { TabList } from "../../ui/TabList";
import { formatInteger } from "../../utils/formatters";
import { LEADERBOARD_LIMIT, SCOPE_ITEMS, USAGE_TABLE_TAB_ITEMS } from "./constants";
import { CacheTrendBody, UsageTableBody } from "./UsageDataPanelBodies";

function UsageScopeGroup({
  scope,
  onChangeScope,
  loading,
}: Pick<UsageDataPanelProps, "scope" | "onChangeScope" | "loading">) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="维度筛选">
      {SCOPE_ITEMS.map((item) => (
        <Button
          key={item.key}
          size="sm"
          variant={scope === item.key ? "primary" : "secondary"}
          aria-pressed={scope === item.key}
          onClick={() => onChangeScope(item.key)}
          disabled={loading}
          className="whitespace-nowrap"
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

function UsagePanelTitle({
  tableTab,
  cacheTrendProviderCount,
  tableTitle,
}: Pick<UsageDataPanelProps, "tableTab" | "cacheTrendProviderCount" | "tableTitle">) {
  if (tableTab === "cacheTrend") {
    if (cacheTrendProviderCount > 0) {
      return `${formatInteger(cacheTrendProviderCount)} 供应商 · 命中率走势`;
    }
    return "命中率走势";
  }
  return `Top ${LEADERBOARD_LIMIT} · ${tableTitle}（按请求数）`;
}

function UsageDataPanelHeader({
  tableTab,
  onChangeTableTab,
  scope,
  onChangeScope,
  loading,
  cacheTrendProviderCount,
  tableTitle,
}: Pick<
  UsageDataPanelProps,
  | "tableTab"
  | "onChangeTableTab"
  | "scope"
  | "onChangeScope"
  | "loading"
  | "cacheTrendProviderCount"
  | "tableTitle"
>) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-6 pb-0 pt-5">
      <div className="flex items-center gap-4">
        <TabList
          ariaLabel="用量数据视图"
          items={USAGE_TABLE_TAB_ITEMS}
          value={tableTab}
          onChange={onChangeTableTab}
          className="shrink-0"
          size="sm"
        />
        {tableTab === "usage" ? (
          <UsageScopeGroup scope={scope} onChangeScope={onChangeScope} loading={loading} />
        ) : null}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <UsagePanelTitle
          tableTab={tableTab}
          cacheTrendProviderCount={cacheTrendProviderCount}
          tableTitle={tableTitle}
        />
      </div>
    </div>
  );
}

function UsageStaleBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="h-0.5 w-full overflow-hidden bg-slate-100 dark:bg-slate-700">
      <div className="h-full w-1/3 animate-[loading_1.5s_ease-in-out_infinite] bg-accent" />
    </div>
  );
}

function UsageDataPanelScrollArea({
  activeStale,
  children,
}: {
  activeStale: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`mt-4 min-h-0 flex-1 lg:overflow-y-auto scrollbar-overlay transition-opacity ${
        activeStale ? "opacity-60" : ""
      }`}
    >
      {children}
    </div>
  );
}

function CacheTrendPanelBody({
  activeStale,
  cacheTrendLoading,
  cacheTrendRows,
  errorText,
  customPending,
  period,
  customApplied,
}: Pick<
  UsageDataPanelProps,
  | "cacheTrendLoading"
  | "cacheTrendRows"
  | "errorText"
  | "customPending"
  | "period"
  | "customApplied"
> & { activeStale: boolean }) {
  return (
    <UsageDataPanelScrollArea activeStale={activeStale}>
      <div className="px-6 pb-6">
        <CacheTrendBody
          cacheTrendLoading={cacheTrendLoading}
          cacheTrendRows={cacheTrendRows}
          errorText={errorText}
          customPending={customPending}
          period={period}
          customApplied={customApplied}
        />
      </div>
    </UsageDataPanelScrollArea>
  );
}

function UsageTablePanelBody({
  activeStale,
  dataLoading,
  rows,
  summary,
  totalCostUsd,
  errorText,
  customPending,
}: Pick<
  UsageDataPanelProps,
  "dataLoading" | "rows" | "summary" | "totalCostUsd" | "errorText" | "customPending"
> & { activeStale: boolean }) {
  return (
    <UsageDataPanelScrollArea activeStale={activeStale}>
      <UsageTableBody
        dataLoading={dataLoading}
        rows={rows}
        summary={summary}
        totalCostUsd={totalCostUsd}
        errorText={errorText}
        customPending={customPending}
      />
    </UsageDataPanelScrollArea>
  );
}

function UsageDataPanelBody({
  tableTab,
  activeStale,
  cacheTrendLoading,
  cacheTrendRows,
  errorText,
  customPending,
  period,
  customApplied,
  dataLoading,
  rows,
  summary,
  totalCostUsd,
}: Pick<
  UsageDataPanelProps,
  | "tableTab"
  | "cacheTrendLoading"
  | "cacheTrendRows"
  | "errorText"
  | "customPending"
  | "period"
  | "customApplied"
  | "dataLoading"
  | "rows"
  | "summary"
  | "totalCostUsd"
> & { activeStale: boolean }) {
  if (tableTab === "cacheTrend") {
    return (
      <CacheTrendPanelBody
        activeStale={activeStale}
        cacheTrendLoading={cacheTrendLoading}
        cacheTrendRows={cacheTrendRows}
        errorText={errorText}
        customPending={customPending}
        period={period}
        customApplied={customApplied}
      />
    );
  }

  return (
    <UsageTablePanelBody
      activeStale={activeStale}
      dataLoading={dataLoading}
      rows={rows}
      summary={summary}
      totalCostUsd={totalCostUsd}
      errorText={errorText}
      customPending={customPending}
    />
  );
}

export function UsageDataPanelContent({
  contentRef,
  overlayOpen,
  activeStale,
  ...props
}: UsageDataPanelProps & {
  contentRef: RefObject<HTMLDivElement | null>;
  overlayOpen: boolean;
  activeStale: boolean;
}) {
  return (
    <div
      ref={contentRef}
      className={`flex min-h-0 flex-1 flex-col ${overlayOpen ? "pointer-events-none" : ""}`}
      aria-hidden={overlayOpen || undefined}
    >
      <UsageDataPanelHeader
        tableTab={props.tableTab}
        onChangeTableTab={props.onChangeTableTab}
        scope={props.scope}
        onChangeScope={props.onChangeScope}
        loading={props.loading}
        cacheTrendProviderCount={props.cacheTrendProviderCount}
        tableTitle={props.tableTitle}
      />
      <UsageStaleBar active={activeStale} />
      <UsageDataPanelBody
        tableTab={props.tableTab}
        activeStale={activeStale}
        cacheTrendLoading={props.cacheTrendLoading}
        cacheTrendRows={props.cacheTrendRows}
        errorText={props.errorText}
        customPending={props.customPending}
        period={props.period}
        customApplied={props.customApplied}
        dataLoading={props.dataLoading}
        rows={props.rows}
        summary={props.summary}
        totalCostUsd={props.totalCostUsd}
      />
    </div>
  );
}
