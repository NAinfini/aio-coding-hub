// Usage: Shared MSW in-memory state for tests that run through `invoke` -> fetch -> MSW handlers.

import type { CliProxyResult, CliProxyStatus } from "../../services/cliProxy";
import type { EnvConflict } from "../../services/envConflicts";
import type { CliKey } from "../../services/providers";

const DEFAULT_BASE_ORIGIN = "http://127.0.0.1:37123";

const DEFAULT_CLI_PROXY_STATUS: CliProxyStatus[] = [
  { cli_key: "claude", enabled: false, base_origin: null },
  { cli_key: "codex", enabled: false, base_origin: null },
  { cli_key: "gemini", enabled: false, base_origin: null },
];

let traceCounter = 0;
let cliProxyStatusAllState: CliProxyStatus[] = JSON.parse(JSON.stringify(DEFAULT_CLI_PROXY_STATUS));
let envConflictsState: EnvConflict[] = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nextTraceId(): string {
  traceCounter += 1;
  return `msw-${traceCounter}`;
}

export function resetMswState() {
  traceCounter = 0;
  cliProxyStatusAllState = clone(DEFAULT_CLI_PROXY_STATUS);
  envConflictsState = [];
}

export function getCliProxyStatusAllState(): CliProxyStatus[] {
  return clone(cliProxyStatusAllState);
}

export function setCliProxyStatusAllState(next: CliProxyStatus[]) {
  cliProxyStatusAllState = clone(next);
}

export function getEnvConflictsState(): EnvConflict[] {
  return clone(envConflictsState);
}

export function setEnvConflictsState(next: EnvConflict[]) {
  envConflictsState = clone(next);
}

export function setCliProxyEnabledState(cliKey: CliKey, enabled: boolean): CliProxyStatus[] {
  const rowIndex = cliProxyStatusAllState.findIndex((row) => row.cli_key === cliKey);
  const baseOrigin = enabled ? DEFAULT_BASE_ORIGIN : null;
  if (rowIndex < 0) {
    cliProxyStatusAllState = [
      { cli_key: cliKey, enabled, base_origin: baseOrigin },
      ...cliProxyStatusAllState,
    ];
    return getCliProxyStatusAllState();
  }

  const next = clone(cliProxyStatusAllState);
  next[rowIndex] = { ...next[rowIndex], enabled, base_origin: baseOrigin };
  cliProxyStatusAllState = next;
  return getCliProxyStatusAllState();
}

export function buildCliProxySetEnabledResult(input: {
  cli_key: string;
  enabled: boolean;
}): CliProxyResult {
  const cliKey = input.cli_key;
  const enabled = input.enabled;

  if (cliKey !== "claude" && cliKey !== "codex" && cliKey !== "gemini") {
    return {
      trace_id: nextTraceId(),
      cli_key: cliKey as CliKey,
      enabled,
      ok: false,
      error_code: "UNSUPPORTED_CLI",
      message: `unsupported cli_key: ${cliKey}`,
      base_origin: null,
    };
  }

  const cli_key = cliKey as CliKey;
  const base_origin = enabled ? DEFAULT_BASE_ORIGIN : null;
  setCliProxyEnabledState(cli_key, enabled);

  return {
    trace_id: nextTraceId(),
    cli_key,
    enabled,
    ok: true,
    error_code: null,
    message: "",
    base_origin,
  };
}
