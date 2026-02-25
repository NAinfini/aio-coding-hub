import { invokeService } from "./invokeServiceCommand";
import type { CliKey } from "./providers";

export type OAuthProviderType = "claude_oauth" | "codex_oauth" | "gemini_oauth";
export type OAuthAccountStatus = "active" | "quota_cooldown" | "disabled" | "expired" | "error";

export type OAuthAccountSummary = {
  id: number;
  cli_key: CliKey;
  label: string;
  email: string | null;
  provider_type: OAuthProviderType | string;
  limit_5h_usd?: number | null;
  limit_weekly_usd?: number | null;
  expires_at: number | null;
  refresh_lead_s: number;
  status: OAuthAccountStatus;
  last_error: string | null;
  last_refreshed_at: number | null;
  quota_exceeded: boolean;
  quota_recover_at: number | null;
  created_at: number;
  updated_at: number;
};

export type OAuthAccountEditable = {
  id: number;
  cli_key: CliKey;
  label: string;
  access_token: string;
  refresh_token: string | null;
  id_token: string | null;
  token_uri: string | null;
  expires_at: number | null;
  last_refreshed_at: number | null;
};

export type OAuthLoginProgressStep = "waiting_callback" | "exchanging" | "done" | "error";

export type OAuthLoginProgressEvent = {
  cli_key: CliKey;
  step: OAuthLoginProgressStep;
};

export type OAuthAccountLimitsSnapshot = {
  account_id: number;
  cli_key: CliKey;
  limit_5h_text: string | null;
  limit_weekly_text: string | null;
  fetched_at: number;
};

const PROVIDER_TYPE_BY_CLI: Record<CliKey, OAuthProviderType> = {
  claude: "claude_oauth",
  codex: "codex_oauth",
  gemini: "gemini_oauth",
};

export function oauthProviderTypeForCli(cliKey: CliKey): OAuthProviderType {
  return PROVIDER_TYPE_BY_CLI[cliKey];
}

export async function oauthAccountsList(cliKey: CliKey) {
  return invokeService<OAuthAccountSummary[]>("读取 OAuth 账号列表失败", "oauth_accounts_list", {
    cliKey,
  });
}

export async function oauthAccountGet(id: number) {
  return invokeService<OAuthAccountEditable>("读取 OAuth 账号详情失败", "oauth_account_get", {
    id,
  });
}

export async function oauthStartLogin(input: {
  accountId?: number;
  cliKey: CliKey;
  label: string;
  providerType?: OAuthProviderType | string;
}) {
  return invokeService<OAuthAccountSummary>("OAuth 登录失败", "oauth_start_login", {
    accountId: input.accountId ?? null,
    cliKey: input.cliKey,
    providerType: input.providerType ?? oauthProviderTypeForCli(input.cliKey),
    label: input.label,
  });
}

export async function oauthAccountManualAdd(input: {
  cliKey: CliKey;
  label: string;
  accessToken: string;
  refreshToken?: string | null;
  idToken?: string | null;
  tokenUri?: string | null;
  expiresAt?: number | null;
  lastRefreshedAt?: number | null;
}) {
  return invokeService<OAuthAccountSummary>("手动添加 OAuth 账号失败", "oauth_account_manual_add", {
    cliKey: input.cliKey,
    label: input.label,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    idToken: input.idToken ?? null,
    tokenUri: input.tokenUri ?? null,
    expiresAt: input.expiresAt ?? null,
    lastRefreshedAt: input.lastRefreshedAt ?? null,
  });
}

export async function oauthAccountUpsert(input: {
  accountId: number;
  cliKey: CliKey;
  providerType: OAuthProviderType | string;
  label: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  tokenUri?: string | null;
  expiresAt?: number | null;
  lastRefreshedAt?: number | null;
  refreshLeadSeconds?: number | null;
  status?: OAuthAccountStatus | null;
}) {
  return invokeService<OAuthAccountSummary>("编辑 OAuth 账号失败", "oauth_account_upsert", {
    accountId: input.accountId,
    cliKey: input.cliKey,
    label: input.label,
    email: null,
    providerType: input.providerType,
    accessToken: input.accessToken ?? null,
    refreshToken: input.refreshToken ?? null,
    idToken: input.idToken ?? null,
    tokenUri: input.tokenUri ?? null,
    clientId: null,
    clientSecret: null,
    expiresAt: input.expiresAt ?? null,
    lastRefreshedAt: input.lastRefreshedAt ?? null,
    refreshLeadS: input.refreshLeadSeconds ?? null,
    status: input.status ?? null,
  });
}

export async function oauthAccountSetStatus(input: {
  id: number;
  status: OAuthAccountStatus;
  error?: string | null;
}) {
  return invokeService<OAuthAccountSummary>("更新 OAuth 账号状态失败", "oauth_account_set_status", {
    id: input.id,
    status: input.status,
    error: input.error ?? null,
  });
}

export async function oauthAccountDelete(id: number) {
  return invokeService<boolean>("删除 OAuth 账号失败", "oauth_account_delete", { id });
}

export async function oauthAccountForceRefresh(id: number) {
  return invokeService<OAuthAccountSummary>("刷新 OAuth 账号失败", "oauth_account_force_refresh", {
    id,
  });
}

export async function oauthAccountFetchLimits(id: number) {
  return invokeService<OAuthAccountLimitsSnapshot>(
    "拉取 OAuth 限额失败",
    "oauth_account_fetch_limits",
    { id }
  );
}
