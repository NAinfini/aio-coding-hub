import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  settingsGet,
  settingsSet,
  type AppSettings,
  type GatewayListenMode,
  type WslTargetCli,
} from "../services/settings";
import { settingsCircuitBreakerNoticeSet } from "../services/settingsCircuitBreakerNotice";
import { settingsCodexSessionIdCompletionSet } from "../services/settingsCodexSessionIdCompletion";
import {
  settingsGatewayRectifierSet,
  type GatewayRectifierSettingsPatch,
} from "../services/settingsGatewayRectifier";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { settingsKeys } from "./keys";

export function useSettingsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: settingsKeys.get(),
    queryFn: () => settingsGet(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export type SettingsSetInput = {
  preferred_port: number;
  gateway_listen_mode?: GatewayListenMode;
  gateway_custom_listen_address?: string;
  auto_start: boolean;
  tray_enabled: boolean;
  enable_cli_proxy_startup_recovery?: boolean;
  log_retention_days: number;
  provider_cooldown_seconds: number;
  provider_base_url_ping_cache_ttl_seconds: number;
  upstream_first_byte_timeout_seconds: number;
  upstream_stream_idle_timeout_seconds: number;
  upstream_request_timeout_non_streaming_seconds: number;
  intercept_anthropic_warmup_requests?: boolean;
  enable_thinking_signature_rectifier?: boolean;
  enable_response_fixer?: boolean;
  response_fixer_fix_encoding?: boolean;
  response_fixer_fix_sse_format?: boolean;
  response_fixer_fix_truncated_json?: boolean;
  update_releases_url?: string;
  failover_max_attempts_per_provider: number;
  failover_max_providers_to_try: number;
  circuit_breaker_failure_threshold: number;
  circuit_breaker_open_duration_minutes: number;
  wsl_auto_config?: boolean;
  wsl_target_cli?: WslTargetCli;
};

export function useSettingsSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SettingsSetInput) => settingsSet(input),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData<AppSettings | null>(settingsKeys.get(), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.get() });
    },
  });
}

export function useSettingsGatewayRectifierSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GatewayRectifierSettingsPatch) => settingsGatewayRectifierSet(input),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData<AppSettings | null>(settingsKeys.get(), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.get() });
    },
  });
}

export function useSettingsCircuitBreakerNoticeSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enable: boolean) => settingsCircuitBreakerNoticeSet(enable),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData<AppSettings | null>(settingsKeys.get(), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.get() });
    },
  });
}

export function useSettingsCodexSessionIdCompletionSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enable: boolean) => settingsCodexSessionIdCompletionSet(enable),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData<AppSettings | null>(settingsKeys.get(), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.get() });
    },
  });
}
