import { describe, expect, it } from "vitest";
import { queryClient } from "../queryClient";

describe("query/queryClient", () => {
  it("sets default options", () => {
    const defaults = queryClient.getDefaultOptions();

    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.staleTime).toBe(1000 * 60 * 5);
    expect(defaults.mutations?.retry).toBe(false);
  });
});
