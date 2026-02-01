import { vi } from "vitest";

export const tauriInvoke = vi.fn();
export const tauriEmit = vi.fn();
export const tauriUnlisten = vi.fn();
export const tauriListen = vi.fn().mockResolvedValue(tauriUnlisten);

export const tauriOpenUrl = vi.fn();
export const tauriOpenPath = vi.fn();
export const tauriRevealItemInDir = vi.fn();

export const tauriIsPermissionGranted = vi.fn().mockResolvedValue(false);
export const tauriRequestPermission = vi.fn().mockResolvedValue("denied");
export const tauriSendNotification = vi.fn();

export class MockChannel<T> {
  private handler: (message: T) => void;
  constructor(handler: (message: T) => void) {
    this.handler = handler;
  }
  __emit(message: T) {
    this.handler(message);
  }
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriInvoke,
  Channel: MockChannel,
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: tauriEmit,
  listen: tauriListen,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: tauriOpenUrl,
  openPath: tauriOpenPath,
  revealItemInDir: tauriRevealItemInDir,
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: tauriIsPermissionGranted,
  requestPermission: tauriRequestPermission,
  sendNotification: tauriSendNotification,
}));
