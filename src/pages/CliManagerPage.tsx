// Usage: UI for configuring local CLI integrations and related app settings. Backend commands: `cli_manager_*`, `settings_*`, `cli_proxy_*`, `gateway_*`.

import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { type ClaudeSettingsPatch, type CodexConfigPatch } from "../services/cliManager";
import { logToConsole } from "../services/consoleLog";
import { type GatewayRectifierSettingsPatch } from "../services/settingsGatewayRectifier";
import type { AppSettings } from "../services/settings";
import {
  useSettingsCircuitBreakerNoticeSetMutation,
  useSettingsCodexSessionIdCompletionSetMutation,
  useSettingsGatewayRectifierSetMutation,
  useSettingsQuery,
  useSettingsSetMutation,
} from "../query/settings";
import {
  useCliManagerClaudeInfoQuery,
  useCliManagerClaudeSettingsQuery,
  useCliManagerClaudeSettingsSetMutation,
  useCliManagerCodexConfigQuery,
  useCliManagerCodexConfigSetMutation,
  useCliManagerCodexInfoQuery,
  useCliManagerGeminiInfoQuery,
} from "../query/cliManager";
import { formatActionFailureToast } from "../utils/errors";
import { CliManagerGeneralTab } from "../components/cli-manager/tabs/GeneralTab";
import { PageHeader } from "../ui/PageHeader";
import { TabList } from "../ui/TabList";

type TabKey = "general" | "claude" | "codex" | "gemini";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "general", label: "通用" },
  { key: "claude", label: "Claude Code" },
  { key: "codex", label: "Codex" },
  { key: "gemini", label: "Gemini" },
];

const DEFAULT_RECTIFIER: GatewayRectifierSettingsPatch = {
  intercept_anthropic_warmup_requests: false,
  enable_thinking_signature_rectifier: true,
  enable_response_fixer: true,
  response_fixer_fix_encoding: true,
  response_fixer_fix_sse_format: true,
  response_fixer_fix_truncated_json: true,
  response_fixer_max_json_depth: 200,
  response_fixer_max_fix_size: 1024 * 1024,
};

const LazyClaudeTab = lazy(() =>
  import("../components/cli-manager/tabs/ClaudeTab").then((m) => ({
    default: m.CliManagerClaudeTab,
  }))
);

const LazyCodexTab = lazy(() =>
  import("../components/cli-manager/tabs/CodexTab").then((m) => ({
    default: m.CliManagerCodexTab,
  }))
);

const LazyGeminiTab = lazy(() =>
  import("../components/cli-manager/tabs/GeminiTab").then((m) => ({
    default: m.CliManagerGeminiTab,
  }))
);

const TAB_FALLBACK = <div className="p-6 text-sm text-slate-500">加载中…</div>;

export function CliManagerPage() {
  const [tab, setTab] = useState<TabKey>("general");

  const settingsQuery = useSettingsQuery();
  const appSettings = settingsQuery.data ?? null;

  const rectifierAvailable: "checking" | "available" | "unavailable" = settingsQuery.isLoading
    ? "checking"
    : appSettings
      ? "available"
      : "unavailable";

  const rectifierMutation = useSettingsGatewayRectifierSetMutation();
  const circuitBreakerNoticeMutation = useSettingsCircuitBreakerNoticeSetMutation();
  const codexSessionIdCompletionMutation = useSettingsCodexSessionIdCompletionSetMutation();
  const commonSettingsMutation = useSettingsSetMutation();

  const rectifierSaving = rectifierMutation.isPending;
  const circuitBreakerNoticeSaving = circuitBreakerNoticeMutation.isPending;
  const codexSessionIdCompletionSaving = codexSessionIdCompletionMutation.isPending;
  const commonSettingsSaving = commonSettingsMutation.isPending;

  const [rectifier, setRectifier] = useState<GatewayRectifierSettingsPatch>(DEFAULT_RECTIFIER);
  const [circuitBreakerNoticeEnabled, setCircuitBreakerNoticeEnabled] = useState(false);
  const [codexSessionIdCompletionEnabled, setCodexSessionIdCompletionEnabled] = useState(true);
  const [upstreamFirstByteTimeoutSeconds, setUpstreamFirstByteTimeoutSeconds] = useState<number>(0);
  const [upstreamStreamIdleTimeoutSeconds, setUpstreamStreamIdleTimeoutSeconds] =
    useState<number>(0);
  const [upstreamRequestTimeoutNonStreamingSeconds, setUpstreamRequestTimeoutNonStreamingSeconds] =
    useState<number>(0);
  const [providerCooldownSeconds, setProviderCooldownSeconds] = useState<number>(30);
  const [providerBaseUrlPingCacheTtlSeconds, setProviderBaseUrlPingCacheTtlSeconds] =
    useState<number>(60);
  const [circuitBreakerFailureThreshold, setCircuitBreakerFailureThreshold] = useState<number>(5);
  const [circuitBreakerOpenDurationMinutes, setCircuitBreakerOpenDurationMinutes] =
    useState<number>(30);

  const claudeInfoQuery = useCliManagerClaudeInfoQuery({ enabled: tab === "claude" });
  const claudeSettingsQuery = useCliManagerClaudeSettingsQuery({ enabled: tab === "claude" });
  const claudeSettingsSetMutation = useCliManagerClaudeSettingsSetMutation();

  const claudeInfo = claudeInfoQuery.data ?? null;
  const claudeSettings = claudeSettingsQuery.data ?? null;
  const claudeAvailable: "checking" | "available" | "unavailable" =
    claudeInfoQuery.isFetching && !claudeInfo
      ? "checking"
      : claudeInfo
        ? "available"
        : "unavailable";
  const claudeLoading = claudeInfoQuery.isFetching;
  const claudeSettingsLoading = claudeSettingsQuery.isFetching;
  const claudeSettingsSaving = claudeSettingsSetMutation.isPending;

  const codexInfoQuery = useCliManagerCodexInfoQuery({ enabled: tab === "codex" });
  const codexConfigQuery = useCliManagerCodexConfigQuery({ enabled: tab === "codex" });
  const codexConfigSetMutation = useCliManagerCodexConfigSetMutation();

  const codexInfo = codexInfoQuery.data ?? null;
  const codexConfig = codexConfigQuery.data ?? null;
  const codexAvailable: "checking" | "available" | "unavailable" =
    codexInfoQuery.isFetching && !codexInfo ? "checking" : codexInfo ? "available" : "unavailable";
  const codexLoading = codexInfoQuery.isFetching;
  const codexConfigLoading = codexConfigQuery.isFetching;
  const codexConfigSaving = codexConfigSetMutation.isPending;

  const geminiInfoQuery = useCliManagerGeminiInfoQuery({ enabled: tab === "gemini" });
  const geminiInfo = geminiInfoQuery.data ?? null;
  const geminiAvailable: "checking" | "available" | "unavailable" =
    geminiInfoQuery.isFetching && !geminiInfo
      ? "checking"
      : geminiInfo
        ? "available"
        : "unavailable";
  const geminiLoading = geminiInfoQuery.isFetching;

  useEffect(() => {
    if (!appSettings) return;
    setRectifier({
      intercept_anthropic_warmup_requests: appSettings.intercept_anthropic_warmup_requests,
      enable_thinking_signature_rectifier: appSettings.enable_thinking_signature_rectifier,
      enable_response_fixer: appSettings.enable_response_fixer,
      response_fixer_fix_encoding: appSettings.response_fixer_fix_encoding,
      response_fixer_fix_sse_format: appSettings.response_fixer_fix_sse_format,
      response_fixer_fix_truncated_json: appSettings.response_fixer_fix_truncated_json,
      response_fixer_max_json_depth: appSettings.response_fixer_max_json_depth,
      response_fixer_max_fix_size: appSettings.response_fixer_max_fix_size,
    });
    setCircuitBreakerNoticeEnabled(appSettings.enable_circuit_breaker_notice ?? false);
    setCodexSessionIdCompletionEnabled(appSettings.enable_codex_session_id_completion ?? true);
    setUpstreamFirstByteTimeoutSeconds(appSettings.upstream_first_byte_timeout_seconds);
    setUpstreamStreamIdleTimeoutSeconds(appSettings.upstream_stream_idle_timeout_seconds);
    setUpstreamRequestTimeoutNonStreamingSeconds(
      appSettings.upstream_request_timeout_non_streaming_seconds
    );
    setProviderCooldownSeconds(appSettings.provider_cooldown_seconds);
    setProviderBaseUrlPingCacheTtlSeconds(appSettings.provider_base_url_ping_cache_ttl_seconds);
    setCircuitBreakerFailureThreshold(appSettings.circuit_breaker_failure_threshold);
    setCircuitBreakerOpenDurationMinutes(appSettings.circuit_breaker_open_duration_minutes);
  }, [appSettings]);

  async function persistRectifier(patch: Partial<GatewayRectifierSettingsPatch>) {
    if (rectifierSaving) return;
    if (rectifierAvailable !== "available") return;

    const prev = rectifier;
    const next = { ...prev, ...patch };
    setRectifier(next);
    try {
      const updated = await rectifierMutation.mutateAsync(next);
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        setRectifier(prev);
        return;
      }

      setRectifier({
        intercept_anthropic_warmup_requests: updated.intercept_anthropic_warmup_requests,
        enable_thinking_signature_rectifier: updated.enable_thinking_signature_rectifier,
        enable_response_fixer: updated.enable_response_fixer,
        response_fixer_fix_encoding: updated.response_fixer_fix_encoding,
        response_fixer_fix_sse_format: updated.response_fixer_fix_sse_format,
        response_fixer_fix_truncated_json: updated.response_fixer_fix_truncated_json,
        response_fixer_max_json_depth: updated.response_fixer_max_json_depth,
        response_fixer_max_fix_size: updated.response_fixer_max_fix_size,
      });
    } catch (err) {
      logToConsole("error", "更新网关整流配置失败", { error: String(err) });
      toast("更新网关整流配置失败：请稍后重试");
      setRectifier(prev);
    }
  }

  async function persistCircuitBreakerNotice(enable: boolean) {
    if (circuitBreakerNoticeSaving) return;
    if (rectifierAvailable !== "available") return;

    const prev = circuitBreakerNoticeEnabled;
    setCircuitBreakerNoticeEnabled(enable);
    try {
      const updated = await circuitBreakerNoticeMutation.mutateAsync(enable);
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        setCircuitBreakerNoticeEnabled(prev);
        return;
      }

      setCircuitBreakerNoticeEnabled(updated.enable_circuit_breaker_notice ?? enable);
      toast(enable ? "已开启熔断通知" : "已关闭熔断通知");
    } catch (err) {
      logToConsole("error", "更新熔断通知配置失败", { error: String(err) });
      toast("更新熔断通知配置失败：请稍后重试");
      setCircuitBreakerNoticeEnabled(prev);
    }
  }

  async function persistCodexSessionIdCompletion(enable: boolean) {
    if (codexSessionIdCompletionSaving) return;
    if (rectifierAvailable !== "available") return;

    const prev = codexSessionIdCompletionEnabled;
    setCodexSessionIdCompletionEnabled(enable);
    try {
      const updated = await codexSessionIdCompletionMutation.mutateAsync(enable);
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        setCodexSessionIdCompletionEnabled(prev);
        return;
      }

      setCodexSessionIdCompletionEnabled(updated.enable_codex_session_id_completion ?? enable);
      toast(enable ? "已开启 Codex Session ID 补全" : "已关闭 Codex Session ID 补全");
    } catch (err) {
      logToConsole("error", "更新 Codex Session ID 补全配置失败", { error: String(err) });
      toast("更新 Codex Session ID 补全配置失败：请稍后重试");
      setCodexSessionIdCompletionEnabled(prev);
    }
  }

  async function persistCommonSettings(patch: Partial<AppSettings>): Promise<AppSettings | null> {
    if (commonSettingsSaving) return null;
    if (rectifierAvailable !== "available") return null;
    if (!appSettings) return null;

    const prev = appSettings;
    const next: AppSettings = { ...prev, ...patch };
    try {
      const updated = await commonSettingsMutation.mutateAsync({
        preferred_port: next.preferred_port,
        gateway_listen_mode: next.gateway_listen_mode,
        gateway_custom_listen_address: next.gateway_custom_listen_address,
        auto_start: next.auto_start,
        tray_enabled: next.tray_enabled,
        enable_cli_proxy_startup_recovery: next.enable_cli_proxy_startup_recovery,
        log_retention_days: next.log_retention_days,
        provider_cooldown_seconds: next.provider_cooldown_seconds,
        provider_base_url_ping_cache_ttl_seconds: next.provider_base_url_ping_cache_ttl_seconds,
        upstream_first_byte_timeout_seconds: next.upstream_first_byte_timeout_seconds,
        upstream_stream_idle_timeout_seconds: next.upstream_stream_idle_timeout_seconds,
        upstream_request_timeout_non_streaming_seconds:
          next.upstream_request_timeout_non_streaming_seconds,
        failover_max_attempts_per_provider: next.failover_max_attempts_per_provider,
        failover_max_providers_to_try: next.failover_max_providers_to_try,
        circuit_breaker_failure_threshold: next.circuit_breaker_failure_threshold,
        circuit_breaker_open_duration_minutes: next.circuit_breaker_open_duration_minutes,
        wsl_auto_config: next.wsl_auto_config,
        wsl_target_cli: next.wsl_target_cli,
      });

      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        return null;
      }

      setUpstreamFirstByteTimeoutSeconds(updated.upstream_first_byte_timeout_seconds);
      setUpstreamStreamIdleTimeoutSeconds(updated.upstream_stream_idle_timeout_seconds);
      setUpstreamRequestTimeoutNonStreamingSeconds(
        updated.upstream_request_timeout_non_streaming_seconds
      );
      setProviderCooldownSeconds(updated.provider_cooldown_seconds);
      setProviderBaseUrlPingCacheTtlSeconds(updated.provider_base_url_ping_cache_ttl_seconds);
      setCircuitBreakerFailureThreshold(updated.circuit_breaker_failure_threshold);
      setCircuitBreakerOpenDurationMinutes(updated.circuit_breaker_open_duration_minutes);
      toast("已保存");
      return updated;
    } catch (err) {
      logToConsole("error", "更新通用网关参数失败", { error: String(err) });
      toast("更新通用网关参数失败：请稍后重试");
      setUpstreamFirstByteTimeoutSeconds(prev.upstream_first_byte_timeout_seconds);
      setUpstreamStreamIdleTimeoutSeconds(prev.upstream_stream_idle_timeout_seconds);
      setUpstreamRequestTimeoutNonStreamingSeconds(
        prev.upstream_request_timeout_non_streaming_seconds
      );
      setProviderCooldownSeconds(prev.provider_cooldown_seconds);
      setProviderBaseUrlPingCacheTtlSeconds(prev.provider_base_url_ping_cache_ttl_seconds);
      setCircuitBreakerFailureThreshold(prev.circuit_breaker_failure_threshold);
      setCircuitBreakerOpenDurationMinutes(prev.circuit_breaker_open_duration_minutes);
      return null;
    }
  }

  async function refreshClaude() {
    await Promise.all([claudeSettingsQuery.refetch(), claudeInfoQuery.refetch()]);
  }

  async function refreshCodex() {
    await Promise.all([codexConfigQuery.refetch(), codexInfoQuery.refetch()]);
  }

  async function refreshGeminiInfo() {
    await geminiInfoQuery.refetch();
  }

  async function persistCodexConfig(patch: CodexConfigPatch) {
    if (codexConfigSaving) return;
    if (codexAvailable !== "available") return;

    try {
      const updated = await codexConfigSetMutation.mutateAsync(patch);
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      toast("已更新 Codex 配置");
    } catch (err) {
      const formatted = formatActionFailureToast("更新 Codex 配置", err);
      logToConsole("error", "更新 Codex 配置失败", {
        error: formatted.raw,
        error_code: formatted.error_code ?? undefined,
        patch,
      });
      toast(formatted.toast);
    }
  }

  async function persistClaudeSettings(patch: ClaudeSettingsPatch) {
    if (claudeSettingsSaving) return;
    if (claudeAvailable !== "available") return;

    try {
      const updated = await claudeSettingsSetMutation.mutateAsync(patch);
      if (!updated) {
        toast("仅在 Tauri Desktop 环境可用");
        return;
      }
      toast("已更新 Claude Code 配置");
    } catch (err) {
      logToConsole("error", "更新 Claude Code settings.json 失败", { error: String(err) });
      toast("更新 Claude Code 配置失败：请稍后重试");
    }
  }

  async function openClaudeConfigDir() {
    const dir = claudeInfo?.config_dir ?? claudeSettings?.config_dir;
    if (!dir) return;
    try {
      await openPath(dir);
    } catch (err) {
      logToConsole("error", "打开 Claude 配置目录失败", { error: String(err) });
      toast("打开目录失败：请查看控制台日志");
    }
  }

  async function openCodexConfigDir() {
    if (!codexConfig) return;
    if (!codexConfig.can_open_config_dir) {
      toast("受权限限制，无法自动打开该目录（仅允许 $HOME/.codex 下的路径）");
      return;
    }
    try {
      await openPath(codexConfig.config_dir);
    } catch (err) {
      logToConsole("error", "打开 Codex 配置目录失败", { error: String(err) });
      toast("打开目录失败：请查看控制台日志");
    }
  }

  function blurOnEnter(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="CLI 管理"
        actions={
          <TabList ariaLabel="CLI 管理视图切换" items={TABS} value={tab} onChange={setTab} />
        }
      />

      <div className="min-h-[400px]">
        {tab === "general" ? (
          <CliManagerGeneralTab
            rectifierAvailable={rectifierAvailable}
            rectifierSaving={rectifierSaving}
            rectifier={rectifier}
            onPersistRectifier={persistRectifier}
            circuitBreakerNoticeEnabled={circuitBreakerNoticeEnabled}
            circuitBreakerNoticeSaving={circuitBreakerNoticeSaving}
            onPersistCircuitBreakerNotice={persistCircuitBreakerNotice}
            codexSessionIdCompletionEnabled={codexSessionIdCompletionEnabled}
            codexSessionIdCompletionSaving={codexSessionIdCompletionSaving}
            onPersistCodexSessionIdCompletion={persistCodexSessionIdCompletion}
            appSettings={appSettings}
            commonSettingsSaving={commonSettingsSaving}
            onPersistCommonSettings={persistCommonSettings}
            upstreamFirstByteTimeoutSeconds={upstreamFirstByteTimeoutSeconds}
            setUpstreamFirstByteTimeoutSeconds={setUpstreamFirstByteTimeoutSeconds}
            upstreamStreamIdleTimeoutSeconds={upstreamStreamIdleTimeoutSeconds}
            setUpstreamStreamIdleTimeoutSeconds={setUpstreamStreamIdleTimeoutSeconds}
            upstreamRequestTimeoutNonStreamingSeconds={upstreamRequestTimeoutNonStreamingSeconds}
            setUpstreamRequestTimeoutNonStreamingSeconds={
              setUpstreamRequestTimeoutNonStreamingSeconds
            }
            providerCooldownSeconds={providerCooldownSeconds}
            setProviderCooldownSeconds={setProviderCooldownSeconds}
            providerBaseUrlPingCacheTtlSeconds={providerBaseUrlPingCacheTtlSeconds}
            setProviderBaseUrlPingCacheTtlSeconds={setProviderBaseUrlPingCacheTtlSeconds}
            circuitBreakerFailureThreshold={circuitBreakerFailureThreshold}
            setCircuitBreakerFailureThreshold={setCircuitBreakerFailureThreshold}
            circuitBreakerOpenDurationMinutes={circuitBreakerOpenDurationMinutes}
            setCircuitBreakerOpenDurationMinutes={setCircuitBreakerOpenDurationMinutes}
            blurOnEnter={blurOnEnter}
          />
        ) : null}

        {tab === "claude" ? (
          <Suspense fallback={TAB_FALLBACK}>
            <LazyClaudeTab
              claudeAvailable={claudeAvailable}
              claudeLoading={claudeLoading}
              claudeInfo={claudeInfo}
              claudeSettingsLoading={claudeSettingsLoading}
              claudeSettingsSaving={claudeSettingsSaving}
              claudeSettings={claudeSettings}
              refreshClaude={refreshClaude}
              openClaudeConfigDir={openClaudeConfigDir}
              persistClaudeSettings={persistClaudeSettings}
            />
          </Suspense>
        ) : null}

        {tab === "codex" ? (
          <Suspense fallback={TAB_FALLBACK}>
            <LazyCodexTab
              codexAvailable={codexAvailable}
              codexLoading={codexLoading}
              codexConfigLoading={codexConfigLoading}
              codexConfigSaving={codexConfigSaving}
              codexInfo={codexInfo}
              codexConfig={codexConfig}
              refreshCodex={refreshCodex}
              openCodexConfigDir={openCodexConfigDir}
              persistCodexConfig={persistCodexConfig}
            />
          </Suspense>
        ) : null}

        {tab === "gemini" ? (
          <Suspense fallback={TAB_FALLBACK}>
            <LazyGeminiTab
              geminiAvailable={geminiAvailable}
              geminiLoading={geminiLoading}
              geminiInfo={geminiInfo}
              refreshGeminiInfo={refreshGeminiInfo}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
