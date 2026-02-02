import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw/server";
import { resetMswState } from "./msw/state";
import { resetTauriEventListeners } from "./mocks/tauri";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
  resetMswState();
  server.resetHandlers();
  resetTauriEventListeners();
  delete (window as any).__TAURI_INTERNALS__;
  vi.clearAllMocks();
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

afterAll(() => {
  server.close();
});
