import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppSettings, WslHostAddressMode } from "../../services/settings";
import { logToConsole } from "../../services/consoleLog";
import type { WslConfigureReport } from "../../services/wsl";
import { useAppAboutQuery } from "../../query/appAbout";
import { useSettingsSetMutation } from "../../query/settings";
import { useWslConfigureClientsMutation, useWslOverviewQuery } from "../../query/wsl";
import { Card } from "../../ui/Card";
import { Input } from "../../ui/Input";
import { SettingsRow } from "../../ui/SettingsRow";
import { Switch } from "../../ui/Switch";
import { Button } from "../../ui/Button";
import { cn } from "../../utils/cn";
import { Boxes, RefreshCw, Check, X, Info } from "lucide-react";

export type WslSettingsCardProps = {
  available: boolean;
  saving: boolean;
  settings: AppSettings;
};

export function WslSettingsCard({ available, saving, settings }: WslSettingsCardProps) {
  const aboutQuery = useAppAboutQuery({ enabled: available });
  const aboutOs = aboutQuery.data?.os ?? null;

  const wslSupported = useMemo(() => aboutOs === "windows", [aboutOs]);

  const settingsSetMutation = useSettingsSetMutation();
  const settingsMutating = settingsSetMutation.isPending;

  const wslOverviewQuery = useWslOverviewQuery({
    enabled: available && wslSupported,
  });
  const wslConfigureMutation = useWslConfigureClientsMutation();

  const detection = wslOverviewQuery.data?.detection ?? null;
  const hostIp = wslOverviewQuery.data?.hostIp ?? null;
  const statusRows = wslOverviewQuery.data?.statusRows ?? null;

  const checkedOnce = wslOverviewQuery.isFetched;
  const loading = wslOverviewQuery.isFetching;
  const configuring = wslConfigureMutation.isPending;

  const [lastReport, setLastReport] = useState<WslConfigureReport | null>(null);

  const wslDetected = Boolean(detection?.detected);
  const distros = detection?.distros ?? [];

  const [hostAddressMode, setHostAddressMode] = useState<WslHostAddressMode>(
    settings.wsl_host_address_mode
  );
  const [customHostAddress, setCustomHostAddress] = useState(settings.wsl_custom_host_address);

  useEffect(() => {
    setHostAddressMode(settings.wsl_host_address_mode);
  }, [settings.wsl_host_address_mode]);

  useEffect(() => {
    setCustomHostAddress(settings.wsl_custom_host_address);
  }, [settings.wsl_custom_host_address]);

  // 监听后端启动时自动配置结果事件
  useEffect(() => {
    if (!available || !wslSupported) return;

    let cancelled = false;
    let cleanupFn: (() => void) | null = null;

    import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      listen<WslConfigureReport>("wsl:auto_config_result", (event) => {
        setLastReport(event.payload);
        void wslOverviewQuery.refetch();
      }).then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          cleanupFn = unlisten;
        }
      });
    });

    return () => {
      cancelled = true;
      cleanupFn?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, wslSupported]);

  async function refreshAll() {
    if (!available) return;
    setLastReport(null);

    try {
      await wslOverviewQuery.refetch();
    } catch (err) {
      logToConsole("error", "刷新 WSL 状态失败", { error: String(err) });
      toast("刷新 WSL 状态失败：请稍后重试");
    }
  }

  async function configureNow() {
    if (!available) return;
    if (configuring) return;
    if (!wslSupported) {
      toast("仅 Windows 支持 WSL 配置");
      return;
    }
    if (!wslDetected) {
      toast("未检测到 WSL");
      return;
    }

    setLastReport(null);
    try {
      const report = await wslConfigureMutation.mutateAsync();
      if (!report) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      setLastReport(report);
      logToConsole("info", "WSL 一键配置", report);
      toast(report.message || (report.ok ? "配置成功" : "配置失败"));
      await refreshAll();
    } catch (err) {
      logToConsole("error", "WSL 一键配置失败", { error: String(err) });
      toast("WSL 一键配置失败：请查看控制台日志");
    }
  }

  function validateCustomHostAddress(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return "请输入 IP（例如 172.20.0.1）";
    if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes("\\")) {
      return "宿主机地址仅支持 IP（不要包含协议或路径）";
    }
    if (trimmed.includes(":")) {
      return "宿主机地址不支持端口；请只填写 IP（例如 172.20.0.1）";
    }
    return null;
  }

  async function commitHostAddressMode(next: WslHostAddressMode) {
    if (!available) return;
    if (saving || settingsMutating) return;

    setHostAddressMode(next);

    try {
      const updated = await settingsSetMutation.mutateAsync({
        preferredPort: settings.preferred_port,
        autoStart: settings.auto_start,
        logRetentionDays: settings.log_retention_days,
        failoverMaxAttemptsPerProvider: settings.failover_max_attempts_per_provider,
        failoverMaxProvidersToTry: settings.failover_max_providers_to_try,
        wslHostAddressMode: next,
      });
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        setHostAddressMode(settings.wsl_host_address_mode);
        return;
      }
      toast("已保存");
    } catch (err) {
      logToConsole("error", "更新 WSL 宿主机地址模式失败", { error: String(err), next });
      toast("更新失败：请稍后重试");
      setHostAddressMode(settings.wsl_host_address_mode);
    }
  }

  async function commitCustomHostAddress() {
    if (!available) return;
    if (saving || settingsMutating) return;
    if (hostAddressMode !== "custom") return;

    const trimmed = customHostAddress.trim();
    const current = settings.wsl_custom_host_address.trim();
    if (trimmed === current) return;

    const err = validateCustomHostAddress(trimmed);
    if (err) {
      toast(err);
      setCustomHostAddress(settings.wsl_custom_host_address);
      return;
    }

    try {
      const updated = await settingsSetMutation.mutateAsync({
        preferredPort: settings.preferred_port,
        autoStart: settings.auto_start,
        logRetentionDays: settings.log_retention_days,
        failoverMaxAttemptsPerProvider: settings.failover_max_attempts_per_provider,
        failoverMaxProvidersToTry: settings.failover_max_providers_to_try,
        wslHostAddressMode: "custom",
        wslCustomHostAddress: trimmed,
      });
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        setCustomHostAddress(settings.wsl_custom_host_address);
        return;
      }
      toast("已保存");
    } catch (err) {
      logToConsole("error", "更新 WSL 宿主机地址失败", {
        error: String(err),
        address: trimmed,
      });
      toast("更新失败：请稍后重试");
      setCustomHostAddress(settings.wsl_custom_host_address);
    }
  }

  const listenModeIsLocalhost = settings.gateway_listen_mode === "localhost";
  const effectiveHost =
    hostAddressMode === "custom"
      ? customHostAddress.trim() || "127.0.0.1"
      : (hostIp ?? "127.0.0.1");

  return (
    <Card className="md:col-span-2">
      <div className="mb-4 border-b border-slate-100 dark:border-slate-700 pb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Boxes className="h-5 w-5 text-blue-500" />
            WSL 配置
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refreshAll()}
          disabled={!available || loading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {!available ? (
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
          仅在 Tauri Desktop 环境可用
        </div>
      ) : aboutOs && !wslSupported ? (
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
          仅 Windows 支持 WSL 配置
        </div>
      ) : (
        <div className="space-y-1">
          <SettingsRow label="WSL 状态">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full",
                  wslDetected ? "bg-emerald-500" : checkedOnce ? "bg-slate-300" : "bg-slate-200"
                )}
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {!checkedOnce
                  ? loading
                    ? "检测中..."
                    : "等待检测"
                  : wslDetected
                    ? "已检测到 WSL"
                    : "未检测到 WSL"}
              </span>
              {checkedOnce && detection ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({distros.length} 个发行版)
                </span>
              ) : null}
            </div>
          </SettingsRow>

          {wslDetected && distros.length > 0 ? (
            <SettingsRow label="发行版">
              <div className="flex flex-wrap gap-2">
                {distros.map((d) => (
                  <span
                    key={d}
                    className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-600"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </SettingsRow>
          ) : null}

          {statusRows && statusRows.length > 0 ? (
            <div className="mt-3">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                配置状态
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      <th className="text-left px-3 py-2 font-medium">发行版</th>
                      <th className="text-center px-3 py-2 font-medium">Claude</th>
                      <th className="text-center px-3 py-2 font-medium">Codex</th>
                      <th className="text-center px-3 py-2 font-medium">Gemini</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusRows.map((row) => (
                      <tr
                        key={row.distro}
                        className="border-t border-slate-100 dark:border-slate-700"
                      >
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono text-xs">
                          {row.distro}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.claude ? (
                            <Check className="inline h-4 w-4 text-emerald-500" />
                          ) : (
                            <X className="inline h-4 w-4 text-rose-400" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.codex ? (
                            <Check className="inline h-4 w-4 text-emerald-500" />
                          ) : (
                            <X className="inline h-4 w-4 text-rose-400" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.gemini ? (
                            <Check className="inline h-4 w-4 text-emerald-500" />
                          ) : (
                            <X className="inline h-4 w-4 text-rose-400" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>应用启动时会自动检测并配置 WSL 环境。</span>
            </div>
            {listenModeIsLocalhost ? (
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>当前监听模式为"仅本地"，应用会在启动时自动切换监听模式以支持 WSL。</span>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {statusRows ? (
                <span>
                  已检测配置文件：
                  {statusRows.filter((r) => r.claude || r.codex || r.gemini).length}/
                  {statusRows.length} 个 distro
                </span>
              ) : null}
            </div>
            <Button
              onClick={() => void configureNow()}
              disabled={configuring || saving}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", configuring && "animate-spin")} />
              立即配置
            </Button>
          </div>

          <details className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              高级选项（地址兜底）
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                当自动检测到的宿主机地址不可用（WSL 无法访问网关）时，可手动指定一个可用的
                IP；修改后通常需要重启应用/网关后生效。
              </div>

              <SettingsRow label="生效宿主机地址">
                <div className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/20 px-2 py-1 rounded border border-slate-200/60 dark:border-slate-700 break-all">
                  {effectiveHost}
                </div>
              </SettingsRow>

              <SettingsRow label="自动检测地址">
                <div className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/20 px-2 py-1 rounded border border-slate-200/60 dark:border-slate-700 break-all">
                  {hostIp ?? "（未检测到）"}
                </div>
              </SettingsRow>

              <SettingsRow label="使用自定义地址">
                <Switch
                  checked={hostAddressMode === "custom"}
                  onCheckedChange={(checked) =>
                    void commitHostAddressMode(checked ? "custom" : "auto")
                  }
                  disabled={saving || settingsMutating}
                />
              </SettingsRow>

              {hostAddressMode === "custom" ? (
                <SettingsRow label="自定义地址">
                  <Input
                    value={customHostAddress}
                    placeholder={hostIp ?? "172.20.0.1"}
                    onChange={(e) => setCustomHostAddress(e.currentTarget.value)}
                    onBlur={() => void commitCustomHostAddress()}
                    disabled={saving || settingsMutating}
                    className="font-mono"
                  />
                </SettingsRow>
              ) : null}
            </div>
          </details>

          {lastReport ? (
            <div
              className={cn(
                "mt-3 rounded-lg p-3 text-sm border",
                lastReport.ok
                  ? "bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                  : "bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800"
              )}
            >
              {lastReport.message}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
