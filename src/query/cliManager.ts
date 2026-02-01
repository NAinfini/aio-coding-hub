import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cliManagerClaudeInfoGet,
  cliManagerClaudeSettingsGet,
  cliManagerClaudeSettingsSet,
  cliManagerCodexConfigGet,
  cliManagerCodexConfigSet,
  cliManagerCodexInfoGet,
  cliManagerGeminiInfoGet,
  type ClaudeCliInfo,
  type ClaudeSettingsPatch,
  type ClaudeSettingsState,
  type CodexConfigPatch,
  type CodexConfigState,
  type SimpleCliInfo,
} from "../services/cliManager";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { cliManagerKeys } from "./keys";

export function useCliManagerClaudeInfoQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: cliManagerKeys.claudeInfo(),
    queryFn: () => cliManagerClaudeInfoGet(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useCliManagerClaudeSettingsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: cliManagerKeys.claudeSettings(),
    queryFn: () => cliManagerClaudeSettingsGet(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useCliManagerCodexInfoQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: cliManagerKeys.codexInfo(),
    queryFn: () => cliManagerCodexInfoGet(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useCliManagerCodexConfigQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: cliManagerKeys.codexConfig(),
    queryFn: () => cliManagerCodexConfigGet(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useCliManagerGeminiInfoQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: cliManagerKeys.geminiInfo(),
    queryFn: () => cliManagerGeminiInfoGet(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useCliManagerClaudeSettingsSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: ClaudeSettingsPatch) => cliManagerClaudeSettingsSet(patch),
    onSuccess: (next) => {
      if (!next) return;
      queryClient.setQueryData<ClaudeSettingsState | null>(cliManagerKeys.claudeSettings(), next);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cliManagerKeys.claudeSettings() });
    },
  });
}

export function useCliManagerCodexConfigSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: CodexConfigPatch) => cliManagerCodexConfigSet(patch),
    onSuccess: (next) => {
      if (!next) return;
      queryClient.setQueryData<CodexConfigState | null>(cliManagerKeys.codexConfig(), next);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cliManagerKeys.codexConfig() });
    },
  });
}

export function pickCliAvailable(info: SimpleCliInfo | ClaudeCliInfo | null) {
  if (!info) return "unavailable" as const;
  return info.found ? ("available" as const) : ("unavailable" as const);
}
