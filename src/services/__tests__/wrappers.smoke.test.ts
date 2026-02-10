import { describe, expect, it } from "vitest";

import { appAboutGet } from "../appAbout";
import {
  cliManagerClaudeEnvSet,
  cliManagerClaudeInfoGet,
  cliManagerClaudeSettingsGet,
  cliManagerClaudeSettingsSet,
  cliManagerCodexConfigGet,
  cliManagerCodexConfigSet,
  cliManagerCodexInfoGet,
  cliManagerGeminiInfoGet,
} from "../cliManager";
import { cliProxySetEnabled, cliProxyStatusAll } from "../cliProxy";
import {
  costBackfillMissingV1,
  costBreakdownModelV1,
  costBreakdownProviderV1,
  costScatterCliProviderModelV1,
  costSummaryV1,
  costTopRequestsV1,
  costTrendV1,
} from "../cost";
import {
  appDataDirGet,
  appDataReset,
  dbDiskUsageGet,
  requestLogsClearAll,
} from "../dataManagement";
import {
  gatewayCircuitResetCli,
  gatewayCircuitResetProvider,
  gatewayCircuitStatus,
  gatewayCheckPortAvailable,
  gatewaySessionsList,
  gatewayStart,
  gatewayStatus,
  gatewayStop,
} from "../gateway";
import { mcpServerSetEnabled, mcpServerUpsert, mcpServersList } from "../mcp";
import {
  modelPriceAliasesGet,
  modelPriceAliasesSet,
  modelPricesList,
  modelPricesSyncBasellm,
} from "../modelPrices";
import { noticeSend } from "../notice";
import {
  promptDelete,
  promptSetEnabled,
  promptUpsert,
  promptsDefaultSyncFromFiles,
  promptsList,
} from "../prompts";
import {
  baseUrlPingMs,
  providerDelete,
  providerSetEnabled,
  providerUpsert,
  providersList,
  providersReorder,
} from "../providers";
import { requestAttemptLogsByTraceId, requestLogGet, requestLogsListAll } from "../requestLogs";
import { settingsGet, settingsSet } from "../settings";
import { settingsCircuitBreakerNoticeSet } from "../settingsCircuitBreakerNotice";
import { settingsCodexSessionIdCompletionSet } from "../settingsCodexSessionIdCompletion";
import { settingsGatewayRectifierSet } from "../settingsGatewayRectifier";
import {
  skillImportLocal,
  skillInstall,
  skillRepoDelete,
  skillRepoUpsert,
  skillReposList,
  skillSetEnabled,
  skillUninstall,
  skillsDiscoverAvailable,
  skillsInstalledList,
  skillsLocalList,
  skillsPathsGet,
} from "../skills";
import { sortModeActiveList, sortModeActiveSet, sortModesList } from "../sortModes";
import { updaterCheck, updaterDownloadAndInstall } from "../updater";
import {
  usageHourlySeries,
  usageLeaderboardDay,
  usageLeaderboardProvider,
  usageLeaderboardV2,
  usageSummary,
  usageSummaryV2,
} from "../usage";
import {
  workspaceApply,
  workspaceCreate,
  workspaceDelete,
  workspacePreview,
  workspaceRename,
  workspacesList,
} from "../workspaces";
import { wslHostAddressGet } from "../wsl";

describe("services wrappers (smoke)", () => {
  it("returns null/false without tauri runtime", async () => {
    await expect(appAboutGet()).resolves.toBeNull();

    await expect(cliManagerClaudeInfoGet()).resolves.toBeNull();
    await expect(cliManagerClaudeSettingsGet()).resolves.toBeNull();
    await expect(cliManagerCodexInfoGet()).resolves.toBeNull();
    await expect(cliManagerCodexConfigGet()).resolves.toBeNull();
    await expect(cliManagerGeminiInfoGet()).resolves.toBeNull();
    await expect(
      cliManagerClaudeEnvSet({ mcp_timeout_ms: null, disable_error_reporting: false })
    ).resolves.toBeNull();
    await expect(cliManagerClaudeSettingsSet({ model: "claude" })).resolves.toBeNull();
    await expect(cliManagerCodexConfigSet({ model: "codex" })).resolves.toBeNull();

    await expect(cliProxyStatusAll()).resolves.toBeNull();
    await expect(
      cliProxySetEnabled({ cli_key: "claude" as any, enabled: true })
    ).resolves.toBeNull();

    await expect(costSummaryV1("daily")).resolves.toBeNull();
    await expect(costTrendV1("daily")).resolves.toBeNull();
    await expect(costBreakdownProviderV1("daily")).resolves.toBeNull();
    await expect(costBreakdownModelV1("daily")).resolves.toBeNull();
    await expect(costTopRequestsV1("daily")).resolves.toBeNull();
    await expect(costScatterCliProviderModelV1("daily")).resolves.toBeNull();
    await expect(costBackfillMissingV1("daily")).resolves.toBeNull();

    await expect(dbDiskUsageGet()).resolves.toBeNull();
    await expect(requestLogsClearAll()).resolves.toBeNull();
    await expect(appDataReset()).resolves.toBeNull();
    await expect(appDataDirGet()).resolves.toBeNull();

    await expect(gatewayStatus()).resolves.toBeNull();
    await expect(gatewayStart(37123)).resolves.toBeNull();
    await expect(gatewayStop()).resolves.toBeNull();
    await expect(gatewayCheckPortAvailable(37123)).resolves.toBeNull();
    await expect(gatewaySessionsList(10)).resolves.toBeNull();
    await expect(gatewayCircuitStatus("claude")).resolves.toBeNull();
    await expect(gatewayCircuitResetProvider(1)).resolves.toBeNull();
    await expect(gatewayCircuitResetCli("claude")).resolves.toBeNull();

    await expect(mcpServersList(1)).resolves.toBeNull();
    await expect(
      mcpServerSetEnabled({ workspace_id: 1, server_id: 1, enabled: true })
    ).resolves.toBeNull();
    await expect(
      mcpServerUpsert({
        server_key: "x",
        name: "x",
        transport: "stdio",
        command: "x",
        args: [],
        env: {},
      })
    ).resolves.toBeNull();

    await expect(modelPricesList("claude")).resolves.toBeNull();
    await expect(modelPriceAliasesGet()).resolves.toBeNull();
    await expect(modelPriceAliasesSet({} as any)).resolves.toBeNull();
    await expect(modelPricesSyncBasellm(false)).resolves.toBeNull();

    await expect(noticeSend({ level: "info", body: "x" })).resolves.toBe(false);

    await expect(promptsList(1)).resolves.toBeNull();
    await expect(promptsDefaultSyncFromFiles()).resolves.toBeNull();
    await expect(
      promptUpsert({
        prompt_id: null,
        workspace_id: 1,
        name: "x",
        description: null,
        content: "x",
        tags: [],
        enabled: true,
      } as any)
    ).resolves.toBeNull();
    await expect(promptSetEnabled(1, true)).resolves.toBeNull();
    await expect(promptDelete(1)).resolves.toBeNull();

    await expect(providersList("claude")).resolves.toBeNull();
    await expect(baseUrlPingMs("https://x")).resolves.toBeNull();
    await expect(
      providerUpsert({
        cli_key: "claude",
        name: "x",
        base_urls: [],
        base_url_mode: "order",
        enabled: true,
        cost_multiplier: 1,
        limit_5h_usd: null,
        limit_daily_usd: null,
        daily_reset_mode: "fixed",
        daily_reset_time: "00:00:00",
        limit_weekly_usd: null,
        limit_monthly_usd: null,
        limit_total_usd: null,
      })
    ).resolves.toBeNull();
    await expect(providerSetEnabled(1, true)).resolves.toBeNull();
    await expect(providerDelete(1)).resolves.toBeNull();
    await expect(providersReorder("claude", [1])).resolves.toBeNull();

    await expect(requestLogsListAll(10)).resolves.toBeNull();
    await expect(requestLogGet(1)).resolves.toBeNull();
    await expect(requestAttemptLogsByTraceId("t", 10)).resolves.toBeNull();

    await expect(settingsGet()).resolves.toBeNull();
    await expect(
      settingsSet({
        preferredPort: 37123,
        gatewayListenMode: null,
        gatewayCustomListenAddress: null,
        autoStart: false,
        trayEnabled: null,
        logRetentionDays: 7,
        providerCooldownSeconds: null,
        providerBaseUrlPingCacheTtlSeconds: null,
        upstreamFirstByteTimeoutSeconds: null,
        upstreamStreamIdleTimeoutSeconds: null,
        upstreamRequestTimeoutNonStreamingSeconds: null,
        enableCacheAnomalyMonitor: null,
        interceptAnthropicWarmupRequests: null,
        enableThinkingSignatureRectifier: null,
        enableResponseFixer: null,
        responseFixerFixEncoding: null,
        responseFixerFixSseFormat: null,
        responseFixerFixTruncatedJson: null,
        failoverMaxAttemptsPerProvider: null,
        failoverMaxProvidersToTry: null,
        circuitBreakerFailureThreshold: null,
        circuitBreakerOpenDurationMinutes: null,
      } as any)
    ).resolves.toBeNull();

    await expect(settingsCircuitBreakerNoticeSet(true)).resolves.toBeNull();
    await expect(settingsCodexSessionIdCompletionSet(true)).resolves.toBeNull();
    await expect(
      settingsGatewayRectifierSet({ enable_response_fixer: true } as any)
    ).resolves.toBeNull();

    await expect(skillReposList()).resolves.toBeNull();
    await expect(
      skillRepoUpsert({ repo_id: null, git_url: "x", branch: "main", enabled: true })
    ).resolves.toBeNull();
    await expect(skillRepoDelete(1)).resolves.toBeNull();
    await expect(skillsInstalledList(1)).resolves.toBeNull();
    await expect(skillsDiscoverAvailable(false)).resolves.toBeNull();
    await expect(
      skillInstall({
        workspace_id: 1,
        git_url: "x",
        branch: "main",
        source_subdir: ".",
        enabled: true,
      })
    ).resolves.toBeNull();
    await expect(
      skillSetEnabled({ workspace_id: 1, skill_id: 1, enabled: true })
    ).resolves.toBeNull();
    await expect(skillUninstall(1)).resolves.toBeNull();
    await expect(skillsLocalList(1)).resolves.toBeNull();
    await expect(skillImportLocal({ workspace_id: 1, dir_name: "x" })).resolves.toBeNull();
    await expect(skillsPathsGet("claude")).resolves.toBeNull();

    await expect(sortModesList()).resolves.toBeNull();
    await expect(sortModeActiveList()).resolves.toBeNull();
    await expect(sortModeActiveSet({ cli_key: "claude", mode_id: null })).resolves.toBeNull();

    await expect(updaterCheck()).resolves.toBeNull();
    await expect(updaterDownloadAndInstall({ rid: 1, onEvent: () => {} })).resolves.toBeNull();

    await expect(usageSummary("today")).resolves.toBeNull();
    await expect(usageLeaderboardProvider("today")).resolves.toBeNull();
    await expect(usageLeaderboardDay("today")).resolves.toBeNull();
    await expect(usageHourlySeries(7)).resolves.toBeNull();
    await expect(usageSummaryV2("daily")).resolves.toBeNull();
    await expect(usageLeaderboardV2("cli", "daily")).resolves.toBeNull();

    await expect(workspacesList("claude")).resolves.toBeNull();
    await expect(
      workspaceCreate({ cli_key: "claude", name: "x", description: null } as any)
    ).resolves.toBeNull();
    await expect(workspaceRename({ workspace_id: 1, name: "x" })).resolves.toBeNull();
    await expect(workspacePreview(1)).resolves.toBeNull();
    await expect(workspaceApply(1)).resolves.toBeNull();
    await expect(workspaceDelete(1)).resolves.toBeNull();

    await expect(wslHostAddressGet()).resolves.toBeNull();
  });
});
