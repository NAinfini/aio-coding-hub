import { describe, expect, it } from "vitest";
import {
  compactWhitespace,
  formatActionFailureToast,
  formatUnknownError,
  normalizeErrorWithCode,
  parseErrorCodeMessage,
} from "../errors";

describe("utils/errors", () => {
  it("formatUnknownError handles common inputs", () => {
    expect(formatUnknownError("x")).toBe("x");
    expect(formatUnknownError(new Error("boom"))).toBe("boom");
    expect(formatUnknownError({ message: " m " })).toBe(" m ");
    expect(formatUnknownError({ x: 1 })).toContain('"x":1');
  });

  it("parseErrorCodeMessage parses code prefix", () => {
    expect(parseErrorCodeMessage("GW_UPSTREAM_TIMEOUT: hello")).toEqual({
      error_code: "GW_UPSTREAM_TIMEOUT",
      message: "hello",
    });
    expect(parseErrorCodeMessage("Error: X:  ")).toEqual({
      error_code: "X",
      message: "X:",
    });
    expect(parseErrorCodeMessage("plain")).toEqual({ error_code: null, message: "plain" });
  });

  it("normalizeErrorWithCode compacts whitespace", () => {
    expect(compactWhitespace("  a\n b   c ")).toBe("a b c");
    // Note: parseErrorCodeMessage does not treat multi-line strings as a coded error.
    expect(normalizeErrorWithCode("X: a b").message).toBe("a b");
  });

  it("formatActionFailureToast includes code when present", () => {
    expect(formatActionFailureToast("保存", "X: msg").toast).toBe("保存失败（code X）：msg");
    expect(formatActionFailureToast("保存", "msg").toast).toBe("保存失败：msg");
  });
});
