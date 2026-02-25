import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OAuthAccountSummary } from "../../services/oauthAccounts";
import {
  oauthAccountDelete,
  oauthAccountForceRefresh,
  oauthAccountManualAdd,
  oauthAccountsList,
  oauthAccountSetStatus,
  oauthStartLogin,
} from "../../services/oauthAccounts";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import { createQueryWrapper, createTestQueryClient } from "../../test/utils/reactQuery";
import { emitTauriEvent } from "../../test/mocks/tauri";
import {
  useOAuthAccountDeleteMutation,
  useOAuthAccountForceRefreshMutation,
  useOAuthAccountManualAddMutation,
  useOAuthAccountSetStatusMutation,
  useOAuthAccountsEventBridge,
  useOAuthAccountsListQuery,
  useOAuthStartLoginMutation,
} from "../oauthAccounts";
import { oauthAccountsKeys } from "../keys";

vi.mock("../../services/oauthAccounts", async () => {
  const actual = await vi.importActual<typeof import("../../services/oauthAccounts")>(
    "../../services/oauthAccounts"
  );
  return {
    ...actual,
    oauthAccountsList: vi.fn(),
    oauthStartLogin: vi.fn(),
    oauthAccountManualAdd: vi.fn(),
    oauthAccountSetStatus: vi.fn(),
    oauthAccountDelete: vi.fn(),
    oauthAccountForceRefresh: vi.fn(),
  };
});

function account(partial: Partial<OAuthAccountSummary> = {}): OAuthAccountSummary {
  return {
    id: partial.id ?? 1,
    cli_key: partial.cli_key ?? "claude",
    label: partial.label ?? "Work",
    email: partial.email ?? null,
    provider_type: partial.provider_type ?? "claude_oauth",
    expires_at: partial.expires_at ?? null,
    refresh_lead_s: partial.refresh_lead_s ?? 3600,
    status: partial.status ?? "active",
    last_error: partial.last_error ?? null,
    last_refreshed_at: partial.last_refreshed_at ?? null,
    quota_exceeded: partial.quota_exceeded ?? false,
    quota_recover_at: partial.quota_recover_at ?? null,
    created_at: partial.created_at ?? 0,
    updated_at: partial.updated_at ?? 0,
  };
}

describe("query/oauthAccounts", () => {
  it("does not call oauthAccountsList without tauri runtime", async () => {
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useOAuthAccountsListQuery("claude"), { wrapper });
    await Promise.resolve();

    expect(oauthAccountsList).not.toHaveBeenCalled();
  });

  it("calls oauthAccountsList with tauri runtime", async () => {
    setTauriRuntime();
    vi.mocked(oauthAccountsList).mockResolvedValue([]);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useOAuthAccountsListQuery("claude"), { wrapper });
    await waitFor(() => expect(oauthAccountsList).toHaveBeenCalledWith("claude"));
  });

  it("start login/manual add/status/refresh mutations update cached account rows", async () => {
    setTauriRuntime();

    const first = account({ id: 1, label: "A" });
    const second = account({ id: 2, label: "B", status: "disabled" });
    const refreshed = account({ id: 1, status: "active", last_refreshed_at: 123 });

    vi.mocked(oauthStartLogin).mockResolvedValue(first);
    vi.mocked(oauthAccountManualAdd).mockResolvedValue(second);
    vi.mocked(oauthAccountSetStatus).mockResolvedValue(account({ id: 2, status: "active" }));
    vi.mocked(oauthAccountForceRefresh).mockResolvedValue(refreshed);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result: loginMutation } = renderHook(() => useOAuthStartLoginMutation(), { wrapper });
    await act(async () => {
      await loginMutation.current.mutateAsync({ cliKey: "claude", label: "A" });
    });

    const { result: manualMutation } = renderHook(() => useOAuthAccountManualAddMutation(), {
      wrapper,
    });
    await act(async () => {
      await manualMutation.current.mutateAsync({
        cliKey: "claude",
        label: "B",
        accessToken: "token",
      });
    });

    const { result: statusMutation } = renderHook(() => useOAuthAccountSetStatusMutation(), {
      wrapper,
    });
    await act(async () => {
      await statusMutation.current.mutateAsync({ id: 2, status: "active" });
    });

    const { result: refreshMutation } = renderHook(() => useOAuthAccountForceRefreshMutation(), {
      wrapper,
    });
    await act(async () => {
      await refreshMutation.current.mutateAsync({ id: 1 });
    });

    const rows = client.getQueryData<OAuthAccountSummary[]>(oauthAccountsKeys.list("claude"));
    expect(rows?.map((row) => row.id).sort()).toEqual([1, 2]);
    expect(rows?.find((row) => row.id === 1)?.last_refreshed_at).toBe(123);
  });

  it("delete mutation removes account from cache", async () => {
    setTauriRuntime();
    vi.mocked(oauthAccountDelete).mockResolvedValue(true);

    const client = createTestQueryClient();
    client.setQueryData(oauthAccountsKeys.list("claude"), [account({ id: 1 }), account({ id: 2 })]);
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useOAuthAccountDeleteMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cliKey: "claude", id: 1 });
    });

    expect(client.getQueryData<OAuthAccountSummary[]>(oauthAccountsKeys.list("claude"))).toEqual([
      expect.objectContaining({ id: 2 }),
    ]);
  });

  it("event bridge updates login progress map", async () => {
    setTauriRuntime();
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useOAuthAccountsEventBridge(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      emitTauriEvent("oauth-login-progress", { cli_key: "claude", step: "waiting_callback" });
      await Promise.resolve();
    });

    expect(result.current.claude).toBe("waiting_callback");
  });
});
