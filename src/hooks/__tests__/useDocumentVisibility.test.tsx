import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDocumentVisibility } from "../useDocumentVisibility";

describe("hooks/useDocumentVisibility", () => {
  it("tracks document visibility changes", () => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    const { result } = renderHook(() => useDocumentVisibility());
    expect(result.current).toBe(true);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(false);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(true);
  });
});
