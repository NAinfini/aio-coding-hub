import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Popover } from "../Popover";

describe("ui/Popover", () => {
  it("opens content and maps placement/align to radix data attributes", async () => {
    render(
      <Popover trigger={<span>trigger</span>} placement="top" align="start">
        <div>content</div>
      </Popover>
    );

    fireEvent.click(screen.getByRole("button"));

    const content = await screen.findByText("content");
    const container = content.closest("[data-side]");
    expect(container).not.toBeNull();
    expect(container).toHaveAttribute("data-side", "top");
    expect(container).toHaveAttribute("data-align", "start");
  });
});
