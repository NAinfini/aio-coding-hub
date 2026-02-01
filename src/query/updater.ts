import { useQuery } from "@tanstack/react-query";
import { updaterCheck } from "../services/updater";
import { hasTauriRuntime } from "../services/tauriInvoke";
import { updaterKeys } from "./keys";

export function useUpdaterCheckQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: updaterKeys.check(),
    queryFn: () => updaterCheck(),
    enabled: hasTauriRuntime() && (options?.enabled ?? false),
  });
}
