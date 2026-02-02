import { describe, expect, it } from "vitest";
import { cn } from "../cn";

describe("utils/cn", () => {
  it("merges tailwind classes and resolves conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("px-2 py-1", "p-3")).toBe("p-3");
    expect(cn("hover:bg-red-500", "hover:bg-blue-500")).toBe("hover:bg-blue-500");
  });

  it("supports conditional inputs", () => {
    expect(cn("foo", false && "bar", null, undefined)).toBe("foo");
  });
});
