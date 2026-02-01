import { useMemo } from "react";
import type { GatewayStatus } from "../services/gateway";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { useGatewayStatusQuery } from "../query/gateway";
import { useSettingsQuery } from "../query/settings";

export type GatewayAvailability = "checking" | "available" | "unavailable";

export type GatewayMeta = {
  gatewayAvailable: GatewayAvailability;
  gateway: GatewayStatus | null;
  preferredPort: number;
};

const DEFAULT_PREFERRED_PORT = 37123;

export function useGatewayMeta(): GatewayMeta {
  const tauriRuntime = hasTauriRuntime();

  const settingsQuery = useSettingsQuery({ enabled: tauriRuntime });
  const gatewayStatusQuery = useGatewayStatusQuery({ enabled: tauriRuntime });

  return useMemo(() => {
    if (!tauriRuntime) {
      return {
        gatewayAvailable: "unavailable",
        gateway: null,
        preferredPort: DEFAULT_PREFERRED_PORT,
      };
    }

    const preferredPort = settingsQuery.data?.preferred_port ?? DEFAULT_PREFERRED_PORT;

    if (gatewayStatusQuery.isLoading) {
      return {
        gatewayAvailable: "checking",
        gateway: gatewayStatusQuery.data ?? null,
        preferredPort,
      };
    }

    if (gatewayStatusQuery.isError) {
      return {
        gatewayAvailable: "unavailable",
        gateway: null,
        preferredPort,
      };
    }

    const gateway = gatewayStatusQuery.data ?? null;
    return {
      gatewayAvailable: gateway ? "available" : "unavailable",
      gateway,
      preferredPort,
    };
  }, [
    gatewayStatusQuery.data,
    gatewayStatusQuery.isError,
    gatewayStatusQuery.isLoading,
    settingsQuery.data?.preferred_port,
    tauriRuntime,
  ]);
}
