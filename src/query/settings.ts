import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  settingsGet,
  settingsSet,
  type AppSettings,
  type SettingsSetInput,
} from "../services/settings";
import { settingsCircuitBreakerNoticeSet } from "../services/settingsCircuitBreakerNotice";
import { settingsCodexSessionIdCompletionSet } from "../services/settingsCodexSessionIdCompletion";
import {
  settingsGatewayRectifierSet,
  type GatewayRectifierSettingsPatch,
} from "../services/settingsGatewayRectifier";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { settingsKeys } from "./keys";

export function useSettingsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: settingsKeys.get(),
    queryFn: () => settingsGet(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export { type SettingsSetInput } from "../services/settings";

export function useSettingsSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SettingsSetInput) => settingsSet(input),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData<AppSettings | null>(settingsKeys.get(), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.get() });
    },
  });
}

export function useSettingsGatewayRectifierSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GatewayRectifierSettingsPatch) => settingsGatewayRectifierSet(input),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData<AppSettings | null>(settingsKeys.get(), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.get() });
    },
  });
}

export function useSettingsCircuitBreakerNoticeSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enable: boolean) => settingsCircuitBreakerNoticeSet(enable),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData<AppSettings | null>(settingsKeys.get(), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.get() });
    },
  });
}

export function useSettingsCodexSessionIdCompletionSetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enable: boolean) => settingsCodexSessionIdCompletionSet(enable),
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData<AppSettings | null>(settingsKeys.get(), updated);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.get() });
    },
  });
}
