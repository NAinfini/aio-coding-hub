const DEFAULT_TAURI_INVOKE_TIMEOUT_MS = 60_000;

export type InvokeTauriOptions = {
  timeoutMs?: number | null;
};

export function hasTauriRuntime() {
  return typeof window !== "undefined" && typeof (window as any).__TAURI_INTERNALS__ === "object";
}

function normalizeTimeoutMs(value: number | null | undefined) {
  if (value == null) return DEFAULT_TAURI_INVOKE_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

export async function invokeTauriOrNull<T>(
  cmd: string,
  args?: Record<string, unknown>,
  options?: InvokeTauriOptions
): Promise<T | null> {
  if (!hasTauriRuntime()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const invokePromise = invoke<T>(cmd, args);
  const timeoutMs = normalizeTimeoutMs(options?.timeoutMs);
  if (timeoutMs == null) return invokePromise;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`IPC_TIMEOUT: ${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([invokePromise, timeoutPromise]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
