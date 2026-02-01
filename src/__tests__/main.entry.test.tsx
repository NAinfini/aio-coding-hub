import { describe, expect, it } from "vitest";

describe("main entry", () => {
  it("renders without crashing", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import("../main");

    // React 19 createRoot render is async-ish; assert content eventually appears.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById("root")?.innerHTML).toBeTruthy();
  });
});
