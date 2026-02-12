import { describe, expect, it, vi, beforeEach } from "vitest";
import { copyText } from "../clipboard";
import { hasTauriRuntime } from "../tauriInvoke";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

vi.mock("../tauriInvoke", () => ({
  hasTauriRuntime: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

describe("services/clipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses tauri clipboard when runtime is available", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(writeText).mockResolvedValue(undefined);

    await copyText("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to navigator clipboard when tauri write fails", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(writeText).mockRejectedValue(new Error("denied"));

    const navWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: navWrite },
      configurable: true,
    });

    await copyText("hello2");

    expect(navWrite).toHaveBeenCalledWith("hello2");
  });

  it("falls back to execCommand when navigator clipboard unavailable", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    const execSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: execSpy,
      configurable: true,
    });

    await copyText("hello3");

    expect(execSpy).toHaveBeenCalledWith("copy");
  });
});
