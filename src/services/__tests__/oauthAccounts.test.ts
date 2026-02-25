import { describe, expect, it, vi } from "vitest";
import { hasTauriRuntime, invokeTauriOrNull } from "../tauriInvoke";
import { logToConsole } from "../consoleLog";
import {
  oauthAccountDelete,
  oauthAccountForceRefresh,
  oauthAccountGet,
  oauthAccountManualAdd,
  oauthAccountUpsert,
  oauthAccountSetStatus,
  oauthAccountsList,
  oauthStartLogin,
} from "../oauthAccounts";

vi.mock("../tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../tauriInvoke")>("../tauriInvoke");
  return {
    ...actual,
    hasTauriRuntime: vi.fn(),
    invokeTauriOrNull: vi.fn(),
  };
});

vi.mock("../consoleLog", async () => {
  const actual = await vi.importActual<typeof import("../consoleLog")>("../consoleLog");
  return {
    ...actual,
    logToConsole: vi.fn(),
  };
});

describe("services/oauthAccounts", () => {
  it("returns null without tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);

    await expect(oauthAccountsList("claude")).resolves.toBeNull();
    await expect(oauthAccountGet(1)).resolves.toBeNull();
    await expect(oauthStartLogin({ cliKey: "claude", label: "Work" })).resolves.toBeNull();
    await expect(
      oauthAccountManualAdd({
        cliKey: "claude",
        label: "Manual",
        accessToken: "token",
      })
    ).resolves.toBeNull();
    await expect(
      oauthAccountUpsert({
        accountId: 1,
        cliKey: "claude",
        label: "Work",
        providerType: "claude_oauth",
      })
    ).resolves.toBeNull();
    await expect(oauthAccountSetStatus({ id: 1, status: "disabled" })).resolves.toBeNull();
    await expect(oauthAccountDelete(1)).resolves.toBeNull();
    await expect(oauthAccountForceRefresh(1)).resolves.toBeNull();

    expect(logToConsole).not.toHaveBeenCalled();
  });

  it("rethrows invoke errors and logs", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockRejectedValueOnce(new Error("oauth boom"));

    await expect(oauthAccountsList("claude")).rejects.toThrow("oauth boom");
    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "读取 OAuth 账号列表失败",
      expect.objectContaining({
        cmd: "oauth_accounts_list",
        error: expect.stringContaining("oauth boom"),
      })
    );
  });

  it("treats null invoke result as error when runtime exists", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValueOnce(null);

    await expect(oauthAccountsList("claude")).rejects.toThrow(
      "IPC_NULL_RESULT: oauth_accounts_list"
    );
  });

  it("passes normalized command args", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce({ id: 1 } as any)
      .mockResolvedValueOnce({ id: 1 } as any)
      .mockResolvedValueOnce({ id: 2 } as any)
      .mockResolvedValueOnce({ id: 2 } as any)
      .mockResolvedValueOnce({ id: 1 } as any)
      .mockResolvedValueOnce(true as any)
      .mockResolvedValueOnce({ id: 1 } as any);

    await oauthAccountsList("claude");
    await oauthAccountGet(1);
    await oauthStartLogin({ cliKey: "claude", label: "Work" });
    await oauthAccountManualAdd({
      cliKey: "codex",
      label: "Manual",
      accessToken: "token",
      refreshToken: "refresh",
      idToken: "id-token",
      tokenUri: "https://token.example.com",
      expiresAt: 123,
      lastRefreshedAt: 456,
    });
    await oauthAccountUpsert({
      accountId: 2,
      cliKey: "codex",
      providerType: "codex_oauth",
      label: "manual-2",
      accessToken: "token-next",
      refreshToken: "refresh-next",
      idToken: "id-next",
      tokenUri: "https://token-2.example.com",
      expiresAt: 999,
      lastRefreshedAt: 777,
      refreshLeadSeconds: 1800,
      status: "active",
    });
    await oauthAccountSetStatus({ id: 9, status: "disabled", error: "quota" });
    await oauthAccountDelete(9);
    await oauthAccountForceRefresh(9);

    expect(invokeTauriOrNull).toHaveBeenCalledWith("oauth_accounts_list", {
      cliKey: "claude",
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("oauth_account_get", {
      id: 1,
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("oauth_start_login", {
      accountId: null,
      cliKey: "claude",
      providerType: "claude_oauth",
      label: "Work",
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("oauth_account_manual_add", {
      cliKey: "codex",
      label: "Manual",
      accessToken: "token",
      refreshToken: "refresh",
      idToken: "id-token",
      tokenUri: "https://token.example.com",
      expiresAt: 123,
      lastRefreshedAt: 456,
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("oauth_account_upsert", {
      accountId: 2,
      cliKey: "codex",
      label: "manual-2",
      email: null,
      providerType: "codex_oauth",
      accessToken: "token-next",
      refreshToken: "refresh-next",
      idToken: "id-next",
      tokenUri: "https://token-2.example.com",
      clientId: null,
      clientSecret: null,
      expiresAt: 999,
      lastRefreshedAt: 777,
      refreshLeadS: 1800,
      status: "active",
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("oauth_account_set_status", {
      id: 9,
      status: "disabled",
      error: "quota",
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("oauth_account_delete", { id: 9 });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("oauth_account_force_refresh", { id: 9 });
  });
});
