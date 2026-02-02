// Usage:
// - Query adapter for `src/services/providerLimitUsage.ts` used by `src/components/home/HomeProviderLimitPanel.tsx`.

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CliKey } from "../services/providers";
import { providerLimitUsageV1 } from "../services/providerLimitUsage";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { providerLimitUsageKeys } from "./keys";

export function useProviderLimitUsageV1Query(
  cliKey: CliKey | null,
  options?: { enabled?: boolean; refetchIntervalMs?: number | false }
) {
  return useQuery({
    queryKey: providerLimitUsageKeys.list(cliKey),
    queryFn: () => providerLimitUsageV1(cliKey),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    refetchInterval: options?.refetchIntervalMs ?? false,
  });
}
