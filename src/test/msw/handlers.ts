// Usage: MSW handlers emulating Tauri commands via `http://tauri.local/<command>` fetch bridge.

import { http, HttpResponse } from "msw";
import { TAURI_ENDPOINT } from "../tauriEndpoint";
import { buildCliProxySetEnabledResult, getCliProxyStatusAllState } from "./state";

const withJson = async <T>(request: Request): Promise<T> => {
  try {
    const raw = await request.text();
    if (!raw) return {} as T;
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
};

export const handlers = [
  http.post(`${TAURI_ENDPOINT}/cli_proxy_status_all`, () =>
    HttpResponse.json(getCliProxyStatusAllState())
  ),

  http.post(`${TAURI_ENDPOINT}/cli_proxy_set_enabled`, async ({ request }) => {
    const payload = await withJson<{ cliKey?: string; enabled?: boolean }>(request);
    return HttpResponse.json(
      buildCliProxySetEnabledResult({
        cli_key: payload.cliKey ?? "",
        enabled: Boolean(payload.enabled),
      })
    );
  }),

  // Catch-all: return `null` for any unimplemented command to keep tests stable by default.
  http.post(`${TAURI_ENDPOINT}/:command`, () => HttpResponse.json(null)),
];
