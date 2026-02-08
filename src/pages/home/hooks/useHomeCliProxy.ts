// Usage:
// - Wraps useCliProxy with env-conflict checking logic before enabling a CLI proxy.
// - Manages the pending confirmation dialog state for environment variable conflicts.

import { useCallback, useState } from "react";
import { logToConsole } from "../../../services/consoleLog";
import type { CliKey } from "../../../services/providers";
import { envConflictsCheck, type EnvConflict } from "../../../services/envConflicts";
import { useCliProxy } from "../../../hooks/useCliProxy";

export type PendingCliProxyEnablePrompt = {
  cliKey: CliKey;
  conflicts: EnvConflict[];
};

export type HomeCliProxyState = {
  cliProxyEnabled: Record<CliKey, boolean>;
  cliProxyToggling: Record<CliKey, boolean>;
  pendingCliProxyEnablePrompt: PendingCliProxyEnablePrompt | null;
  setPendingCliProxyEnablePrompt: (v: PendingCliProxyEnablePrompt | null) => void;
  requestCliProxyEnabledSwitch: (cliKey: CliKey, next: boolean) => void;
  confirmPendingCliProxyEnable: () => void;
};

export function useHomeCliProxy(): HomeCliProxyState {
  const cliProxy = useCliProxy();

  const [pendingCliProxyEnablePrompt, setPendingCliProxyEnablePrompt] =
    useState<PendingCliProxyEnablePrompt | null>(null);
  const [checkingCliProxyCliKey, setCheckingCliProxyCliKey] = useState<CliKey | null>(null);

  const { setCliProxyEnabled } = cliProxy;

  const requestCliProxyEnabledSwitch = useCallback(
    (cliKey: CliKey, next: boolean) => {
      if (next === false) {
        setCliProxyEnabled(cliKey, false);
        return;
      }

      if (checkingCliProxyCliKey === cliKey) return;
      setCheckingCliProxyCliKey(cliKey);

      void (async () => {
        try {
          const conflicts = await envConflictsCheck(cliKey);
          if (!conflicts || conflicts.length === 0) {
            setCliProxyEnabled(cliKey, true);
            return;
          }
          setPendingCliProxyEnablePrompt({ cliKey, conflicts });
        } catch (err) {
          logToConsole("error", "检查环境变量冲突失败，仍尝试开启 CLI 代理", {
            cli: cliKey,
            error: String(err),
          });
          setCliProxyEnabled(cliKey, true);
        } finally {
          setCheckingCliProxyCliKey(null);
        }
      })();
    },
    [checkingCliProxyCliKey, setCliProxyEnabled]
  );

  const confirmPendingCliProxyEnable = useCallback(() => {
    const pending = pendingCliProxyEnablePrompt;
    if (!pending) return;
    setPendingCliProxyEnablePrompt(null);
    setCliProxyEnabled(pending.cliKey, true);
  }, [pendingCliProxyEnablePrompt, setCliProxyEnabled]);

  return {
    cliProxyEnabled: cliProxy.enabled,
    cliProxyToggling: cliProxy.toggling,
    pendingCliProxyEnablePrompt,
    setPendingCliProxyEnablePrompt,
    requestCliProxyEnabledSwitch,
    confirmPendingCliProxyEnable,
  };
}
