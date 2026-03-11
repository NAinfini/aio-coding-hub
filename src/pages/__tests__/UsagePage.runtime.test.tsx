import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { UsagePage } from "../UsagePage";
import { createTestQueryClient } from "../../test/utils/reactQuery";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import { useCustomDateRange } from "../../hooks/useCustomDateRange";
import {
  useUsageLeaderboardV2Query,
  useUsageProviderCacheRateTrendV1Query,
  useUsageSummaryV2Query,
} from "../../query/usage";
import { useProvidersListQuery } from "../../query/providers";

vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("../../hooks/useCustomDateRange", async () => {
  const actual = await vi.importActual<typeof import("../../hooks/useCustomDateRange")>(
    "../../hooks/useCustomDateRange"
  );
  return { ...actual, useCustomDateRange: vi.fn() };
});

vi.mock("../../query/usage", async () => {
  const actual = await vi.importActual<typeof import("../../query/usage")>("../../query/usage");
  return {
    ...actual,
    useUsageSummaryV2Query: vi.fn(),
    useUsageLeaderboardV2Query: vi.fn(),
    useUsageProviderCacheRateTrendV1Query: vi.fn(),
  };
});

vi.mock("../../query/providers", async () => {
  const actual =
    await vi.importActual<typeof import("../../query/providers")>("../../query/providers");
  return { ...actual, useProvidersListQuery: vi.fn() };
});

function renderWithProviders(element: ReactElement) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("pages/UsagePage (runtime)", () => {
  it("renders usage page in tauri runtime", () => {
    setTauriRuntime();
    vi.mocked(useProvidersListQuery).mockReturnValue({ data: [], isFetching: false } as any);

    vi.mocked(useCustomDateRange).mockReturnValue({
      customStartDate: "",
      setCustomStartDate: vi.fn(),
      customEndDate: "",
      setCustomEndDate: vi.fn(),
      customApplied: null,
      bounds: { startTs: null, endTs: null },
      showCustomForm: false,
      applyCustomRange: vi.fn(),
      clearCustomRange: vi.fn(),
    } as any);

    vi.mocked(useUsageSummaryV2Query).mockReturnValue({
      data: null,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useUsageLeaderboardV2Query).mockReturnValue({
      data: [],
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useUsageProviderCacheRateTrendV1Query).mockReturnValue({
      data: [],
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<UsagePage />);
    // Page should render without the old "未检测到 Tauri Runtime" hint
    expect(screen.queryByText(/未检测到 Tauri Runtime/)).not.toBeInTheDocument();
  });
});
