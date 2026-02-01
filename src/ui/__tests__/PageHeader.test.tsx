import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../PageHeader";

describe("ui/PageHeader", () => {
  it("toggles layout when subtitle is present and renders optional blocks", () => {
    const { container, rerender } = render(<PageHeader title="Title" />);

    expect(container.firstElementChild).toHaveClass("items-center");
    expect(screen.queryByText("Subtitle")).toBeNull();

    rerender(
      <PageHeader title="Title" subtitle="Subtitle" actions={<button type="button">Act</button>} />
    );

    expect(container.firstElementChild).toHaveClass("items-start");
    expect(screen.getByText("Subtitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });
});
