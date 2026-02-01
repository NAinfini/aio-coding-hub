import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test/utils/reactQuery";
import App from "../App";

function renderApp() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

describe("App (smoke)", () => {
  it("renders home route by default", () => {
    window.location.hash = "#/";
    renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "首页" })).toBeInTheDocument();
  });

  it("renders settings route via hash", () => {
    window.location.hash = "#/settings";
    renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "设置" })).toBeInTheDocument();
  });
});
