import { describe, expect, it, vi } from "vitest";
import { invokeTauriOrNull } from "../tauriInvoke";
import {
  usageHourlySeries,
  usageLeaderboardDay,
  usageLeaderboardProvider,
  usageLeaderboardV2,
  usageSummary,
  usageSummaryV2,
} from "../usage";

vi.mock("../tauriInvoke", () => ({
  invokeTauriOrNull: vi.fn(),
}));

describe("services/usage", () => {
  it("passes normalized args to invokeTauriOrNull", async () => {
    vi.mocked(invokeTauriOrNull).mockResolvedValue(null as any);

    await usageSummary("today");
    await usageSummary("last7", { cliKey: "claude" });

    await usageLeaderboardProvider("today");
    await usageLeaderboardProvider("today", { cliKey: "codex", limit: 10 });

    await usageLeaderboardDay("today");
    await usageLeaderboardDay("today", { cliKey: "gemini", limit: 20 });

    await usageHourlySeries(15);

    await usageSummaryV2("custom");
    await usageSummaryV2("custom", { startTs: 1, endTs: 2, cliKey: "gemini" });

    await usageLeaderboardV2("provider", "custom");
    await usageLeaderboardV2("provider", "custom", {
      startTs: 1,
      endTs: 2,
      cliKey: "claude",
      limit: 50,
    });

    expect(vi.mocked(invokeTauriOrNull).mock.calls).toEqual(
      expect.arrayContaining([
        ["usage_summary", { range: "today", cliKey: null }],
        ["usage_summary", { range: "last7", cliKey: "claude" }],
        ["usage_leaderboard_provider", { range: "today", cliKey: null, limit: undefined }],
        ["usage_leaderboard_provider", { range: "today", cliKey: "codex", limit: 10 }],
        ["usage_leaderboard_day", { range: "today", cliKey: null, limit: undefined }],
        ["usage_leaderboard_day", { range: "today", cliKey: "gemini", limit: 20 }],
        ["usage_hourly_series", { days: 15 }],
        ["usage_summary_v2", { period: "custom", startTs: null, endTs: null, cliKey: null }],
        ["usage_summary_v2", { period: "custom", startTs: 1, endTs: 2, cliKey: "gemini" }],
        [
          "usage_leaderboard_v2",
          {
            scope: "provider",
            period: "custom",
            startTs: null,
            endTs: null,
            cliKey: null,
            limit: undefined,
          },
        ],
        [
          "usage_leaderboard_v2",
          {
            scope: "provider",
            period: "custom",
            startTs: 1,
            endTs: 2,
            cliKey: "claude",
            limit: 50,
          },
        ],
      ])
    );
  });
});
