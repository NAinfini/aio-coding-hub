import { describe, expect, it, vi } from "vitest";
import {
  tauriIsPermissionGranted,
  tauriListen,
  tauriSendNotification,
  tauriUnlisten,
} from "../../test/mocks/tauri";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";

describe("services/noticeEvents", () => {
  it("returns no-op when tauri runtime is missing", async () => {
    vi.resetModules();
    const { listenNoticeEvents } = await import("../noticeEvents");

    const unlisten = await listenNoticeEvents();
    unlisten();

    expect(tauriListen).not.toHaveBeenCalled();
  });

  it("listens and sends notifications when permission is granted", async () => {
    setTauriRuntime();
    vi.resetModules();

    vi.mocked(tauriListen).mockResolvedValue(tauriUnlisten);
    vi.mocked(tauriIsPermissionGranted).mockResolvedValue(true);
    vi.mocked(tauriSendNotification).mockResolvedValue(undefined);

    const { listenNoticeEvents } = await import("../noticeEvents");
    const unlisten = await listenNoticeEvents();

    expect(tauriListen).toHaveBeenCalledWith("notice:notify", expect.any(Function));

    const handler = vi.mocked(tauriListen).mock.calls.find((c) => c[0] === "notice:notify")?.[1];
    expect(handler).toBeTypeOf("function");

    await handler?.({ payload: { level: "info", title: "T", body: "B" } } as any);
    expect(tauriSendNotification).toHaveBeenCalledWith({ title: "T", body: "B" });

    unlisten();
    expect(tauriUnlisten).toHaveBeenCalled();
  });

  it("does not send notifications when permission is denied", async () => {
    setTauriRuntime();
    vi.resetModules();

    vi.mocked(tauriListen).mockResolvedValue(tauriUnlisten);
    vi.mocked(tauriIsPermissionGranted).mockResolvedValue(false);
    vi.mocked(tauriSendNotification).mockResolvedValue(undefined);

    const { listenNoticeEvents } = await import("../noticeEvents");
    await listenNoticeEvents();

    const handler = vi.mocked(tauriListen).mock.calls.find((c) => c[0] === "notice:notify")?.[1];
    await handler?.({ payload: { level: "info", title: "T", body: "B" } } as any);

    expect(tauriSendNotification).not.toHaveBeenCalled();
  });
});
