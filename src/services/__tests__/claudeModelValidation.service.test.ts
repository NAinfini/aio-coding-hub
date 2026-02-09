import { describe, expect, it, vi } from "vitest";
import { logToConsole } from "../consoleLog";
import { hasTauriRuntime, invokeTauriOrNull } from "../tauriInvoke";
import {
  claudeProviderGetApiKeyPlaintext,
  claudeProviderValidateModel,
} from "../claudeModelValidation";

vi.mock("../tauriInvoke", async () => {
  const actual = await vi.importActual<typeof import("../tauriInvoke")>("../tauriInvoke");
  return {
    ...actual,
    hasTauriRuntime: vi.fn(),
    invokeTauriOrNull: vi.fn(),
  };
});

vi.mock("../consoleLog", async () => {
  const actual = await vi.importActual<typeof import("../consoleLog")>("../consoleLog");
  return {
    ...actual,
    logToConsole: vi.fn(),
  };
});

describe("services/claudeModelValidation", () => {
  it("returns null without tauri runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(false);

    await expect(
      claudeProviderValidateModel({ provider_id: 1, base_url: "https://x", request_json: "{}" })
    ).resolves.toBeNull();
    await expect(claudeProviderGetApiKeyPlaintext(1)).resolves.toBeNull();
  });

  it("rethrows invoke errors and logs", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockRejectedValueOnce(new Error("claude validation boom"));

    await expect(
      claudeProviderValidateModel({ provider_id: 1, base_url: "https://x", request_json: "{}" })
    ).rejects.toThrow("claude validation boom");

    expect(logToConsole).toHaveBeenCalledWith(
      "error",
      "Claude 模型验证失败",
      expect.objectContaining({
        cmd: "claude_provider_validate_model",
        error: expect.stringContaining("claude validation boom"),
      })
    );
  });

  it("treats null invoke result as error with runtime", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValueOnce(null);

    await expect(
      claudeProviderValidateModel({ provider_id: 1, base_url: "https://x", request_json: "{}" })
    ).rejects.toThrow("IPC_NULL_RESULT: claude_provider_validate_model");
  });

  it("keeps argument mapping unchanged", async () => {
    vi.mocked(hasTauriRuntime).mockReturnValue(true);
    vi.mocked(invokeTauriOrNull).mockResolvedValue({ ok: true } as any);

    await claudeProviderValidateModel({
      provider_id: 9,
      base_url: "https://api",
      request_json: "{}",
    });
    expect(invokeTauriOrNull).toHaveBeenCalledWith("claude_provider_validate_model", {
      providerId: 9,
      baseUrl: "https://api",
      requestJson: "{}",
    });

    await claudeProviderGetApiKeyPlaintext(9);
    expect(invokeTauriOrNull).toHaveBeenCalledWith("claude_provider_get_api_key_plaintext", {
      providerId: 9,
    });
  });
});
