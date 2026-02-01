import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { logToConsole } from "../../../services/consoleLog";
import { noticeSend } from "../../../services/notice";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../../services/consoleLog", () => ({ logToConsole: vi.fn() }));
vi.mock("../../../services/notice", async () => {
  const actual = await vi.importActual<typeof import("../../../services/notice")>(
    "../../../services/notice"
  );
  return { ...actual, noticeSend: vi.fn() };
});

async function importFreshHook(plugin: {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<string>;
}) {
  vi.resetModules();
  vi.doMock("@tauri-apps/plugin-notification", () => plugin);
  return await import("../useSystemNotification");
}

describe("pages/settings/useSystemNotification", () => {
  it("loads permission status on mount and requests permission", async () => {
    const { useSystemNotification } = await importFreshHook({
      isPermissionGranted: async () => false,
      requestPermission: async () => "granted",
    });

    const { result } = renderHook(() => useSystemNotification());
    await waitFor(() => expect(result.current.noticePermissionStatus).toBe("not_granted"));

    await act(async () => {
      await result.current.requestSystemNotificationPermission();
    });
    expect(result.current.noticePermissionStatus).toBe("granted");
    expect(toast).toHaveBeenCalledWith("系统通知权限已授权");
  });

  it("handles permission check failures", async () => {
    const { useSystemNotification } = await importFreshHook({
      isPermissionGranted: async () => {
        throw new Error("nope");
      },
      requestPermission: async () => "denied",
    });

    const { result } = renderHook(() => useSystemNotification());
    await waitFor(() => expect(result.current.noticePermissionStatus).toBe("unknown"));
    expect(logToConsole).toHaveBeenCalledWith("error", "检查系统通知权限失败", {
      error: "Error: nope",
    });
  });

  it("toasts when sending test without permission", async () => {
    // Not granted -> toast and return early.
    vi.doMock("@tauri-apps/plugin-notification", () => ({
      isPermissionGranted: async () => false,
      requestPermission: async () => "denied",
    }));

    vi.resetModules();
    const fresh = await import("../useSystemNotification");
    const { result: result2 } = renderHook(() => fresh.useSystemNotification());
    await waitFor(() => expect(result2.current.noticePermissionStatus).toBe("not_granted"));

    await act(async () => {
      await result2.current.sendSystemNotificationTest();
    });
    expect(toast).toHaveBeenCalledWith("请先在「系统通知」中授权通知权限");
  });

  it("toasts when notice_send unavailable and when sending succeeds", async () => {
    vi.mocked(noticeSend).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const { useSystemNotification } = await importFreshHook({
      isPermissionGranted: async () => true,
      requestPermission: async () => "granted",
    });

    const { result } = renderHook(() => useSystemNotification());
    await waitFor(() => expect(result.current.noticePermissionStatus).toBe("granted"));

    await act(async () => {
      await result.current.sendSystemNotificationTest();
    });
    expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用");

    await act(async () => {
      await result.current.sendSystemNotificationTest();
    });
    expect(toast).toHaveBeenCalledWith("已发送测试通知");
  });
});
