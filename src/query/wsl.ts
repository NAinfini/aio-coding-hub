import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WslTargetCli } from "../services/settings";
import {
  wslConfigStatusGet,
  wslConfigureClients,
  wslDetect,
  wslHostAddressGet,
  type WslDetection,
  type WslDistroConfigStatus,
  type WslConfigureReport,
} from "../services/wsl";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { wslKeys } from "./keys";

export function useWslDetectionQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: wslKeys.detection(),
    queryFn: () => wslDetect(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useWslHostAddressQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: wslKeys.hostAddress(),
    queryFn: () => wslHostAddressGet(),
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useWslConfigStatusQuery(distros: string[], options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: wslKeys.configStatus(distros),
    queryFn: () => {
      if (distros.length === 0) return null;
      return wslConfigStatusGet(distros);
    },
    enabled: hasTauriRuntime() && distros.length > 0 && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export type WslOverview = {
  detection: WslDetection | null;
  hostIp: string | null;
  statusRows: WslDistroConfigStatus[] | null;
};

export function useWslOverviewQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: wslKeys.overview(),
    queryFn: async (): Promise<WslOverview> => {
      const det = await wslDetect();
      if (!det) {
        return { detection: null, hostIp: null, statusRows: null };
      }
      if (!det.detected || det.distros.length === 0) {
        return { detection: det, hostIp: null, statusRows: null };
      }

      const [ip, statuses] = await Promise.all([
        wslHostAddressGet(),
        wslConfigStatusGet(det.distros),
      ]);
      return { detection: det, hostIp: ip ?? null, statusRows: statuses ?? null };
    },
    enabled: hasTauriRuntime() && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

export function useWslConfigureClientsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { targets: WslTargetCli }) => wslConfigureClients(input),
    onSuccess: (_report: WslConfigureReport | null) => {
      queryClient.invalidateQueries({ queryKey: wslKeys.all });
    },
  });
}
