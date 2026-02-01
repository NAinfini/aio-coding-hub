import { describe, expect, it, vi } from "vitest";
import { invokeTauriOrNull } from "../tauriInvoke";
import {
  appDataDirGet,
  appDataReset,
  appExit,
  appRestart,
  dbDiskUsageGet,
  requestLogsClearAll,
} from "../dataManagement";

vi.mock("../tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../tauriInvoke")>("../tauriInvoke");
  return { ...actual, invokeTauriOrNull: vi.fn() };
});

describe("services/dataManagement", () => {
  it("invokes data management commands with expected parameters", async () => {
    vi.mocked(invokeTauriOrNull).mockResolvedValue(null as any);

    await dbDiskUsageGet();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("db_disk_usage_get");

    await requestLogsClearAll();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("request_logs_clear_all");

    await appDataReset();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("app_data_reset");

    await appDataDirGet();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("app_data_dir_get");

    await appExit();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("app_exit");

    await appRestart();
    expect(invokeTauriOrNull).toHaveBeenCalledWith("app_restart");
  });
});
