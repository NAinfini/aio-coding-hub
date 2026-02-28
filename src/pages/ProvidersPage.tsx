// Usage: Main page for managing providers and sort modes (renders sub-views under `src/pages/providers/*`). Backend commands: `providers_*`, `sort_modes_*`.

import { useState } from "react";
import type { CliKey, ProviderSummary } from "../services/providers";
import { useProvidersListQuery } from "../query/providers";
import { PageHeader } from "../ui/PageHeader";
import { TabList } from "../ui/TabList";
import { ProvidersView } from "./providers/ProvidersView";
import { SortModesView } from "./providers/SortModesView";

type ViewKey = "providers" | "sortModes";

const VIEW_TABS: Array<{ key: ViewKey; label: string }> = [
  { key: "providers", label: "供应商" },
  { key: "sortModes", label: "排序模板" },
];

export function ProvidersPage() {
  const [view, setView] = useState<ViewKey>("providers");

  const [activeCli, setActiveCli] = useState<CliKey>("claude");
  const providersQuery = useProvidersListQuery(activeCli);
  const providers: ProviderSummary[] = providersQuery.data ?? [];
  const providersLoading = providersQuery.isFetching;

  return (
    <div className="flex flex-col gap-6 h-full overflow-hidden">
      <PageHeader
        title={view === "providers" ? "供应商" : "排序模板"}
        actions={<TabList ariaLabel="视图切换" items={VIEW_TABS} value={view} onChange={setView} />}
      />

      {view === "providers" ? (
        <ProvidersView activeCli={activeCli} setActiveCli={setActiveCli} />
      ) : (
        <SortModesView
          activeCli={activeCli}
          setActiveCli={setActiveCli}
          providers={providers}
          providersLoading={providersLoading}
        />
      )}
    </div>
  );
}
