import { formatUnknownError } from "../utils/errors";
import { logToConsole } from "./consoleLog";
import { hasTauriRuntime, invokeTauriOrNull } from "./tauriInvoke";

export type InvokeServiceCommandOptions<Fallback> = {
  title: string;
  cmd: string;
  args?: Record<string, unknown>;
  details?: Record<string, unknown>;
  fallback?: Fallback;
  nullResultBehavior?: "throw" | "return_fallback";
  omitArgsWhenUndefined?: boolean;
};

export async function invokeServiceCommand<T, Fallback = null>(
  options: InvokeServiceCommandOptions<Fallback>
): Promise<T | Fallback> {
  const fallback = (options.fallback ?? null) as Fallback;

  if (!hasTauriRuntime()) return fallback;

  try {
    const result =
      options.omitArgsWhenUndefined === false || options.args !== undefined
        ? await invokeTauriOrNull<T>(options.cmd, options.args)
        : await invokeTauriOrNull<T>(options.cmd);

    if (result != null) return result;
    if (options.nullResultBehavior === "return_fallback") return fallback;

    throw new Error(`IPC_NULL_RESULT: ${options.cmd}`);
  } catch (err) {
    logToConsole("error", options.title, {
      cmd: options.cmd,
      args: options.args,
      ...options.details,
      error: formatUnknownError(err),
    });
    throw err;
  }
}

export async function invokeService<T>(
  title: string,
  cmd: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  return invokeServiceCommand<T>({ title, cmd, args });
}

export async function invokeServiceWithDetails<T>(
  title: string,
  cmd: string,
  args?: Record<string, unknown>,
  details?: Record<string, unknown>
): Promise<T | null> {
  return invokeServiceCommand<T>({ title, cmd, args, details });
}
