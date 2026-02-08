import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test/utils/reactQuery";
import App from "../App";

const DEFAULT_HASH = "#/";

function renderApp() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

async function renderRouteAndFindHeading(hash: string, headingName: string) {
  window.location.hash = hash;
  renderApp();
  return screen.findByRole("heading", { level: 1, name: headingName });
}

describe("App (smoke)", () => {
  afterEach(() => {
    window.location.hash = DEFAULT_HASH;
  });

  it("renders home route by default", async () => {
    expect(await renderRouteAndFindHeading("#/", "首页")).toBeInTheDocument();
  });

  it("renders settings route via hash", async () => {
    expect(await renderRouteAndFindHeading("#/settings", "设置")).toBeInTheDocument();
  });
});
