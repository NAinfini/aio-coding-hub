import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { CliKey } from "../services/providers";
import {
  oauthAccountDelete,
  oauthAccountFetchLimits,
  oauthAccountForceRefresh,
  oauthAccountManualAdd,
  oauthAccountUpsert,
  oauthAccountsList,
  oauthAccountSetStatus,
  oauthProviderTypeForCli,
  oauthStartLogin,
  type OAuthAccountStatus,
  type OAuthAccountSummary,
  type OAuthLoginProgressEvent,
  type OAuthLoginProgressStep,
  type OAuthProviderType,
} from "../services/oauthAccounts";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { oauthAccountsKeys, providersKeys, usageKeys } from "./keys";

export type OAuthFetchedLimitsSnapshot = {
  limit5hText: string | null;
  limitWeeklyText: string | null;
};

export type OAuthFetchedLimitsByAccountId = Record<number, OAuthFetchedLimitsSnapshot>;

function upsertAccountInList(
  prev: OAuthAccountSummary[] | null | undefined,
  next: OAuthAccountSummary
): OAuthAccountSummary[] {
  const items = prev ?? [];
  const idx = items.findIndex((row) => row.id === next.id);
  if (idx < 0) return [next, ...items];
  const copied = items.slice();
  copied[idx] = next;
  return copied;
}

function invalidateRelatedCaches(queryClient: ReturnType<typeof useQueryClient>, cliKey: CliKey) {
  queryClient.invalidateQueries({ queryKey: oauthAccountsKeys.list(cliKey) });
  queryClient.invalidateQueries({ queryKey: providersKeys.list(cliKey) });
  queryClient.invalidateQueries({ queryKey: usageKeys.all });
}

export function useOAuthAccountsListQuery(cliKey: CliKey, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: oauthAccountsKeys.list(cliKey),
    queryFn: () => oauthAccountsList(cliKey),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useOAuthFetchedLimitsQuery() {
  return useQuery({
    queryKey: oauthAccountsKeys.fetchedLimits(),
    queryFn: async (): Promise<OAuthFetchedLimitsByAccountId> => ({}),
    initialData: (): OAuthFetchedLimitsByAccountId => ({}),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export function useOAuthStartLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      accountId?: number;
      cliKey: CliKey;
      label: string;
      providerType?: OAuthProviderType | string;
    }) =>
      oauthStartLogin({
        accountId: input.accountId,
        cliKey: input.cliKey,
        label: input.label,
        providerType: input.providerType ?? oauthProviderTypeForCli(input.cliKey),
      }),
    onSuccess: (summary, input) => {
      if (!summary) return;
      queryClient.setQueryData<OAuthAccountSummary[] | null>(
        oauthAccountsKeys.list(input.cliKey),
        (prev) => upsertAccountInList(prev, summary)
      );
      invalidateRelatedCaches(queryClient, input.cliKey);
    },
  });
}

export function useOAuthAccountManualAddMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cliKey: CliKey;
      label: string;
      accessToken: string;
      refreshToken?: string | null;
      idToken?: string | null;
      tokenUri?: string | null;
      expiresAt?: number | null;
      lastRefreshedAt?: number | null;
    }) => oauthAccountManualAdd(input),
    onSuccess: (summary, input) => {
      if (!summary) return;
      queryClient.setQueryData<OAuthAccountSummary[] | null>(
        oauthAccountsKeys.list(input.cliKey),
        (prev) => upsertAccountInList(prev, summary)
      );
      invalidateRelatedCaches(queryClient, input.cliKey);
    },
  });
}

export function useOAuthAccountUpsertMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
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
    }) => oauthAccountUpsert(input),
    onSuccess: (summary) => {
      if (!summary) return;
      queryClient.setQueryData<OAuthAccountSummary[] | null>(
        oauthAccountsKeys.list(summary.cli_key),
        (prev) => upsertAccountInList(prev, summary)
      );
      invalidateRelatedCaches(queryClient, summary.cli_key);
    },
  });
}

export function useOAuthAccountSetStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; status: OAuthAccountStatus; error?: string | null }) =>
      oauthAccountSetStatus(input),
    onSuccess: (summary) => {
      if (!summary) return;
      queryClient.setQueryData<OAuthAccountSummary[] | null>(
        oauthAccountsKeys.list(summary.cli_key),
        (prev) => upsertAccountInList(prev, summary)
      );
      invalidateRelatedCaches(queryClient, summary.cli_key);
    },
  });
}

export function useOAuthAccountForceRefreshMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number }) => oauthAccountForceRefresh(input.id),
    onSuccess: (summary) => {
      if (!summary) return;
      queryClient.setQueryData<OAuthAccountSummary[] | null>(
        oauthAccountsKeys.list(summary.cli_key),
        (prev) => upsertAccountInList(prev, summary)
      );
      invalidateRelatedCaches(queryClient, summary.cli_key);
    },
  });
}

export function useOAuthAccountFetchLimitsMutation() {
  return useMutation({
    mutationFn: (input: { id: number }) => oauthAccountFetchLimits(input.id),
  });
}

export function useOAuthAccountDeleteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cliKey: CliKey; id: number }) => oauthAccountDelete(input.id),
    onSuccess: (ok, input) => {
      if (!ok) return;
      queryClient.setQueryData<OAuthAccountSummary[] | null>(
        oauthAccountsKeys.list(input.cliKey),
        (prev) => {
          if (!prev) return prev;
          return prev.filter((row) => row.id !== input.id);
        }
      );
      invalidateRelatedCaches(queryClient, input.cliKey);
    },
  });
}

export function useOAuthAccountsEventBridge(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;
  const [loginProgressByCli, setLoginProgressByCli] = useState<
    Partial<Record<CliKey, OAuthLoginProgressStep>>
  >({});

  useEffect(() => {
    if (!enabled || !hasTauriRuntime()) return;

    let disposed = false;
    let unsubscribers: Array<() => void> = [];

    const load = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (disposed) return;

      const onAccountEvent = () => {
        queryClient.invalidateQueries({ queryKey: oauthAccountsKeys.lists() });
        queryClient.invalidateQueries({ queryKey: providersKeys.all });
        queryClient.invalidateQueries({ queryKey: usageKeys.all });
      };

      const unlistenRefreshed = await listen("oauth-account-refreshed", onAccountEvent);
      const unlistenError = await listen("oauth-account-error", onAccountEvent);
      const unlistenQuota = await listen("oauth-account-quota", onAccountEvent);
      const unlistenProgress = await listen<OAuthLoginProgressEvent>(
        "oauth-login-progress",
        (event) => {
          const payload = event.payload;
          if (!payload?.cli_key || !payload?.step) return;

          const cliKey = payload.cli_key;
          setLoginProgressByCli((prev) => ({ ...prev, [cliKey]: payload.step }));
          if (payload.step === "done" || payload.step === "error") {
            invalidateRelatedCaches(queryClient, cliKey);
          }
        }
      );

      unsubscribers = [unlistenRefreshed, unlistenError, unlistenQuota, unlistenProgress];
      if (disposed) {
        for (const unlisten of unsubscribers) unlisten();
        unsubscribers = [];
      }
    };

    void load();

    return () => {
      disposed = true;
      for (const unlisten of unsubscribers) unlisten();
      unsubscribers = [];
    };
  }, [enabled, queryClient]);

  return useMemo(() => loginProgressByCli, [loginProgressByCli]);
}
