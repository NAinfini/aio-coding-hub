import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  gatewayCircuitResetCli,
  gatewayCircuitResetProvider,
  gatewayCircuitStatus,
  gatewaySessionsList,
  gatewayStatus,
  type GatewayProviderCircuitStatus,
} from "../services/gateway";
import type { CliKey } from "../services/providers";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { gatewayKeys } from "./keys";

export function useGatewayStatusQuery(options?: {
  enabled?: boolean;
  refetchIntervalMs?: number | false;
}) {
  return useQuery({
    queryKey: gatewayKeys.status(),
    queryFn: () => gatewayStatus(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    refetchInterval: options?.refetchIntervalMs ?? false,
    refetchIntervalInBackground: true,
  });
}

export function useGatewayCircuitStatusQuery(cliKey: CliKey) {
  return useQuery({
    queryKey: gatewayKeys.circuitStatus(cliKey),
    queryFn: () => gatewayCircuitStatus(cliKey),
    enabled: hasTauriRuntime(),
    placeholderData: keepPreviousData,
  });
}

export function useGatewayCircuitByProviderId(cliKey: CliKey) {
  const query = useGatewayCircuitStatusQuery(cliKey);

  const byId = (() => {
    const rows = query.data ?? null;
    if (!rows) return {};
    const next: Record<number, GatewayProviderCircuitStatus> = {};
    for (const row of rows) next[row.provider_id] = row;
    return next;
  })();

  return { ...query, circuitByProviderId: byId };
}

export function useGatewaySessionsListQuery(
  limit: number,
  options?: { enabled?: boolean; refetchIntervalMs?: number | false }
) {
  return useQuery({
    queryKey: gatewayKeys.sessionsList(limit),
    queryFn: () => gatewaySessionsList(limit),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    refetchInterval: options?.refetchIntervalMs ?? false,
    refetchIntervalInBackground: true,
  });
}

export function useGatewayCircuitResetProviderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { cliKey?: CliKey | null; providerId: number }) =>
      gatewayCircuitResetProvider(input.providerId),
    onSuccess: (_ok, input) => {
      if (input.cliKey) {
        queryClient.invalidateQueries({ queryKey: gatewayKeys.circuitStatus(input.cliKey) });
        return;
      }
      queryClient.invalidateQueries({ queryKey: gatewayKeys.circuits() });
    },
  });
}

export function useGatewayCircuitResetCliMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { cliKey: CliKey }) => gatewayCircuitResetCli(input.cliKey),
    onSuccess: (_count, input) => {
      queryClient.invalidateQueries({ queryKey: gatewayKeys.circuitStatus(input.cliKey) });
    },
  });
}
