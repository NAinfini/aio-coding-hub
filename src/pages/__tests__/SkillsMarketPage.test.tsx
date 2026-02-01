import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { SkillsMarketPage } from "../SkillsMarketPage";
import { createTestQueryClient } from "../../test/utils/reactQuery";
import { clearTauriRuntime, setTauriRuntime } from "../../test/utils/tauriRuntime";
import { logToConsole } from "../../services/consoleLog";
import { useWorkspacesListQuery } from "../../query/workspaces";
import {
  useSkillInstallMutation,
  useSkillRepoDeleteMutation,
  useSkillRepoUpsertMutation,
  useSkillReposListQuery,
  useSkillsDiscoverAvailableMutation,
  useSkillsDiscoverAvailableQuery,
  useSkillsInstalledListQuery,
} from "../../query/skills";

const navigateMock = vi.fn();

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../services/consoleLog", () => ({ logToConsole: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../query/workspaces", async () => {
  const actual =
    await vi.importActual<typeof import("../../query/workspaces")>("../../query/workspaces");
  return { ...actual, useWorkspacesListQuery: vi.fn() };
});

vi.mock("../../query/skills", async () => {
  const actual = await vi.importActual<typeof import("../../query/skills")>("../../query/skills");
  return {
    ...actual,
    useSkillReposListQuery: vi.fn(),
    useWorkspacesListQuery: vi.fn(),
    useSkillsInstalledListQuery: vi.fn(),
    useSkillsDiscoverAvailableQuery: vi.fn(),
    useSkillsDiscoverAvailableMutation: vi.fn(),
    useSkillRepoUpsertMutation: vi.fn(),
    useSkillRepoDeleteMutation: vi.fn(),
    useSkillInstallMutation: vi.fn(),
  };
});

function renderWithProviders(element: ReactElement) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

function getDialogByTitle(title: string): HTMLElement {
  const dialogs = screen.getAllByRole("dialog");
  const match = dialogs.find((dialog) => dialog.textContent?.includes(title));
  if (!match) throw new Error(`Dialog not found: ${title}`);
  return match;
}

describe("pages/SkillsMarketPage", () => {
  it("validates and saves repo in the repo dialog", async () => {
    setTauriRuntime();
    navigateMock.mockClear();

    vi.mocked(useSkillReposListQuery).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: 1 },
      isLoading: false,
    } as any);
    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useSkillsDiscoverAvailableQuery).mockReturnValue({
      data: [],
      isFetching: false,
    } as any);

    vi.mocked(useSkillsDiscoverAvailableMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue([]),
    } as any);

    const upsert = { mutateAsync: vi.fn(), isPending: false };
    upsert.mutateAsync.mockResolvedValue({
      id: 1,
      git_url: "https://github.com/acme/skills",
      branch: "main",
      enabled: true,
      created_at: 1,
      updated_at: 2,
    });
    vi.mocked(useSkillRepoUpsertMutation).mockReturnValue(upsert as any);
    vi.mocked(useSkillRepoDeleteMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);
    vi.mocked(useSkillInstallMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);

    renderWithProviders(<SkillsMarketPage />);

    fireEvent.click(screen.getByRole("button", { name: "管理仓库" }));
    expect(screen.getByText("Skill 仓库")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "添加仓库" }));
    expect(toast).toHaveBeenCalledWith("请填写 Git URL");

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/acme/skills" },
    });
    fireEvent.change(screen.getByPlaceholderText("auto / main / master"), {
      target: { value: "main" },
    });

    fireEvent.click(screen.getByRole("button", { name: "添加仓库" }));

    await waitFor(() => {
      expect(upsert.mutateAsync).toHaveBeenCalledWith({
        repoId: null,
        gitUrl: "https://github.com/acme/skills",
        branch: "main",
        enabled: true,
      });
    });
    expect(toast).toHaveBeenCalledWith("仓库已添加");
  });

  it("refreshes discover list and allows installing a skill, or navigates to enable", async () => {
    setTauriRuntime();
    navigateMock.mockClear();

    vi.mocked(useSkillReposListQuery).mockReturnValue({
      data: [
        {
          id: 1,
          git_url: "https://github.com/acme/skills",
          branch: "main",
          enabled: true,
          created_at: 1,
          updated_at: 2,
        },
      ],
      isLoading: false,
    } as any);

    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: 7 },
      isLoading: false,
    } as any);

    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({
      data: [
        {
          id: 101,
          skill_key: "k1",
          name: "Bar",
          description: "",
          source_git_url: "https://github.com/acme/skills",
          source_branch: "main",
          source_subdir: "bar",
          enabled: false,
          created_at: 1,
          updated_at: 1,
        },
        {
          id: 102,
          skill_key: "k2",
          name: "Baz",
          description: "",
          source_git_url: "https://github.com/acme/skills",
          source_branch: "main",
          source_subdir: "baz",
          enabled: true,
          created_at: 1,
          updated_at: 1,
        },
      ],
      isLoading: false,
    } as any);

    vi.mocked(useSkillsDiscoverAvailableQuery).mockReturnValue({
      data: [
        {
          name: "Foo",
          description: "Foo desc",
          source_git_url: "https://github.com/acme/skills",
          source_branch: "main",
          source_subdir: "foo",
          installed: false,
        },
        {
          name: "Bar",
          description: "",
          source_git_url: "https://github.com/acme/skills",
          source_branch: "main",
          source_subdir: "bar",
          installed: true,
        },
        {
          name: "Baz",
          description: "",
          source_git_url: "https://github.com/acme/skills",
          source_branch: "main",
          source_subdir: "baz",
          installed: true,
        },
      ],
      isFetching: false,
    } as any);

    const discover = { isPending: false, mutateAsync: vi.fn() };
    discover.mutateAsync.mockResolvedValue([{ name: "Foo" }, { name: "Bar" }]);
    vi.mocked(useSkillsDiscoverAvailableMutation).mockReturnValue(discover as any);

    const install = { mutateAsync: vi.fn() };
    install.mutateAsync.mockResolvedValue({
      id: 999,
      skill_key: "k999",
      name: "Foo",
      description: "",
      source_git_url: "https://github.com/acme/skills",
      source_branch: "main",
      source_subdir: "foo",
      enabled: true,
      created_at: 1,
      updated_at: 1,
    });
    vi.mocked(useSkillInstallMutation).mockReturnValue(install as any);

    vi.mocked(useSkillRepoUpsertMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);
    vi.mocked(useSkillRepoDeleteMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);

    renderWithProviders(<SkillsMarketPage />);

    fireEvent.click(screen.getByRole("button", { name: "刷新发现" }));
    await waitFor(() => {
      expect(discover.mutateAsync).toHaveBeenCalledWith(true);
    });
    expect(logToConsole).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("已发现 2 个 Skill");

    // actionable list hides enabled items by default; toggle to show them
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Baz")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "安装到 Claude Code" }));
    await waitFor(() => {
      expect(install.mutateAsync).toHaveBeenCalledWith({
        gitUrl: "https://github.com/acme/skills",
        branch: "main",
        sourceSubdir: "foo",
        enabled: true,
      });
    });
    expect(toast).toHaveBeenCalledWith("安装成功");

    fireEvent.click(screen.getByRole("button", { name: "去启用" }));
    expect(navigateMock).toHaveBeenCalledWith("/skills");
  });

  it("supports search/filter/sort and clearing query (including git@ urls and empty branch)", () => {
    setTauriRuntime();
    navigateMock.mockClear();

    vi.mocked(useSkillReposListQuery).mockReturnValue({
      data: [
        {
          id: 1,
          git_url: "https://github.com/acme/skills",
          branch: "main",
          enabled: true,
          created_at: 1,
          updated_at: 2,
        },
      ],
      isLoading: false,
    } as any);
    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: 7 },
      isLoading: false,
    } as any);
    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useSkillsDiscoverAvailableQuery).mockReturnValue({
      data: [
        {
          name: "Alpha",
          description: "",
          source_git_url: "git@github.com:acme/skills.git",
          source_branch: "main",
          source_subdir: "alpha",
          installed: false,
        },
        {
          name: "Beta",
          description: "",
          source_git_url: "https://github.com/acme/skills",
          source_branch: "",
          source_subdir: "beta",
          installed: false,
        },
        {
          name: "EmptyUrl",
          description: "",
          source_git_url: "",
          source_branch: "main",
          source_subdir: "empty",
          installed: false,
        },
      ],
      isFetching: false,
    } as any);

    vi.mocked(useSkillsDiscoverAvailableMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue([]),
    } as any);

    vi.mocked(useSkillRepoUpsertMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);
    vi.mocked(useSkillRepoDeleteMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);
    vi.mocked(useSkillInstallMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);

    renderWithProviders(<SkillsMarketPage />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();

    const queryInput = screen.getByPlaceholderText("搜索 Skill（名称/描述/仓库/目录）");
    fireEvent.change(queryInput, { target: { value: "zzz" } });
    expect(screen.getByText(/没有匹配结果/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(screen.getByText("Alpha")).toBeInTheDocument();

    const [repoFilterSelect, sortSelect] = screen.getAllByRole("combobox");
    fireEvent.change(sortSelect, { target: { value: "name" } });
    fireEvent.change(sortSelect, { target: { value: "repo" } });

    fireEvent.change(repoFilterSelect, {
      target: { value: "https://github.com/acme/skills#" },
    });
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("handles repo toggle and delete flows (including pending gating + formatUnixSeconds fallback)", async () => {
    setTauriRuntime();
    navigateMock.mockClear();

    const repos = [
      {
        id: 1,
        git_url: "git@github.com:acme/skills.git",
        branch: "main",
        enabled: true,
        created_at: 1,
        updated_at: 2,
      },
      {
        id: 2,
        git_url: "https://github.com/acme/skills",
        branch: "dev",
        enabled: false,
        created_at: 1,
        updated_at: 3,
      },
    ];

    vi.mocked(useSkillReposListQuery).mockReturnValue({ data: repos, isLoading: false } as any);
    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: 7 },
      isLoading: false,
    } as any);
    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useSkillsDiscoverAvailableQuery).mockReturnValue({
      data: [],
      isFetching: false,
    } as any);
    vi.mocked(useSkillsDiscoverAvailableMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue([]),
    } as any);

    let resolveUpsert!: (value: unknown) => void;
    const upsertPromise = new Promise((resolve) => {
      resolveUpsert = resolve;
    });
    const repoUpsert = { isPending: false, mutateAsync: vi.fn().mockReturnValue(upsertPromise) };
    vi.mocked(useSkillRepoUpsertMutation).mockReturnValue(repoUpsert as any);

    const repoDelete = { mutateAsync: vi.fn() };
    repoDelete.mutateAsync.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.mocked(useSkillRepoDeleteMutation).mockReturnValue(repoDelete as any);
    vi.mocked(useSkillInstallMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);

    const localeSpy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => {
      throw new Error("boom");
    });

    renderWithProviders(<SkillsMarketPage />);

    fireEvent.click(screen.getByRole("button", { name: "管理仓库" }));
    const repoDialog = getDialogByTitle("Skill 仓库");

    // formatUnixSeconds fallback branch
    expect(repoDialog.textContent).toContain("更新 2");

    const repoSwitches = within(repoDialog).getAllByRole("switch");
    fireEvent.click(repoSwitches[0]);
    fireEvent.click(repoSwitches[1]);
    expect(repoUpsert.mutateAsync).toHaveBeenCalledTimes(1);
    expect(repoUpsert.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: 1,
        gitUrl: "git@github.com:acme/skills.git",
        branch: "main",
      })
    );

    resolveUpsert(null);
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用");
    });

    // delete repo: first attempt returns false (toast), second succeeds
    const deleteButtons = within(repoDialog).getAllByRole("button", { name: "删除" });
    fireEvent.click(deleteButtons[0]);
    const deleteDialog = getDialogByTitle("删除仓库");

    fireEvent.click(within(deleteDialog).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(repoDelete.mutateAsync).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用");

    fireEvent.click(within(deleteDialog).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(repoDelete.mutateAsync).toHaveBeenCalledTimes(2));
    expect(toast).toHaveBeenCalledWith("仓库已删除");

    localeSpy.mockRestore();
  });

  it("covers refresh/install null + error + tauri-only branches and localStorage failures", async () => {
    clearTauriRuntime();
    navigateMock.mockClear();

    const getItemSpy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("boom");
    });
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("boom");
    });

    vi.mocked(useSkillReposListQuery).mockReturnValue({
      data: [
        {
          id: 1,
          git_url: "https://github.com/acme/skills",
          branch: "main",
          enabled: true,
          created_at: 1,
          updated_at: 2,
        },
      ],
      isLoading: false,
    } as any);
    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: null },
      isLoading: false,
    } as any);
    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useSkillsDiscoverAvailableQuery).mockReturnValue({
      data: [
        {
          name: "Foo",
          description: "",
          source_git_url: "https://github.com/acme/skills",
          source_branch: "main",
          source_subdir: "foo",
          installed: false,
        },
      ],
      isFetching: false,
    } as any);

    const discover = { isPending: false, mutateAsync: vi.fn() };
    discover.mutateAsync.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(useSkillsDiscoverAvailableMutation).mockReturnValue(discover as any);

    const install = { mutateAsync: vi.fn() };
    install.mutateAsync.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(useSkillInstallMutation).mockReturnValue(install as any);

    vi.mocked(useSkillRepoUpsertMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);
    vi.mocked(useSkillRepoDeleteMutation).mockReturnValue({ mutateAsync: vi.fn() } as any);

    const phase1 = renderWithProviders(<SkillsMarketPage />);

    fireEvent.click(screen.getByRole("button", { name: "刷新发现" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));

    fireEvent.click(screen.getByRole("button", { name: "刷新发现" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "安装到 Claude Code" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "未找到当前工作区（workspace）。请先在 Workspaces 页面创建并设为当前。"
      )
    );

    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: 7 },
      isLoading: false,
    } as any);

    // writeCliToStorage catches localStorage.setItem failures
    fireEvent.click(screen.getByRole("tab", { name: "Codex" }));

    // with workspace present but no tauri runtime -> toast and return
    fireEvent.click(screen.getByRole("button", { name: "安装到 Codex" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));

    phase1.unmount();
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();

    // phase2: tauri runtime + workspace present => exercise install null + error branches
    try {
      window.localStorage.removeItem("skills.activeCli");
    } catch {}
    setTauriRuntime();
    vi.mocked(toast).mockClear();
    vi.mocked(useWorkspacesListQuery).mockReturnValue({
      data: { active_id: 7 },
      isLoading: false,
    } as any);

    renderWithProviders(<SkillsMarketPage />);

    fireEvent.click(screen.getByRole("button", { name: "安装到 Claude Code" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("仅在 Tauri Desktop 环境可用"));

    fireEvent.click(screen.getByRole("button", { name: "安装到 Claude Code" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
  });
});
