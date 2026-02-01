import { describe, expect, it } from "vitest";
import { tauriInvoke } from "../../test/mocks/tauri";
import { clearTauriRuntime, setTauriRuntime } from "../../test/utils/tauriRuntime";
import {
  requestAttemptLogsByTraceId,
  requestLogGet,
  requestLogGetByTraceId,
  requestLogsList,
  requestLogsListAfterId,
  requestLogsListAfterIdAll,
  requestLogsListAll,
} from "../requestLogs";

describe("services/requestLogs", () => {
  it("does not call tauri invoke without runtime", async () => {
    clearTauriRuntime();
    await requestLogsListAll(10);
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("passes args for list/get/attempts APIs", async () => {
    setTauriRuntime();
    tauriInvoke.mockResolvedValue(null as any);

    await requestLogsList("claude", 10);
    await requestLogsListAll(20);
    await requestLogsListAfterId("codex", 5, 30);
    await requestLogsListAfterIdAll(6, 40);
    await requestLogGet(1);
    await requestLogGetByTraceId("t1");
    await requestAttemptLogsByTraceId("t1", 99);

    expect(tauriInvoke).toHaveBeenCalledWith("request_logs_list", { cliKey: "claude", limit: 10 });
    expect(tauriInvoke).toHaveBeenCalledWith("request_logs_list_all", { limit: 20 });
    expect(tauriInvoke).toHaveBeenCalledWith("request_logs_list_after_id", {
      cliKey: "codex",
      afterId: 5,
      limit: 30,
    });
    expect(tauriInvoke).toHaveBeenCalledWith("request_logs_list_after_id_all", {
      afterId: 6,
      limit: 40,
    });
    expect(tauriInvoke).toHaveBeenCalledWith("request_log_get", { logId: 1 });
    expect(tauriInvoke).toHaveBeenCalledWith("request_log_get_by_trace_id", { traceId: "t1" });
    expect(tauriInvoke).toHaveBeenCalledWith("request_attempt_logs_by_trace_id", {
      traceId: "t1",
      limit: 99,
    });
  });
});
