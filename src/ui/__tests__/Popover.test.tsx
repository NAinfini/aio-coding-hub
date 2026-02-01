import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Popover } from "../Popover";

describe("ui/Popover", () => {
  it("positions and transforms content for placement=top align=start", async () => {
    render(
      <Popover trigger={<span>trigger</span>} placement="top" align="start">
        <div>content</div>
      </Popover>
    );

    const button = screen.getByRole("button");
    (button as any).getBoundingClientRect = () => ({
      left: 10,
      right: 110,
      top: 20,
      bottom: 40,
      width: 100,
      height: 20,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });

    fireEvent.click(button);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveStyle("left: 10px");
    expect(dialog).toHaveStyle("top: 20px");
    expect(dialog).toHaveStyle("transform: translateY(calc(-100% - 8px))");
  });
});
