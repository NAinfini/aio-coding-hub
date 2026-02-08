import { describe, expect, it } from "vitest";
import { tauriInvoke } from "../../test/mocks/tauri";
import { clearTauriRuntime, setTauriRuntime } from "../../test/utils/tauriRuntime";
import {
  costBackfillMissingV1,
  costBreakdownModelV1,
  costBreakdownProviderV1,
  costScatterCliProviderModelV1,
  costSummaryV1,
  costTopRequestsV1,
  costTrendV1,
} from "../cost";

describe("services/cost", () => {
  it("does not call tauri invoke without runtime", async () => {
    clearTauriRuntime();
    await costSummaryV1("daily");
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("passes optional args and covers nullish branches", async () => {
    setTauriRuntime();
    tauriInvoke.mockResolvedValue(null as any);

    // input omitted
    await costSummaryV1("daily");
    await costTrendV1("weekly");
    await costBreakdownProviderV1("monthly");
    await costBreakdownModelV1("allTime");
    await costTopRequestsV1("custom");
    await costScatterCliProviderModelV1("daily");
    await costBackfillMissingV1("daily");

    // input with values
    await costSummaryV1("custom", {
      startTs: 1,
      endTs: 2,
      cliKey: "claude",
      providerId: 3,
      model: "m1",
    });
    await costTrendV1("custom", {
      startTs: 1,
      endTs: 2,
      cliKey: "claude",
      providerId: 3,
      model: "m1",
    });
    await costBreakdownProviderV1("custom", {
      startTs: 1,
      endTs: 2,
      cliKey: "claude",
      providerId: 3,
      model: "m1",
      limit: 10,
    });
    await costBreakdownModelV1("custom", {
      startTs: 1,
      endTs: 2,
      cliKey: "claude",
      providerId: 3,
      model: "m1",
      limit: 10,
    });
    await costTopRequestsV1("custom", {
      startTs: 1,
      endTs: 2,
      cliKey: "claude",
      providerId: 3,
      model: "m1",
      limit: 10,
    });
    await costScatterCliProviderModelV1("custom", {
      startTs: 1,
      endTs: 2,
      cliKey: "claude",
      providerId: 3,
      model: "m1",
      limit: 10,
    });
    await costBackfillMissingV1("custom", {
      startTs: 1,
      endTs: 2,
      cliKey: "claude",
      providerId: 3,
      model: "m1",
      maxRows: 999,
    });

    expect(tauriInvoke).toHaveBeenCalledWith(
      "cost_summary_v1",
      expect.objectContaining({
        params: expect.objectContaining({
          period: "custom",
          startTs: 1,
          endTs: 2,
          cliKey: "claude",
        }),
      })
    );
    expect(tauriInvoke).toHaveBeenCalledWith(
      "cost_backfill_missing_v1",
      expect.objectContaining({ maxRows: 999 })
    );
  });
});
