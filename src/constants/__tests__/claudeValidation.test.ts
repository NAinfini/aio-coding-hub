import { describe, expect, it, vi } from "vitest";
import {
  buildClaudeCliMetadataUserId,
  buildClaudeCliValidateHeaders,
  buildClaudeValidateRequestJson,
  newUuidV4,
  rotateClaudeCliUserIdSession,
} from "../claudeValidation";

describe("constants/claudeValidation", () => {
  it("newUuidV4 prefers crypto.randomUUID when available", () => {
    const spy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-a000-000000000000");
    expect(newUuidV4()).toBe("00000000-0000-4000-a000-000000000000");
    spy.mockRestore();
  });

  it("buildClaudeCliMetadataUserId embeds session marker", () => {
    const userId = buildClaudeCliMetadataUserId("session");
    expect(userId).toContain("__session_session");
    expect(userId).toContain("user_");
  });

  it("rotateClaudeCliUserIdSession updates suffix when marker exists", () => {
    const prev = "user_x_account__session_old";
    expect(rotateClaudeCliUserIdSession(prev, "new")).toBe("user_x_account__session_new");
    expect(rotateClaudeCliUserIdSession("no_marker", "new")).toBeNull();
  });

  it("buildClaudeCliValidateHeaders masks empty key", () => {
    const headers = buildClaudeCliValidateHeaders("  ");
    expect(headers.authorization).toContain("***");
    expect(headers["x-api-key"]).toBe("***");
  });

  it("buildClaudeValidateRequestJson returns valid JSON", () => {
    const json = buildClaudeValidateRequestJson("max_tokens_5", "claude-3", "k");
    const parsed = JSON.parse(json) as { body: { model: string } };
    expect(parsed.body.model).toBe("claude-3");
  });
});
