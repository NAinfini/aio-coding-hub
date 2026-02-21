import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useState } from "react";
import { SkillsView } from "../SkillsView";
import {
  useSkillImportLocalMutation,
  useSkillSetEnabledMutation,
  useSkillUninstallMutation,
  useSkillsInstalledListQuery,
  useSkillsLocalListQuery,
} from "../../../query/skills";
import { tauriOpenPath, tauriRevealItemInDir } from "../../../test/mocks/tauri";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("../../../services/consoleLog", () => ({ logToConsole: vi.fn() }));

vi.mock("../../../query/skills", async () => {
  const actual =
    await vi.importActual<typeof import("../../../query/skills")>("../../../query/skills");
  return {
    ...actual,
    useSkillsInstalledListQuery: vi.fn(),
    useSkillsLocalListQuery: vi.fn(),
    useSkillSetEnabledMutation: vi.fn(),
    useSkillUninstallMutation: vi.fn(),
    useSkillImportLocalMutation: vi.fn(),
  };
});

describe("pages/skills/SkillsView", () => {
  it("supports enabling/uninstalling installed skills and importing local skills", async () => {
    const installed = [
      {
        id: 1,
        name: "My Skill",
        description: "desc",
        enabled: false,
        source_git_url: "https://example.com/repo.git",
        source_branch: "main",
        source_subdir: "skills/my",
        updated_at: 123,
      },
    ] as any[];

    const localSkills = [
      { dir_name: "local-skill", name: "Local Skill", description: "d", path: "/tmp/local-skill" },
    ] as any[];

    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({
      data: installed,
      isFetching: false,
      error: null,
    } as any);
    vi.mocked(useSkillsLocalListQuery).mockReturnValue({
      data: localSkills,
      isFetching: false,
      error: null,
    } as any);

    const toggleMutation = { isPending: false, mutateAsync: vi.fn() };
    toggleMutation.mutateAsync.mockResolvedValue({ ...installed[0], enabled: true });
    vi.mocked(useSkillSetEnabledMutation).mockReturnValue(toggleMutation as any);

    const uninstallMutation = { isPending: false, mutateAsync: vi.fn(), variables: null };
    uninstallMutation.mutateAsync.mockResolvedValue(true);
    vi.mocked(useSkillUninstallMutation).mockReturnValue(uninstallMutation as any);

    const importMutation = { isPending: false, mutateAsync: vi.fn(), variables: null };
    importMutation.mutateAsync.mockResolvedValue({ id: 2 });
    vi.mocked(useSkillImportLocalMutation).mockReturnValue(importMutation as any);

    tauriOpenPath.mockRejectedValueOnce(new Error("no opener"));
    tauriRevealItemInDir.mockResolvedValueOnce(undefined as any);

    render(<SkillsView workspaceId={1} cliKey="claude" isActiveWorkspace />);

    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(toggleMutation.mutateAsync).toHaveBeenCalledWith({ skillId: 1, enabled: true })
    );

    fireEvent.click(screen.getByRole("button", { name: "卸载" }));
    const uninstallDialog = within(screen.getByRole("dialog"));
    fireEvent.click(uninstallDialog.getByRole("button", { name: "确认卸载" }));
    await waitFor(() => expect(uninstallMutation.mutateAsync).toHaveBeenCalledWith(1));

    const importButton = await screen.findByRole("button", { name: "导入技能库" });
    fireEvent.click(importButton);
    const importDialog = within(screen.getByRole("dialog"));
    fireEvent.click(importDialog.getByRole("button", { name: "确认导入" }));
    await waitFor(() => expect(importMutation.mutateAsync).toHaveBeenCalledWith("local-skill"));

    fireEvent.click(screen.getByRole("button", { name: "打开目录" }));
    await waitFor(() => expect(tauriRevealItemInDir).toHaveBeenCalledWith("/tmp/local-skill"));
  });

  it("supports refreshing local list", async () => {
    const localSkills = [
      { dir_name: "local-skill", name: "Local Skill", description: "d", path: "/tmp/local-skill" },
    ] as any[];
    const refetch = vi.fn().mockResolvedValue({ data: localSkills });

    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({
      data: [],
      isFetching: false,
      error: null,
    } as any);
    vi.mocked(useSkillsLocalListQuery).mockReturnValue({
      data: localSkills,
      isFetching: false,
      error: null,
      refetch,
    } as any);
    vi.mocked(useSkillSetEnabledMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);
    vi.mocked(useSkillUninstallMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
      variables: null,
    } as any);
    vi.mocked(useSkillImportLocalMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
      variables: null,
    } as any);

    render(<SkillsView workspaceId={1} cliKey="claude" isActiveWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it("renders read-only local section when workspace is not active", () => {
    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({
      data: [],
      isFetching: false,
      error: null,
    } as any);
    vi.mocked(useSkillsLocalListQuery).mockReturnValue({
      data: [],
      isFetching: false,
      error: null,
    } as any);
    vi.mocked(useSkillSetEnabledMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    } as any);
    vi.mocked(useSkillUninstallMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
      variables: null,
    } as any);
    vi.mocked(useSkillImportLocalMutation).mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
      variables: null,
    } as any);

    render(<SkillsView workspaceId={1} cliKey="gemini" isActiveWorkspace={false} />);
    expect(screen.getByText(/仅当前工作区可扫描\/导入本机 Skill/)).toBeInTheDocument();
  });

  it("covers tauri-only + error branches and import guard when workspace becomes inactive", async () => {
    const installed = [
      {
        id: 1,
        name: "S1",
        description: null,
        enabled: false,
        source_git_url: "https://example.com/repo.git",
        source_branch: "",
        source_subdir: "skills/s1",
        updated_at: 123,
      },
      {
        id: 2,
        name: "S2",
        description: "d",
        enabled: true,
        source_git_url: "https://example.com/repo2.git",
        source_branch: "main",
        source_subdir: "skills/s2",
        updated_at: 456,
      },
    ] as any[];

    const localSkills = [
      { dir_name: "local-skill", name: "", description: null, path: "/tmp/local-skill" },
    ] as any[];

    vi.mocked(useSkillsInstalledListQuery).mockReturnValue({
      data: installed,
      isFetching: false,
      error: null,
    } as any);
    vi.mocked(useSkillsLocalListQuery).mockReturnValue({
      data: localSkills,
      isFetching: false,
      error: null,
      refetch: vi.fn().mockResolvedValue({ data: localSkills }),
    } as any);

    const toggleMutation = { isPending: false, mutateAsync: vi.fn(), variables: null };
    toggleMutation.mutateAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...installed[1], enabled: false })
      .mockRejectedValueOnce(new Error("boom"));
    vi.mocked(useSkillSetEnabledMutation).mockReturnValue(toggleMutation as any);

    const uninstallMutation = { isPending: false, mutateAsync: vi.fn(), variables: null };
    uninstallMutation.mutateAsync
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("boom"));
    vi.mocked(useSkillUninstallMutation).mockReturnValue(uninstallMutation as any);

    const importMutation = { isPending: false, mutateAsync: vi.fn(), variables: null };
    importMutation.mutateAsync.mockResolvedValueOnce(null);
    vi.mocked(useSkillImportLocalMutation).mockReturnValue(importMutation as any);

    tauriOpenPath
      .mockResolvedValueOnce(undefined as any)
      .mockRejectedValueOnce(new Error("no opener"));
    tauriRevealItemInDir.mockRejectedValueOnce(new Error("reveal failed"));

    function Wrapper() {
      const [active, setActive] = useState(true);
      return (
        <div>
          <button type="button" onClick={() => setActive(false)}>
            deactivate
          </button>
          <SkillsView workspaceId={1} cliKey="claude" isActiveWorkspace={active} />
        </div>
      );
    }

    render(<Wrapper />);

    // toggle: tauri-only + disable + error branches
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    await waitFor(() => expect(toggleMutation.mutateAsync).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getAllByRole("switch")[1]!);
    await waitFor(() => expect(toggleMutation.mutateAsync).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getAllByRole("switch")[0]!);
    await waitFor(() => expect(toggleMutation.mutateAsync).toHaveBeenCalledTimes(3));

    // open dir: openPath success then reveal failure -> openLocalSkillDir catch
    fireEvent.click(screen.getByRole("button", { name: "打开目录" }));
    await waitFor(() => expect(tauriOpenPath).toHaveBeenCalledWith("/tmp/local-skill"));

    fireEvent.click(screen.getByRole("button", { name: "打开目录" }));
    await waitFor(() =>
      expect(vi.mocked(toast)).toHaveBeenCalledWith("打开目录失败：请查看控制台日志")
    );

    // uninstall: ok=false + error branches (dialog stays open on ok=false)
    fireEvent.click(screen.getAllByRole("button", { name: "卸载" })[0]!);
    const uninstallDialog = within(screen.getByRole("dialog"));
    fireEvent.click(uninstallDialog.getByRole("button", { name: "确认卸载" }));
    await waitFor(() => expect(uninstallMutation.mutateAsync).toHaveBeenCalledTimes(1));
    fireEvent.click(uninstallDialog.getByRole("button", { name: "确认卸载" }));
    await waitFor(() => expect(uninstallMutation.mutateAsync).toHaveBeenCalledTimes(2));
    fireEvent.click(uninstallDialog.getByRole("button", { name: "取消" }));

    // import: tauri-only null branch, then guard branch after becoming inactive
    const importButton = await screen.findByRole("button", { name: "导入技能库" });
    fireEvent.click(importButton);
    const importDialog = within(screen.getByRole("dialog"));
    fireEvent.click(importDialog.getByRole("button", { name: "确认导入" }));
    await waitFor(() => expect(importMutation.mutateAsync).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "deactivate", hidden: true }));
    fireEvent.click(importDialog.getByRole("button", { name: "确认导入" }));
    await waitFor(() =>
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.stringContaining("仅当前工作区可导入本机 Skill")
      )
    );
    expect(importMutation.mutateAsync).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByRole("button", { name: "刷新", hidden: true });
    expect(refreshButton).toBeDisabled();
  });
});
