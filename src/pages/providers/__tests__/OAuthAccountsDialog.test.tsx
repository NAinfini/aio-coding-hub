import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { OAuthAccountsDialog } from "../OAuthAccountsDialog";
import {
  useOAuthAccountDeleteMutation,
  useOAuthAccountForceRefreshMutation,
  useOAuthAccountManualAddMutation,
  useOAuthAccountUpsertMutation,
  useOAuthAccountsEventBridge,
  useOAuthAccountsListQuery,
  useOAuthStartLoginMutation,
} from "../../../query/oauthAccounts";

vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("../../../query/oauthAccounts", async () => {
  const actual = await vi.importActual<typeof import("../../../query/oauthAccounts")>(
    "../../../query/oauthAccounts"
  );
  return {
    ...actual,
    useOAuthAccountsListQuery: vi.fn(),
    useOAuthStartLoginMutation: vi.fn(),
    useOAuthAccountManualAddMutation: vi.fn(),
    useOAuthAccountUpsertMutation: vi.fn(),
    useOAuthAccountForceRefreshMutation: vi.fn(),
    useOAuthAccountDeleteMutation: vi.fn(),
    useOAuthAccountsEventBridge: vi.fn(),
  };
});

function mockMutations() {
  const startLogin = { mutateAsync: vi.fn(), isPending: false };
  const manualAdd = { mutateAsync: vi.fn(), isPending: false };
  const upsert = { mutateAsync: vi.fn(), isPending: false };
  const forceRefresh = { mutateAsync: vi.fn(), isPending: false };
  const remove = { mutateAsync: vi.fn(), isPending: false };

  vi.mocked(useOAuthStartLoginMutation).mockReturnValue(startLogin as any);
  vi.mocked(useOAuthAccountManualAddMutation).mockReturnValue(manualAdd as any);
  vi.mocked(useOAuthAccountUpsertMutation).mockReturnValue(upsert as any);
  vi.mocked(useOAuthAccountForceRefreshMutation).mockReturnValue(forceRefresh as any);
  vi.mocked(useOAuthAccountDeleteMutation).mockReturnValue(remove as any);
  vi.mocked(useOAuthAccountsEventBridge).mockReturnValue({} as any);

  return { startLogin, manualAdd, upsert, forceRefresh, remove };
}

describe("pages/providers/OAuthAccountsDialog", () => {
  it("renders account list and status text", () => {
    mockMutations();
    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [
        {
          id: 7,
          cli_key: "claude",
          label: "Work",
          email: "work@example.com",
          provider_type: "claude_oauth",
          expires_at: null,
          refresh_lead_s: 3600,
          status: "active",
          last_error: null,
          last_refreshed_at: null,
          quota_exceeded: false,
          quota_recover_at: null,
          created_at: 0,
          updated_at: 0,
        },
      ],
      isFetching: false,
    } as any);

    render(<OAuthAccountsDialog open={true} onOpenChange={vi.fn()} cliKey="claude" />);

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("账号列表")).toBeInTheDocument();
    expect(dialog.getByText("Work")).toBeInTheDocument();
    expect(dialog.getByText("work@example.com")).toBeInTheDocument();
    expect(dialog.getByText("可用")).toBeInTheDocument();
    expect(dialog.getByText("正常")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(dialog.getByText("⠿")).toBeInTheDocument();
  });

  it("validates login/manual fields before submit", async () => {
    mockMutations();
    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [],
      isFetching: false,
    } as any);

    render(<OAuthAccountsDialog open={true} onOpenChange={vi.fn()} cliKey="claude" />);
    const dialog = within(screen.getByRole("dialog"));

    fireEvent.click(dialog.getByRole("button", { name: "OAuth 登录添加" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith("请输入账号标签");

    fireEvent.change(dialog.getByPlaceholderText("账号标签"), { target: { value: "Manual" } });
    fireEvent.click(dialog.getByRole("button", { name: "手动添加" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith("手动添加需要 Access Token");

    fireEvent.change(dialog.getByPlaceholderText("access_token"), { target: { value: "token-1" } });
    fireEvent.change(dialog.getByPlaceholderText("expired（ISO/时间戳，可选）"), {
      target: { value: "-1" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "手动添加" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith("过期时间戳必须为正整数");

    fireEvent.change(dialog.getByPlaceholderText("expired（ISO/时间戳，可选）"), {
      target: { value: "" },
    });
    fireEvent.change(dialog.getByPlaceholderText("last_refresh（ISO/时间戳，可选）"), {
      target: { value: "not-a-time" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "手动添加" }));
    expect(vi.mocked(toast)).toHaveBeenCalledWith("last_refresh 必须是 Unix 秒级时间戳或 ISO 时间");
  });

  it("supports add/edit/refresh/delete actions", async () => {
    const { startLogin, manualAdd, upsert, forceRefresh, remove } = mockMutations();

    startLogin.mutateAsync.mockResolvedValue({
      id: 9,
      cli_key: "claude",
      label: "Work",
      status: "active",
    });
    manualAdd.mutateAsync.mockResolvedValue({
      id: 10,
      cli_key: "claude",
      label: "Manual",
      status: "active",
    });
    upsert.mutateAsync.mockResolvedValue({
      id: 7,
      cli_key: "claude",
      label: "Work Updated",
      status: "active",
    });
    forceRefresh.mutateAsync.mockResolvedValue({
      id: 7,
      cli_key: "claude",
      label: "Work",
      status: "active",
    });
    remove.mutateAsync.mockResolvedValue(true);

    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [
        {
          id: 7,
          cli_key: "claude",
          label: "Work",
          email: null,
          provider_type: "claude_oauth",
          expires_at: null,
          refresh_lead_s: 3600,
          status: "active",
          last_error: null,
          last_refreshed_at: null,
          quota_exceeded: false,
          quota_recover_at: null,
          created_at: 0,
          updated_at: 0,
        },
      ],
      isFetching: false,
    } as any);

    render(<OAuthAccountsDialog open={true} onOpenChange={vi.fn()} cliKey="claude" />);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByText("无邮箱")).not.toBeInTheDocument();

    fireEvent.change(dialog.getByPlaceholderText("例如：Work Gmail"), {
      target: { value: "Work" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "OAuth 登录添加" }));
    await waitFor(() =>
      expect(startLogin.mutateAsync).toHaveBeenCalledWith({ cliKey: "claude", label: "Work" })
    );

    fireEvent.change(dialog.getByPlaceholderText("账号标签"), { target: { value: "Manual" } });
    fireEvent.change(dialog.getByPlaceholderText("access_token"), { target: { value: "token-1" } });
    fireEvent.click(dialog.getByRole("button", { name: "手动添加" }));
    await waitFor(() =>
      expect(manualAdd.mutateAsync).toHaveBeenCalledWith({
        cliKey: "claude",
        label: "Manual",
        accessToken: "token-1",
        refreshToken: null,
        idToken: null,
        tokenUri: null,
        expiresAt: null,
        lastRefreshedAt: null,
      })
    );

    fireEvent.click(dialog.getByRole("button", { name: "编辑" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "保存修改" })).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText("access_token（留空不修改）"), {
      target: { value: "token-updated" },
    });
    fireEvent.change(screen.getByPlaceholderText("编辑 last_refresh（ISO/时间戳，可选）"), {
      target: { value: "1740000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() =>
      expect(upsert.mutateAsync).toHaveBeenCalledWith({
        accountId: 7,
        cliKey: "claude",
        providerType: "claude_oauth",
        label: "Work",
        accessToken: "token-updated",
        refreshToken: null,
        idToken: null,
        tokenUri: null,
        expiresAt: null,
        lastRefreshedAt: 1740000000,
        refreshLeadSeconds: 3600,
        status: "active",
      })
    );

    fireEvent.click(dialog.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(forceRefresh.mutateAsync).toHaveBeenCalledWith({ id: 7 }));

    fireEvent.click(dialog.getByRole("button", { name: "浏览器登录" }));
    await waitFor(() =>
      expect(startLogin.mutateAsync).toHaveBeenCalledWith({
        accountId: 7,
        cliKey: "claude",
        label: "Work",
        providerType: "claude_oauth",
      })
    );

    fireEvent.click(dialog.getByRole("button", { name: "删除" }));
    await waitFor(() =>
      expect(remove.mutateAsync).toHaveBeenCalledWith({ cliKey: "claude", id: 7 })
    );
  });

  it("maps gemini oauth_creds expiry_date milliseconds to expiresAt seconds", async () => {
    const { manualAdd } = mockMutations();
    manualAdd.mutateAsync.mockResolvedValue({
      id: 11,
      cli_key: "gemini",
      label: "Gemini Manual",
      status: "active",
    });

    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [],
      isFetching: false,
    } as any);

    render(<OAuthAccountsDialog open={true} onOpenChange={vi.fn()} cliKey="gemini" />);
    const dialog = within(screen.getByRole("dialog"));

    expect(dialog.getByPlaceholderText("expiry_date（毫秒/秒/ISO，可选）")).toBeInTheDocument();
    expect(
      dialog.queryByPlaceholderText("last_refresh（ISO/时间戳，可选）")
    ).not.toBeInTheDocument();

    fireEvent.change(dialog.getByPlaceholderText("账号标签"), {
      target: { value: "Gemini Manual" },
    });
    fireEvent.change(dialog.getByPlaceholderText("access_token"), {
      target: { value: "ya29.token" },
    });
    fireEvent.change(dialog.getByPlaceholderText("expiry_date（毫秒/秒/ISO，可选）"), {
      target: { value: "1772819732000" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "手动添加" }));

    await waitFor(() =>
      expect(manualAdd.mutateAsync).toHaveBeenCalledWith({
        cliKey: "gemini",
        label: "Gemini Manual",
        accessToken: "ya29.token",
        refreshToken: null,
        idToken: null,
        tokenUri: null,
        expiresAt: 1772819732,
        lastRefreshedAt: null,
      })
    );
  });

  it("allows saving edit dialog with all optional fields empty", async () => {
    const { upsert } = mockMutations();
    upsert.mutateAsync.mockResolvedValue({
      id: 7,
      cli_key: "claude",
      label: "Work",
      status: "active",
    });

    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [
        {
          id: 7,
          cli_key: "claude",
          label: "Work",
          email: null,
          provider_type: "claude_oauth",
          expires_at: 1772819732,
          refresh_lead_s: 3600,
          status: "active",
          last_error: null,
          last_refreshed_at: 1740000000,
          quota_exceeded: false,
          quota_recover_at: null,
          created_at: 0,
          updated_at: 0,
        },
      ],
      isFetching: false,
    } as any);

    render(<OAuthAccountsDialog open={true} onOpenChange={vi.fn()} cliKey="claude" />);
    const dialog = within(screen.getByRole("dialog"));

    fireEvent.click(dialog.getByRole("button", { name: "编辑" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "保存修改" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() =>
      expect(upsert.mutateAsync).toHaveBeenCalledWith({
        accountId: 7,
        cliKey: "claude",
        providerType: "claude_oauth",
        label: "Work",
        accessToken: null,
        refreshToken: null,
        idToken: null,
        tokenUri: null,
        expiresAt: null,
        lastRefreshedAt: null,
        refreshLeadSeconds: 3600,
        status: "active",
      })
    );
    expect(vi.mocked(toast)).not.toHaveBeenCalledWith("过期时间戳必须为正整数");
    expect(vi.mocked(toast)).not.toHaveBeenCalledWith(
      "last_refresh 必须是 Unix 秒级时间戳或 ISO 时间"
    );
  });
});
