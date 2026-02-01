import { describe, expect, it, vi } from "vitest";
import { logToConsole } from "../consoleLog";
import { modelPricesSyncBasellm, notifyModelPricesUpdated } from "../modelPrices";
import { promptsDefaultSyncFromFiles } from "../prompts";

vi.mock("../consoleLog", () => ({ logToConsole: vi.fn() }));
vi.mock("../modelPrices", async () => {
  const actual = await vi.importActual<typeof import("../modelPrices")>("../modelPrices");
  return { ...actual, modelPricesSyncBasellm: vi.fn(), notifyModelPricesUpdated: vi.fn() };
});
vi.mock("../prompts", async () => {
  const actual = await vi.importActual<typeof import("../prompts")>("../prompts");
  return { ...actual, promptsDefaultSyncFromFiles: vi.fn() };
});

async function importFreshStartup() {
  vi.resetModules();
  try {
    localStorage.clear();
  } catch {}
  return await import("../startup");
}

describe("services/startup", () => {
  it("startupSyncModelPricesOnce respects once-flag and logs report", async () => {
    const { startupSyncModelPricesOnce } = await importFreshStartup();

    // already synced -> no call
    localStorage.setItem("startup.modelPrices.basellmSyncedAt", "1");
    await startupSyncModelPricesOnce();
    expect(modelPricesSyncBasellm).not.toHaveBeenCalled();

    // fresh import: report null -> no log
    const m2 = await importFreshStartup();
    vi.mocked(modelPricesSyncBasellm).mockResolvedValueOnce(null as any);
    await m2.startupSyncModelPricesOnce();
    expect(logToConsole).not.toHaveBeenCalledWith("info", expect.anything(), expect.anything());

    // fresh import: report ok -> mark + notify + log
    const m3 = await importFreshStartup();
    vi.mocked(modelPricesSyncBasellm).mockResolvedValueOnce({
      status: "updated",
      inserted: 1,
      updated: 2,
      skipped: 3,
      total: 6,
    } as any);
    await m3.startupSyncModelPricesOnce();
    expect(notifyModelPricesUpdated).toHaveBeenCalled();
    expect(logToConsole).toHaveBeenCalledWith(
      "info",
      "初始化：模型定价同步完成",
      expect.objectContaining({ status: "updated", inserted: 1, updated: 2, skipped: 3, total: 6 })
    );
  });

  it("startupSyncModelPricesOnce logs errors when sync throws", async () => {
    const m = await importFreshStartup();
    vi.mocked(modelPricesSyncBasellm).mockRejectedValueOnce(new Error("boom"));
    await m.startupSyncModelPricesOnce();
    expect(logToConsole).toHaveBeenCalledWith("error", "初始化：模型定价同步失败", {
      error: "Error: boom",
    });
  });

  it("startupSyncDefaultPromptsFromFilesOncePerSession dedupes and logs action summary", async () => {
    const m = await importFreshStartup();

    vi.mocked(promptsDefaultSyncFromFiles).mockResolvedValueOnce({
      items: [{ action: "add" }, { action: "error" }, { action: "add" }],
    } as any);

    const p1 = m.startupSyncDefaultPromptsFromFilesOncePerSession();
    const p2 = m.startupSyncDefaultPromptsFromFilesOncePerSession();
    expect(p1).toBe(p2);

    await p1;
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "初始化：default 提示词与本机文件同步完成",
      expect.objectContaining({
        summary: { add: 2, error: 1 },
      })
    );
  });

  it("startupSyncDefaultPromptsFromFilesOncePerSession logs errors when sync throws", async () => {
    const m = await importFreshStartup();
    vi.mocked(promptsDefaultSyncFromFiles).mockRejectedValueOnce(new Error("x"));
    await m.startupSyncDefaultPromptsFromFilesOncePerSession();
    expect(logToConsole).toHaveBeenCalledWith("error", "初始化：default 提示词与本机文件同步失败", {
      error: "Error: x",
    });
  });
});
