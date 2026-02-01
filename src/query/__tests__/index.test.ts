import { describe, expect, it } from "vitest";
import * as query from "../index";

describe("query/index", () => {
  it("re-exports query utilities", () => {
    expect(query.queryClient).toBeDefined();
    expect(typeof query.providersKeys).toBe("object");
    expect(typeof query.useProvidersListQuery).toBe("function");
  });
});
