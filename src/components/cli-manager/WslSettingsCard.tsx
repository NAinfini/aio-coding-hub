import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppSettings, WslTargetCli } from "../../services/settings";
import { logToConsole } from "../../services/consoleLog";
import type { WslConfigureReport } from "../../services/wsl";
import { useAppAboutQuery } from "../../query/appAbout";
import { useWslConfigureClientsMutation, useWslOverviewQuery } from "../../query/wsl";
import { Card } from "../../ui/Card";
import { SettingsRow } from "../../ui/SettingsRow";
import { Switch } from "../../ui/Switch";
import { Button } from "../../ui/Button";
import { cn } from "../../utils/cn";
import { Boxes, RefreshCw, Terminal, Bot, Cpu } from "lucide-react";

export type WslSettingsCardProps = {
  available: boolean;
  saving: boolean;
  settings: AppSettings;
  onPersistSettings: (patch: Partial<AppSettings>) => Promise<AppSettings | null>;
};

function toggleTarget(prev: WslTargetCli, key: keyof WslTargetCli, next: boolean): WslTargetCli {
  return { ...prev, [key]: next };
}

export function WslSettingsCard({
  available,
  saving,
  settings,
  onPersistSettings,
}: WslSettingsCardProps) {
  const aboutQuery = useAppAboutQuery({ enabled: available });
  const aboutOs = aboutQuery.data?.os ?? null;

  const wslOverviewQuery = useWslOverviewQuery({
    enabled: available && Boolean(settings.wsl_auto_config),
  });
  const wslConfigureMutation = useWslConfigureClientsMutation();

  const detection = wslOverviewQuery.data?.detection ?? null;
  const hostIp = wslOverviewQuery.data?.hostIp ?? null;
  const statusRows = wslOverviewQuery.data?.statusRows ?? null;

  const checkedOnce = wslOverviewQuery.isFetched;
  const loading = wslOverviewQuery.isFetching;
  const configuring = wslConfigureMutation.isPending;

  const [lastReport, setLastReport] = useState<WslConfigureReport | null>(null);

  const wslSupported = useMemo(() => aboutOs === "windows", [aboutOs]);
  const listenModeOk = settings.gateway_listen_mode !== "localhost";
  const wslDetected = Boolean(detection?.detected);
  const distros = detection?.distros ?? [];

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

  async function commitAutoConfig(next: boolean) {
    if (!available) return;
    try {
      const updated = await onPersistSettings({ wsl_auto_config: next });
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      logToConsole("info", "更新 WSL 自动配置开关", { enabled: next });
    } catch (err) {
      logToConsole("error", "更新 WSL 自动配置开关失败", { error: String(err), enabled: next });
      toast("更新失败：请稍后重试");
    }
  }

  async function commitTargets(nextTargets: WslTargetCli) {
    if (!available) return;
    try {
      const updated = await onPersistSettings({ wsl_target_cli: nextTargets });
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      logToConsole("info", "更新 WSL 目标 CLI", nextTargets);
    } catch (err) {
      logToConsole("error", "更新 WSL 目标 CLI 失败", { error: String(err), nextTargets });
      toast("更新失败：请稍后重试");
    }
  }

  async function configureNow() {
    if (!available) return;
    if (configuring) return;
    if (!wslSupported) {
      toast("仅 Windows 支持 WSL 配置");
      return;
    }
    if (!listenModeOk) {
      toast("请先将监听模式切换到：WSL 自动检测 / 局域网 / 自定义地址");
      return;
    }
    if (!wslDetected) {
      toast("未检测到 WSL");
      return;
    }

    setLastReport(null);
    try {
      const report = await wslConfigureMutation.mutateAsync({ targets: settings.wsl_target_cli });
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
          <SettingsRow label="WSL 自动配置">
            <Switch
              checked={settings.wsl_auto_config}
              onCheckedChange={(checked) => void commitAutoConfig(checked)}
              disabled={saving}
            />
          </SettingsRow>

          <SettingsRow label="WSL 宿主机地址">
            <div className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded border border-slate-100 dark:border-slate-700">
              {hostIp ?? "—"}
            </div>
          </SettingsRow>

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
                    : "未检测（默认关闭）"
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

          {settings.wsl_auto_config ? (
            <SettingsRow label="目标 CLI">
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.wsl_target_cli.claude}
                    onChange={(e) =>
                      void commitTargets(
                        toggleTarget(settings.wsl_target_cli, "claude", e.currentTarget.checked)
                      )
                    }
                    disabled={saving}
                  />
                  <Bot className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  Claude
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.wsl_target_cli.codex}
                    onChange={(e) =>
                      void commitTargets(
                        toggleTarget(settings.wsl_target_cli, "codex", e.currentTarget.checked)
                      )
                    }
                    disabled={saving}
                  />
                  <Terminal className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  Codex
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.wsl_target_cli.gemini}
                    onChange={(e) =>
                      void commitTargets(
                        toggleTarget(settings.wsl_target_cli, "gemini", e.currentTarget.checked)
                      )
                    }
                    disabled={saving}
                  />
                  <Cpu className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  Gemini
                </label>
              </div>
            </SettingsRow>
          ) : null}

          {settings.wsl_auto_config ? (
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {listenModeOk ? null : "提示：监听模式为“仅本地(127.0.0.1)”时，WSL 无法访问网关。"}
                {statusRows ? (
                  <div className="mt-1">
                    已检测配置文件：
                    {statusRows.filter((r) => r.claude || r.codex || r.gemini).length}/
                    {statusRows.length} 个 distro
                  </div>
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
          ) : null}

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
