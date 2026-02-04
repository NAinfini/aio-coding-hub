import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { logToConsole } from "../../services/consoleLog";
import { appRestart } from "../../services/dataManagement";
import {
  updateDialogSetOpen,
  updateDownloadAndInstall,
  useUpdateMeta,
} from "../../hooks/useUpdateMeta";
import { UpdateDialog } from "../UpdateDialog";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { loading: vi.fn().mockReturnValue("toast-id") }),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../services/consoleLog", () => ({ logToConsole: vi.fn() }));
vi.mock("../../services/dataManagement", async () => {
  const actual = await vi.importActual<typeof import("../../services/dataManagement")>(
    "../../services/dataManagement"
  );
  return { ...actual, appRestart: vi.fn() };
});
vi.mock("../../hooks/useUpdateMeta", async () => {
  const actual = await vi.importActual<typeof import("../../hooks/useUpdateMeta")>(
    "../../hooks/useUpdateMeta"
  );
  return {
    ...actual,
    useUpdateMeta: vi.fn(),
    updateDialogSetOpen: vi.fn(),
    updateDownloadAndInstall: vi.fn(),
  };
});

describe("components/UpdateDialog", () => {
  it("toasts when download/install is unavailable in non-portable mode", async () => {
    vi.mocked(useUpdateMeta).mockReturnValue({
      about: { run_mode: "desktop", app_version: "0.0.0" },
      updateCandidate: { version: "1.0.0", currentVersion: "0.0.0", date: null, rid: "rid" },
      checkingUpdate: false,
      dialogOpen: true,
      installingUpdate: false,
      installError: null,
      installTotalBytes: null,
      installDownloadedBytes: 0,
    } as any);

    vi.mocked(updateDownloadAndInstall).mockResolvedValue(null);

    render(<UpdateDialog />);

    fireEvent.click(screen.getByRole("button", { name: "下载并安装" }));

    await waitFor(() => {
      expect(updateDownloadAndInstall).toHaveBeenCalled();
    });
    expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用");
    expect(updateDialogSetOpen).not.toHaveBeenCalled();
  });

  it("runs restart countdown after a successful install", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(useUpdateMeta).mockReturnValue({
        about: { run_mode: "desktop", app_version: "0.0.0" },
        updateCandidate: { version: "1.0.0", currentVersion: "0.0.0", date: 0, rid: "rid" },
        checkingUpdate: false,
        dialogOpen: true,
        installingUpdate: false,
        installError: null,
        installTotalBytes: null,
        installDownloadedBytes: 0,
      } as any);

      vi.mocked(updateDownloadAndInstall).mockResolvedValue(true);
      vi.mocked(appRestart).mockResolvedValue(false);

      render(<UpdateDialog />);

      fireEvent.click(screen.getByRole("button", { name: "下载并安装" }));

      // flush the awaited updateDownloadAndInstall promise
      await Promise.resolve();

      expect(updateDialogSetOpen).toHaveBeenCalledWith(false);
      expect((toast as any).loading).toHaveBeenCalledWith("准备重启（3s）");

      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();

      expect(appRestart).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith("更新已安装：请手动重启应用以生效", expect.any(Object));
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens releases (portable mode) and reports openUrl errors", async () => {
    vi.mocked(useUpdateMeta).mockReturnValue({
      about: { run_mode: "portable", app_version: "0.0.0" },
      updateCandidate: { version: "1.0.0", currentVersion: "0.0.0", date: null, rid: "rid" },
      checkingUpdate: false,
      dialogOpen: true,
      installingUpdate: false,
      installError: null,
      installTotalBytes: null,
      installDownloadedBytes: 0,
    } as any);

    vi.mocked(openUrl).mockRejectedValue(new Error("blocked"));
    vi.spyOn(window, "open").mockImplementation(() => null);

    render(<UpdateDialog />);

    fireEvent.click(screen.getByRole("button", { name: "打开下载页" }));

    await waitFor(() => {
      expect(logToConsole).toHaveBeenCalledWith("error", "打开 Releases 失败", expect.any(Object));
    });
    expect(toast).toHaveBeenCalledWith("打开下载页失败：请查看控制台日志");
  });
});
