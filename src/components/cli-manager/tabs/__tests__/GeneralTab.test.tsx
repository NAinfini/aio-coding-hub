import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { toast } from "sonner";
import {
  setCacheAnomalyMonitorEnabled,
  useCacheAnomalyMonitorEnabled,
} from "../../../../services/cacheAnomalyMonitor";
import type { AppSettings } from "../../../../services/settings";
import type { GatewayRectifierSettingsPatch } from "../../../../services/settingsGatewayRectifier";
import { CliManagerGeneralTab } from "../GeneralTab";

const navigateMock = vi.fn();

vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("../../NetworkSettingsCard", () => ({
  NetworkSettingsCard: () => <div>network-card</div>,
}));
vi.mock("../../WslSettingsCard", () => ({ WslSettingsCard: () => <div>wsl-card</div> }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../../../services/cacheAnomalyMonitor", async () => {
  const actual = await vi.importActual<typeof import("../../../../services/cacheAnomalyMonitor")>(
    "../../../../services/cacheAnomalyMonitor"
  );
  return {
    ...actual,
    useCacheAnomalyMonitorEnabled: vi.fn(),
    setCacheAnomalyMonitorEnabled: vi.fn(),
  };
});

function renderTab(element: ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

function createAppSettings(): AppSettings {
  return {
    schema_version: 1,
    preferred_port: 37123,
    gateway_listen_mode: "localhost",
    gateway_custom_listen_address: "",
    wsl_auto_config: false,
    wsl_target_cli: { claude: true, codex: false, gemini: false },
    auto_start: false,
    tray_enabled: true,
    enable_cli_proxy_startup_recovery: true,
    log_retention_days: 30,
    provider_cooldown_seconds: 30,
    provider_base_url_ping_cache_ttl_seconds: 60,
    upstream_first_byte_timeout_seconds: 0,
    upstream_stream_idle_timeout_seconds: 0,
    upstream_request_timeout_non_streaming_seconds: 0,
    update_releases_url: "",
    failover_max_attempts_per_provider: 5,
    failover_max_providers_to_try: 5,
    circuit_breaker_failure_threshold: 5,
    circuit_breaker_open_duration_minutes: 30,
    enable_circuit_breaker_notice: false,
    intercept_anthropic_warmup_requests: false,
    enable_thinking_signature_rectifier: true,
    enable_codex_session_id_completion: true,
    enable_response_fixer: true,
    response_fixer_fix_encoding: true,
    response_fixer_fix_sse_format: true,
    response_fixer_fix_truncated_json: true,
    response_fixer_max_json_depth: 200,
    response_fixer_max_fix_size: 1024,
  };
}

function createRectifierPatch(): GatewayRectifierSettingsPatch {
  return {
    intercept_anthropic_warmup_requests: false,
    enable_thinking_signature_rectifier: true,
    enable_response_fixer: true,
    response_fixer_fix_encoding: true,
    response_fixer_fix_sse_format: true,
    response_fixer_fix_truncated_json: true,
    response_fixer_max_json_depth: 200,
    response_fixer_max_fix_size: 1024,
  };
}

describe("cli-manager/GeneralTab", () => {
  it("renders unavailable state", () => {
    vi.mocked(useCacheAnomalyMonitorEnabled).mockReturnValue(false);

    renderTab(
      <CliManagerGeneralTab
        rectifierAvailable="unavailable"
        rectifierSaving={false}
        rectifier={createRectifierPatch()}
        onPersistRectifier={vi.fn()}
        circuitBreakerNoticeEnabled={false}
        circuitBreakerNoticeSaving={false}
        onPersistCircuitBreakerNotice={vi.fn()}
        codexSessionIdCompletionEnabled={true}
        codexSessionIdCompletionSaving={false}
        onPersistCodexSessionIdCompletion={vi.fn()}
        appSettings={null}
        commonSettingsSaving={false}
        onPersistCommonSettings={vi.fn()}
        upstreamFirstByteTimeoutSeconds={0}
        setUpstreamFirstByteTimeoutSeconds={vi.fn()}
        upstreamStreamIdleTimeoutSeconds={0}
        setUpstreamStreamIdleTimeoutSeconds={vi.fn()}
        upstreamRequestTimeoutNonStreamingSeconds={0}
        setUpstreamRequestTimeoutNonStreamingSeconds={vi.fn()}
        providerCooldownSeconds={30}
        setProviderCooldownSeconds={vi.fn()}
        providerBaseUrlPingCacheTtlSeconds={60}
        setProviderBaseUrlPingCacheTtlSeconds={vi.fn()}
        circuitBreakerFailureThreshold={5}
        setCircuitBreakerFailureThreshold={vi.fn()}
        circuitBreakerOpenDurationMinutes={30}
        setCircuitBreakerOpenDurationMinutes={vi.fn()}
        blurOnEnter={vi.fn()}
      />
    );

    expect(screen.getAllByText("仅在 Tauri Desktop 环境可用").length).toBeGreaterThan(0);
    expect(screen.getAllByText("不可用").length).toBeGreaterThan(0);
  });

  it("wires switches, inputs and navigation actions when available", () => {
    vi.mocked(useCacheAnomalyMonitorEnabled).mockReturnValue(false);
    navigateMock.mockClear();

    const rectifier = createRectifierPatch();
    const onPersistRectifier = vi.fn();
    const onPersistCircuitBreakerNotice = vi.fn();
    const onPersistCodexSessionIdCompletion = vi.fn();
    const onPersistCommonSettings = vi.fn().mockResolvedValue(createAppSettings());

    const setUpstreamFirstByteTimeoutSeconds = vi.fn();
    const setUpstreamStreamIdleTimeoutSeconds = vi.fn();
    const setUpstreamRequestTimeoutNonStreamingSeconds = vi.fn();
    const setProviderCooldownSeconds = vi.fn();
    const setProviderBaseUrlPingCacheTtlSeconds = vi.fn();
    const setCircuitBreakerFailureThreshold = vi.fn();
    const setCircuitBreakerOpenDurationMinutes = vi.fn();
    const blurOnEnter = vi.fn();

    renderTab(
      <CliManagerGeneralTab
        rectifierAvailable="available"
        rectifierSaving={false}
        rectifier={rectifier}
        onPersistRectifier={onPersistRectifier}
        circuitBreakerNoticeEnabled={false}
        circuitBreakerNoticeSaving={false}
        onPersistCircuitBreakerNotice={onPersistCircuitBreakerNotice}
        codexSessionIdCompletionEnabled={true}
        codexSessionIdCompletionSaving={false}
        onPersistCodexSessionIdCompletion={onPersistCodexSessionIdCompletion}
        appSettings={createAppSettings()}
        commonSettingsSaving={false}
        onPersistCommonSettings={onPersistCommonSettings}
        upstreamFirstByteTimeoutSeconds={0}
        setUpstreamFirstByteTimeoutSeconds={setUpstreamFirstByteTimeoutSeconds}
        upstreamStreamIdleTimeoutSeconds={0}
        setUpstreamStreamIdleTimeoutSeconds={setUpstreamStreamIdleTimeoutSeconds}
        upstreamRequestTimeoutNonStreamingSeconds={0}
        setUpstreamRequestTimeoutNonStreamingSeconds={setUpstreamRequestTimeoutNonStreamingSeconds}
        providerCooldownSeconds={30}
        setProviderCooldownSeconds={setProviderCooldownSeconds}
        providerBaseUrlPingCacheTtlSeconds={60}
        setProviderBaseUrlPingCacheTtlSeconds={setProviderBaseUrlPingCacheTtlSeconds}
        circuitBreakerFailureThreshold={5}
        setCircuitBreakerFailureThreshold={setCircuitBreakerFailureThreshold}
        circuitBreakerOpenDurationMinutes={30}
        setCircuitBreakerOpenDurationMinutes={setCircuitBreakerOpenDurationMinutes}
        blurOnEnter={blurOnEnter}
      />
    );

    // Navigation
    fireEvent.click(screen.getByRole("button", { name: "打开控制台" }));
    expect(navigateMock).toHaveBeenCalledWith("/console");

    // Toggle a few switches to execute handler paths.
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThan(5);
    for (const el of switches) {
      fireEvent.click(el);
    }
    expect(onPersistRectifier).toHaveBeenCalled();
    expect(onPersistCircuitBreakerNotice).toHaveBeenCalled();
    expect(onPersistCodexSessionIdCompletion).toHaveBeenCalled();
    expect(setCacheAnomalyMonitorEnabled).toHaveBeenCalled();
    expect(toast).toHaveBeenCalled();

    // Inputs: change + blur should validate and persist (or toast on invalid)
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs.length).toBeGreaterThan(6);

    fireEvent.keyDown(inputs[0], { key: "Enter" });
    expect(blurOnEnter).toHaveBeenCalled();

    fireEvent.change(inputs[0], { target: { value: "5" } });
    fireEvent.blur(inputs[0], { target: { value: "5" } });
    expect(setUpstreamFirstByteTimeoutSeconds).toHaveBeenCalled();
    expect(onPersistCommonSettings).toHaveBeenCalledWith({
      upstream_first_byte_timeout_seconds: 5,
    });

    fireEvent.change(inputs[1], { target: { value: "-1" } });
    fireEvent.blur(inputs[1], { target: { value: "-1" } });
    expect(toast).toHaveBeenCalledWith("上游流式空闲超时必须为 0-3600 秒");
    expect(setUpstreamStreamIdleTimeoutSeconds).toHaveBeenCalled();

    fireEvent.change(inputs[2], { target: { value: "10" } });
    fireEvent.blur(inputs[2], { target: { value: "10" } });
    expect(setUpstreamRequestTimeoutNonStreamingSeconds).toHaveBeenCalled();
    expect(onPersistCommonSettings).toHaveBeenCalledWith({
      upstream_request_timeout_non_streaming_seconds: 10,
    });

    fireEvent.change(inputs[3], { target: { value: "12" } });
    fireEvent.blur(inputs[3], { target: { value: "12" } });
    expect(setProviderCooldownSeconds).toHaveBeenCalled();
    expect(onPersistCommonSettings).toHaveBeenCalledWith({ provider_cooldown_seconds: 12 });

    fireEvent.change(inputs[4], { target: { value: "120" } });
    fireEvent.blur(inputs[4], { target: { value: "120" } });
    expect(setProviderBaseUrlPingCacheTtlSeconds).toHaveBeenCalled();

    fireEvent.change(inputs[5], { target: { value: "6" } });
    fireEvent.blur(inputs[5], { target: { value: "6" } });
    expect(setCircuitBreakerFailureThreshold).toHaveBeenCalled();

    fireEvent.change(inputs[6], { target: { value: "31" } });
    fireEvent.blur(inputs[6], { target: { value: "31" } });
    expect(setCircuitBreakerOpenDurationMinutes).toHaveBeenCalled();
  });
});
