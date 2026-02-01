export function setTauriRuntime() {
  (window as any).__TAURI_INTERNALS__ = {};
}

export function clearTauriRuntime() {
  delete (window as any).__TAURI_INTERNALS__;
}
