import { invokeTauriOrNull, hasTauriRuntime } from "./tauriInvoke";

export type AppHeartbeatPayload = {
  ts_unix_ms: number;
};

export async function listenAppHeartbeat(): Promise<() => void> {
  if (!hasTauriRuntime()) return () => {};

  const { listen } = await import("@tauri-apps/api/event");

  let inFlight = false;

  const unlisten = await listen<AppHeartbeatPayload>("app:heartbeat", () => {
    if (inFlight) return;
    inFlight = true;

    invokeTauriOrNull<boolean>("app_heartbeat_pong", undefined, { timeoutMs: 3_000 })
      .catch(() => null)
      .finally(() => {
        inFlight = false;
      });
  });

  return () => {
    unlisten();
  };
}
