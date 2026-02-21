import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WslSettingsCard } from "../WslSettingsCard";
import { useAppAboutQuery } from "../../../query/appAbout";
import { useWslConfigureClientsMutation, useWslOverviewQuery } from "../../../query/wsl";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("../../../query/appAbout", async () => {
  const actual =
    await vi.importActual<typeof import("../../../query/appAbout")>("../../../query/appAbout");
  return { ...actual, useAppAboutQuery: vi.fn() };
});

vi.mock("../../../query/wsl", async () => {
  const actual = await vi.importActual<typeof import("../../../query/wsl")>("../../../query/wsl");
  return { ...actual, useWslOverviewQuery: vi.fn(), useWslConfigureClientsMutation: vi.fn() };
});

describe("components/cli-manager/WslSettingsCard", () => {
  it("renders unavailable state when not available", () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: null } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: null,
      isFetched: false,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    render(
      <WslSettingsCard
        available={false}
        saving={false}
        settings={{} as any}
        onPersistSettings={vi.fn(async () => null)}
      />
    );

    expect(screen.getByText("WSL 配置")).toBeInTheDocument();
    expect(screen.getByText("仅在 Tauri Desktop 环境可用")).toBeInTheDocument();
  });

  it("refreshes overview, toggles auto-config, updates targets, and runs configure flow", async () => {
    const overviewRefetch = vi.fn().mockResolvedValue({ data: {} });
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: {
        detection: { detected: true, distros: ["Ubuntu"] },
        hostIp: "172.20.0.1",
        statusRows: [{ distro: "Ubuntu", claude: true, codex: false, gemini: false }],
      },
      isFetched: true,
      isFetching: false,
      refetch: overviewRefetch,
    } as any);

    const configureMutation = { isPending: false, mutateAsync: vi.fn() };
    configureMutation.mutateAsync.mockResolvedValue({ ok: true, message: "OK" });
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue(configureMutation as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: true },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "auto",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const onPersistSettings = vi.fn(async (patch: any) => ({ ...settings, ...patch }));

    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={onPersistSettings}
      />
    );

    expect(screen.getByText("WSL 宿主机地址")).toBeInTheDocument();
    expect(screen.getByText("172.20.0.1")).toBeInTheDocument();
    expect(screen.getByText("Ubuntu")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(overviewRefetch).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(onPersistSettings).toHaveBeenCalledWith({ wsl_auto_config: false }));

    fireEvent.click(screen.getByLabelText("Codex"));
    await waitFor(() =>
      expect(onPersistSettings).toHaveBeenCalledWith({
        wsl_target_cli: { claude: true, codex: true, gemini: true },
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "立即配置" }));
    await waitFor(() => {
      expect(configureMutation.mutateAsync).toHaveBeenCalledWith({
        targets: settings.wsl_target_cli,
      });
    });
    await waitFor(() => expect(overviewRefetch).toHaveBeenCalledTimes(2));
  });

  it("shows configure guard toasts (unsupported OS / listen mode / not detected)", async () => {
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: null, statusRows: null },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "auto",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    // Unsupported OS.
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "mac" } } as any);
    const { rerender } = render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={vi.fn(async () => settings)}
      />
    );
    expect(screen.getByText("仅 Windows 支持 WSL 配置")).toBeInTheDocument();

    // listen mode localhost.
    vi.mocked(toast).mockClear();
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    rerender(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={{ ...settings, gateway_listen_mode: "localhost" }}
        onPersistSettings={vi.fn(async () => settings)}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "立即配置" }));
    expect(toast).toHaveBeenCalledWith("请先将监听模式切换到：WSL 自动检测 / 局域网 / 自定义地址");

    // not detected.
    vi.mocked(toast).mockClear();
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: false, distros: [] }, hostIp: null, statusRows: null },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    rerender(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={vi.fn(async () => settings)}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "立即配置" }));
    expect(toast).toHaveBeenCalledWith("未检测到 WSL");
  });

  it("handles configure report null + failure fallback + errors", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);

    const overviewRefetch = vi.fn().mockResolvedValue({ data: {} });
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: null, statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: overviewRefetch,
    } as any);

    const configureMutation = { isPending: false, mutateAsync: vi.fn() };
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue(configureMutation as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "auto",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const { rerender } = render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={vi.fn(async () => settings)}
      />
    );

    // report=null -> tauri unavailable toast.
    configureMutation.mutateAsync.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "立即配置" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));

    // ok=false + empty message -> fallback "配置失败" + refresh called.
    vi.mocked(toast).mockClear();
    configureMutation.mutateAsync.mockResolvedValueOnce({ ok: false, message: "" });
    fireEvent.click(screen.getByRole("button", { name: "立即配置" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("配置失败"));
    await waitFor(() => expect(overviewRefetch).toHaveBeenCalled());

    // throw -> error toast.
    vi.mocked(toast).mockClear();
    configureMutation.mutateAsync.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "立即配置" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("WSL 一键配置失败：请查看控制台日志"));

    // refreshAll catch path on refresh button.
    vi.mocked(toast).mockClear();
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: null, statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn().mockRejectedValue(new Error("nope")),
    } as any);
    rerender(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={vi.fn(async () => settings)}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("刷新 WSL 状态失败：请稍后重试"));
  });

  it("toasts when persisting settings returns null (non-tauri)", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: null, statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    const onPersistSettings = vi.fn(async () => null);
    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={
          {
            wsl_auto_config: true,
            wsl_target_cli: { claude: true, codex: false, gemini: false },
            gateway_listen_mode: "wsl_auto",
            wsl_host_address_mode: "auto",
            wsl_custom_host_address: "127.0.0.1",
          } as any
        }
        onPersistSettings={onPersistSettings}
      />
    );

    fireEvent.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));

    vi.mocked(toast).mockClear();
    fireEvent.click(screen.getByLabelText("Gemini"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));
  });

  it("switches host address mode to custom and persists", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: "172.20.0.1", statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "auto",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const onPersistSettings = vi.fn(async (patch: any) => ({ ...settings, ...patch }));

    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={onPersistSettings}
      />
    );

    const select = screen.getByDisplayValue("自动检测");
    fireEvent.change(select, { target: { value: "custom" } });
    await waitFor(() =>
      expect(onPersistSettings).toHaveBeenCalledWith({ wsl_host_address_mode: "custom" })
    );
  });

  it("toasts when host address mode persist returns null", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: "172.20.0.1", statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "auto",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const onPersistSettings = vi.fn(async () => null);

    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={onPersistSettings}
      />
    );

    const select = screen.getByDisplayValue("自动检测");
    fireEvent.change(select, { target: { value: "custom" } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));
  });

  it("toasts when host address mode persist throws", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: "172.20.0.1", statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "auto",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const onPersistSettings = vi.fn(async () => {
      throw new Error("fail");
    });

    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={onPersistSettings}
      />
    );

    const select = screen.getByDisplayValue("自动检测");
    fireEvent.change(select, { target: { value: "custom" } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("更新失败：请稍后重试"));
  });

  it("skips custom host address persist when value unchanged", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: null, statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "custom",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const onPersistSettings = vi.fn(async (patch: any) => ({ ...settings, ...patch }));

    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={onPersistSettings}
      />
    );

    // blur without changing value => should not call persist
    const input = screen.getByPlaceholderText("127.0.0.1");
    fireEvent.blur(input);
    // Give async a tick
    await waitFor(() => expect(onPersistSettings).not.toHaveBeenCalled());
  });

  it("toasts when custom host address persist returns null", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: null, statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "custom",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const onPersistSettings = vi.fn(async () => null);

    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={onPersistSettings}
      />
    );

    const input = screen.getByPlaceholderText("127.0.0.1");
    fireEvent.change(input, { target: { value: "10.0.0.1" } });
    fireEvent.blur(input);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));
  });

  it("toasts and reverts when custom host address persist throws", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: null, statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "custom",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const onPersistSettings = vi.fn(async () => {
      throw new Error("boom");
    });

    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={onPersistSettings}
      />
    );

    const input = screen.getByPlaceholderText("127.0.0.1");
    fireEvent.change(input, { target: { value: "10.0.0.1" } });
    fireEvent.blur(input);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("更新失败：请稍后重试"));
  });

  it("persists custom host address on blur", async () => {
    vi.mocked(useAppAboutQuery).mockReturnValue({ data: { os: "windows" } } as any);
    vi.mocked(useWslOverviewQuery).mockReturnValue({
      data: { detection: { detected: true, distros: [] }, hostIp: null, statusRows: [] },
      isFetched: true,
      isFetching: false,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useWslConfigureClientsMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);

    const settings = {
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: false },
      gateway_listen_mode: "wsl_auto",
      wsl_host_address_mode: "custom",
      wsl_custom_host_address: "127.0.0.1",
    } as any;

    const onPersistSettings = vi.fn(async (patch: any) => ({ ...settings, ...patch }));

    render(
      <WslSettingsCard
        available={true}
        saving={false}
        settings={settings}
        onPersistSettings={onPersistSettings}
      />
    );

    const input = screen.getByPlaceholderText("127.0.0.1");
    fireEvent.change(input, { target: { value: "172.20.0.1" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(onPersistSettings).toHaveBeenCalledWith({ wsl_custom_host_address: "172.20.0.1" })
    );
  });
});
