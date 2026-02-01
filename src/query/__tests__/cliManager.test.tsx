import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  cliManagerClaudeInfoGet,
  cliManagerClaudeSettingsGet,
  cliManagerClaudeSettingsSet,
  cliManagerCodexConfigGet,
  cliManagerCodexConfigSet,
  cliManagerCodexInfoGet,
  cliManagerGeminiInfoGet,
} from "../../services/cliManager";
import { createQueryWrapper, createTestQueryClient } from "../../test/utils/reactQuery";
import { setTauriRuntime } from "../../test/utils/tauriRuntime";
import { cliManagerKeys } from "../keys";
import {
  pickCliAvailable,
  useCliManagerClaudeInfoQuery,
  useCliManagerClaudeSettingsQuery,
  useCliManagerClaudeSettingsSetMutation,
  useCliManagerCodexConfigQuery,
  useCliManagerCodexConfigSetMutation,
  useCliManagerCodexInfoQuery,
  useCliManagerGeminiInfoQuery,
} from "../cliManager";

vi.mock("../../services/cliManager", async () => {
  const actual = await vi.importActual<typeof import("../../services/cliManager")>(
    "../../services/cliManager"
  );
  return {
    ...actual,
    cliManagerClaudeInfoGet: vi.fn(),
    cliManagerClaudeSettingsGet: vi.fn(),
    cliManagerClaudeSettingsSet: vi.fn(),
    cliManagerCodexInfoGet: vi.fn(),
    cliManagerCodexConfigGet: vi.fn(),
    cliManagerCodexConfigSet: vi.fn(),
    cliManagerGeminiInfoGet: vi.fn(),
  };
});

describe("query/cliManager", () => {
  it("does not call cliManager queries without tauri runtime", async () => {
    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useCliManagerClaudeInfoQuery(), { wrapper });
    renderHook(() => useCliManagerClaudeSettingsQuery(), { wrapper });
    renderHook(() => useCliManagerCodexInfoQuery(), { wrapper });
    renderHook(() => useCliManagerCodexConfigQuery(), { wrapper });
    renderHook(() => useCliManagerGeminiInfoQuery(), { wrapper });

    await Promise.resolve();

    expect(cliManagerClaudeInfoGet).not.toHaveBeenCalled();
    expect(cliManagerClaudeSettingsGet).not.toHaveBeenCalled();
    expect(cliManagerCodexInfoGet).not.toHaveBeenCalled();
    expect(cliManagerCodexConfigGet).not.toHaveBeenCalled();
    expect(cliManagerGeminiInfoGet).not.toHaveBeenCalled();
  });

  it("calls cliManager queries with tauri runtime", async () => {
    setTauriRuntime();

    vi.mocked(cliManagerClaudeInfoGet).mockResolvedValue({ found: true } as any);
    vi.mocked(cliManagerClaudeSettingsGet).mockResolvedValue({ exists: true } as any);
    vi.mocked(cliManagerCodexInfoGet).mockResolvedValue({ found: true } as any);
    vi.mocked(cliManagerCodexConfigGet).mockResolvedValue({ exists: true } as any);
    vi.mocked(cliManagerGeminiInfoGet).mockResolvedValue({ found: true } as any);

    const client = createTestQueryClient();
    const wrapper = createQueryWrapper(client);

    renderHook(() => useCliManagerClaudeInfoQuery(), { wrapper });
    renderHook(() => useCliManagerClaudeSettingsQuery(), { wrapper });
    renderHook(() => useCliManagerCodexInfoQuery(), { wrapper });
    renderHook(() => useCliManagerCodexConfigQuery(), { wrapper });
    renderHook(() => useCliManagerGeminiInfoQuery(), { wrapper });

    await waitFor(() => {
      expect(cliManagerClaudeInfoGet).toHaveBeenCalled();
      expect(cliManagerClaudeSettingsGet).toHaveBeenCalled();
      expect(cliManagerCodexInfoGet).toHaveBeenCalled();
      expect(cliManagerCodexConfigGet).toHaveBeenCalled();
      expect(cliManagerGeminiInfoGet).toHaveBeenCalled();
    });
  });

  it("useCliManagerClaudeSettingsSetMutation updates cache and invalidates", async () => {
    setTauriRuntime();

    const updated = { exists: true, model: "claude" } as any;
    vi.mocked(cliManagerClaudeSettingsSet).mockResolvedValue(updated);

    const client = createTestQueryClient();
    client.setQueryData(cliManagerKeys.claudeSettings(), { exists: true, model: "old" });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useCliManagerClaudeSettingsSetMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ model: "claude" });
    });

    expect(client.getQueryData(cliManagerKeys.claudeSettings())).toEqual(updated);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cliManagerKeys.claudeSettings() });
  });

  it("useCliManagerCodexConfigSetMutation updates cache and invalidates", async () => {
    setTauriRuntime();

    const updated = { exists: true, model: "gpt-5" } as any;
    vi.mocked(cliManagerCodexConfigSet).mockResolvedValue(updated);

    const client = createTestQueryClient();
    client.setQueryData(cliManagerKeys.codexConfig(), { exists: true, model: "old" });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = createQueryWrapper(client);

    const { result } = renderHook(() => useCliManagerCodexConfigSetMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ model: "gpt-5" });
    });

    expect(client.getQueryData(cliManagerKeys.codexConfig())).toEqual(updated);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: cliManagerKeys.codexConfig() });
  });

  it("pickCliAvailable maps info to availability state", () => {
    expect(pickCliAvailable(null)).toBe("unavailable");
    expect(pickCliAvailable({ found: false } as any)).toBe("unavailable");
    expect(pickCliAvailable({ found: true } as any)).toBe("available");
  });
});
