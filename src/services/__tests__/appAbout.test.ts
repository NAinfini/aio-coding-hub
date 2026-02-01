import { describe, expect, it, vi } from "vitest";
import { invokeTauriOrNull } from "../tauriInvoke";
import { appAboutGet } from "../appAbout";

vi.mock("../tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../tauriInvoke")>("../tauriInvoke");
  return { ...actual, invokeTauriOrNull: vi.fn() };
});

describe("services/appAbout", () => {
  it("returns about info when available", async () => {
    vi.mocked(invokeTauriOrNull).mockResolvedValue({
      os: "mac",
      arch: "arm64",
      profile: "dev",
      app_version: "0.0.0",
      bundle_type: null,
      run_mode: "desktop",
    } as any);

    const result = await appAboutGet();
    expect(result).toEqual(
      expect.objectContaining({ os: "mac", arch: "arm64", run_mode: "desktop" })
    );
  });

  it("returns null when invoke throws", async () => {
    vi.mocked(invokeTauriOrNull).mockRejectedValue(new Error("boom"));
    const result = await appAboutGet();
    expect(result).toBeNull();
  });
});
