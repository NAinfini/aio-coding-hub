import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OAuthAccountsView } from "../OAuthAccountsView";
import {
  useOAuthAccountDeleteMutation,
  useOAuthAccountForceRefreshMutation,
  useOAuthAccountManualAddMutation,
  useOAuthAccountSetStatusMutation,
  useOAuthAccountUpsertMutation,
  useOAuthAccountsEventBridge,
  useOAuthAccountsListQuery,
  useOAuthStartLoginMutation,
} from "../../../query/oauthAccounts";

vi.mock("../../../query/oauthAccounts", async () => {
  const actual = await vi.importActual<typeof import("../../../query/oauthAccounts")>(
    "../../../query/oauthAccounts"
  );
  return {
    ...actual,
    useOAuthAccountsListQuery: vi.fn(),
    useOAuthStartLoginMutation: vi.fn(),
    useOAuthAccountManualAddMutation: vi.fn(),
    useOAuthAccountSetStatusMutation: vi.fn(),
    useOAuthAccountUpsertMutation: vi.fn(),
    useOAuthAccountForceRefreshMutation: vi.fn(),
    useOAuthAccountDeleteMutation: vi.fn(),
    useOAuthAccountsEventBridge: vi.fn(),
  };
});

function mockMutations() {
  const startLogin = {
    mutateAsync: vi.fn(),
    isPending: false,
  };
  const manualAdd = {
    mutateAsync: vi.fn(),
    isPending: false,
  };
  const setStatus = {
    mutateAsync: vi.fn(),
    isPending: false,
  };
  const upsert = {
    mutateAsync: vi.fn(),
    isPending: false,
  };
  const forceRefresh = {
    mutateAsync: vi.fn(),
    isPending: false,
  };
  const remove = {
    mutateAsync: vi.fn(),
    isPending: false,
  };

  vi.mocked(useOAuthStartLoginMutation).mockReturnValue(startLogin as any);
  vi.mocked(useOAuthAccountManualAddMutation).mockReturnValue(manualAdd as any);
  vi.mocked(useOAuthAccountSetStatusMutation).mockReturnValue(setStatus as any);
  vi.mocked(useOAuthAccountUpsertMutation).mockReturnValue(upsert as any);
  vi.mocked(useOAuthAccountForceRefreshMutation).mockReturnValue(forceRefresh as any);
  vi.mocked(useOAuthAccountDeleteMutation).mockReturnValue(remove as any);
  vi.mocked(useOAuthAccountsEventBridge).mockReturnValue({} as any);

  return { startLogin, manualAdd, setStatus, upsert, forceRefresh, remove };
}

describe("pages/providers/OAuthAccountsView", () => {
  it("renders CLI tab buttons and calls setActiveCli on click", () => {
    mockMutations();
    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [],
      isFetching: false,
    } as any);

    const setActiveCli = vi.fn();
    render(<OAuthAccountsView activeCli="claude" setActiveCli={setActiveCli} />);

    expect(screen.getByRole("button", { name: "Claude Code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Codex" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gemini" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Codex" }));
    expect(setActiveCli).toHaveBeenCalledWith("codex");
  });

  it("renders account list with status badges", () => {
    mockMutations();
    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [
        {
          id: 1,
          cli_key: "claude",
          label: "Primary",
          email: "primary@example.com",
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
        {
          id: 2,
          cli_key: "claude",
          label: "Backup",
          email: null,
          provider_type: "claude_oauth",
          expires_at: null,
          refresh_lead_s: 3600,
          status: "quota_cooldown",
          last_error: null,
          last_refreshed_at: null,
          quota_exceeded: true,
          quota_recover_at: null,
          created_at: 0,
          updated_at: 0,
        },
      ],
      isFetching: false,
    } as any);

    render(<OAuthAccountsView activeCli="claude" setActiveCli={vi.fn()} />);

    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("primary@example.com")).toBeInTheDocument();
    expect(screen.getByText("Backup")).toBeInTheDocument();
    expect(screen.getByText("可用")).toBeInTheDocument();
    expect(screen.getByText("限额冷却")).toBeInTheDocument();
  });

  it("shows loading spinner when fetching with no data", () => {
    mockMutations();
    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: undefined,
      isFetching: true,
    } as any);

    render(<OAuthAccountsView activeCli="claude" setActiveCli={vi.fn()} />);

    expect(screen.getByText("加载中…")).toBeInTheDocument();
  });

  it("shows empty state when no accounts exist", () => {
    mockMutations();
    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [],
      isFetching: false,
    } as any);

    render(<OAuthAccountsView activeCli="claude" setActiveCli={vi.fn()} />);

    expect(screen.getByText("暂无 OAuth 账号。")).toBeInTheDocument();
  });

  it("shows add oauth button and opens add form in dialog", () => {
    mockMutations();
    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [],
      isFetching: false,
    } as any);

    render(<OAuthAccountsView activeCli="claude" setActiveCli={vi.fn()} />);

    expect(screen.getByRole("button", { name: "添加 OAuth" })).toBeInTheDocument();
    expect(screen.getByText("账号列表")).toBeInTheDocument();
    expect(screen.queryByText("浏览器登录添加")).not.toBeInTheDocument();
    expect(screen.queryByText("手动添加")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "添加 OAuth" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("浏览器登录添加")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "手动添加" })).toBeInTheDocument();
    expect(dialog.getByPlaceholderText("access_token")).toBeInTheDocument();
  });

  it("closes add dialog after successful manual add", async () => {
    const { manualAdd } = mockMutations();
    manualAdd.mutateAsync.mockResolvedValue({
      id: 9,
      cli_key: "claude",
      label: "Manual",
      status: "active",
    });
    vi.mocked(useOAuthAccountsListQuery).mockReturnValue({
      data: [],
      isFetching: false,
    } as any);

    render(<OAuthAccountsView activeCli="claude" setActiveCli={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "添加 OAuth" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByPlaceholderText("账号标签"), { target: { value: "Manual" } });
    fireEvent.change(dialog.getByPlaceholderText("access_token"), {
      target: { value: "token-1" },
    });
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
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
