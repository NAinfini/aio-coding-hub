import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriInvoke } from "../../test/mocks/tauri";
import { clearTauriRuntime, setTauriRuntime } from "../../test/utils/tauriRuntime";

describe("services/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when tauri runtime is missing", async () => {
    clearTauriRuntime();
    vi.resetModules();

    const { settingsGet, settingsSet } = await import("../settings");

    expect(await settingsGet()).toBeNull();
    expect(
      await settingsSet({
        preferred_port: 37123,
        auto_start: false,
        tray_enabled: true,
        log_retention_days: 30,
        provider_cooldown_seconds: 30,
        provider_base_url_ping_cache_ttl_seconds: 60,
        upstream_first_byte_timeout_seconds: 0,
        upstream_stream_idle_timeout_seconds: 0,
        upstream_request_timeout_non_streaming_seconds: 0,
        failover_max_attempts_per_provider: 5,
        failover_max_providers_to_try: 5,
        circuit_breaker_failure_threshold: 5,
        circuit_breaker_open_duration_minutes: 30,
      })
    ).toBeNull();

    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("includes optional args only when provided", async () => {
    setTauriRuntime();
    vi.resetModules();
    vi.mocked(tauriInvoke).mockResolvedValue({ schema_version: 1 } as any);

    const { settingsSet } = await import("../settings");

    await settingsSet({
      preferred_port: 37123,
      auto_start: false,
      tray_enabled: true,
      log_retention_days: 30,
      provider_cooldown_seconds: 30,
      provider_base_url_ping_cache_ttl_seconds: 60,
      upstream_first_byte_timeout_seconds: 0,
      upstream_stream_idle_timeout_seconds: 0,
      upstream_request_timeout_non_streaming_seconds: 0,
      failover_max_attempts_per_provider: 5,
      failover_max_providers_to_try: 5,
      circuit_breaker_failure_threshold: 5,
      circuit_breaker_open_duration_minutes: 30,
    });

    const firstArgs = vi.mocked(tauriInvoke).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(firstArgs).not.toHaveProperty("gatewayListenMode");
    expect(firstArgs).not.toHaveProperty("gatewayCustomListenAddress");
    expect(firstArgs).not.toHaveProperty("interceptAnthropicWarmupRequests");
    expect(firstArgs).not.toHaveProperty("enableThinkingSignatureRectifier");
    expect(firstArgs).not.toHaveProperty("enableResponseFixer");
    expect(firstArgs).not.toHaveProperty("responseFixerFixEncoding");
    expect(firstArgs).not.toHaveProperty("responseFixerFixSseFormat");
    expect(firstArgs).not.toHaveProperty("responseFixerFixTruncatedJson");
    expect(firstArgs).not.toHaveProperty("updateReleasesUrl");
    expect(firstArgs).not.toHaveProperty("wslAutoConfig");
    expect(firstArgs).not.toHaveProperty("wslTargetCli");

    vi.mocked(tauriInvoke).mockClear();

    await settingsSet({
      preferred_port: 37123,
      gateway_listen_mode: "custom",
      gateway_custom_listen_address: "0.0.0.0:37123",
      auto_start: false,
      tray_enabled: true,
      log_retention_days: 30,
      provider_cooldown_seconds: 30,
      provider_base_url_ping_cache_ttl_seconds: 60,
      upstream_first_byte_timeout_seconds: 0,
      upstream_stream_idle_timeout_seconds: 0,
      upstream_request_timeout_non_streaming_seconds: 0,
      intercept_anthropic_warmup_requests: true,
      enable_thinking_signature_rectifier: false,
      enable_response_fixer: true,
      response_fixer_fix_encoding: true,
      response_fixer_fix_sse_format: false,
      response_fixer_fix_truncated_json: true,
      update_releases_url: "https://example.invalid/releases.json",
      failover_max_attempts_per_provider: 5,
      failover_max_providers_to_try: 5,
      circuit_breaker_failure_threshold: 5,
      circuit_breaker_open_duration_minutes: 30,
      wsl_auto_config: true,
      wsl_target_cli: { claude: true, codex: false, gemini: true },
    });

    expect(tauriInvoke).toHaveBeenCalledWith(
      "settings_set",
      expect.objectContaining({
        gatewayListenMode: "custom",
        gatewayCustomListenAddress: "0.0.0.0:37123",
        interceptAnthropicWarmupRequests: true,
        enableThinkingSignatureRectifier: false,
        enableResponseFixer: true,
        responseFixerFixEncoding: true,
        responseFixerFixSseFormat: false,
        responseFixerFixTruncatedJson: true,
        updateReleasesUrl: "https://example.invalid/releases.json",
        wslAutoConfig: true,
        wslTargetCli: { claude: true, codex: false, gemini: true },
      })
    );
  });
});
