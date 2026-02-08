import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip } from "../Tooltip";

describe("ui/Tooltip", () => {
  it("renders children without tooltip content initially", () => {
    render(
      <Tooltip content="Tip text">
        <span>Hover me</span>
      </Tooltip>
    );
    expect(screen.getByText("Hover me")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
  });

  it("shows tooltip on mouseEnter and hides on mouseLeave", async () => {
    render(
      <Tooltip content="Hello tooltip">
        <span>Anchor</span>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText("Anchor"));
    await waitFor(() => {
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
      expect(screen.getByText("Hello tooltip")).toBeInTheDocument();
    });

    fireEvent.mouseLeave(screen.getByText("Anchor"));
    await waitFor(() => {
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    });
  });

  it("renders with placement=top by default", async () => {
    render(
      <Tooltip content="Top tip">
        <span>Anchor</span>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText("Anchor"));
    await waitFor(() => {
      const tooltip = screen.getByRole("tooltip", { hidden: true });
      expect(tooltip).toHaveStyle("transform: translate(-50%, calc(-100% - 8px))");
    });
  });

  it("renders with placement=bottom", async () => {
    render(
      <Tooltip content="Bottom tip" placement="bottom">
        <span>Anchor</span>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText("Anchor"));
    await waitFor(() => {
      const tooltip = screen.getByRole("tooltip", { hidden: true });
      expect(tooltip).toHaveStyle("transform: translate(-50%, 8px)");
    });
  });

  it("merges custom className on the anchor wrapper", () => {
    const { container } = render(
      <Tooltip content="Tip" className="anchor-class">
        <span>Anchor</span>
      </Tooltip>
    );
    expect(container.querySelector(".anchor-class")).toBeInTheDocument();
  });

  it("merges contentClassName on the tooltip content", async () => {
    render(
      <Tooltip content="Styled tip" contentClassName="tip-style">
        <span>Anchor</span>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText("Anchor"));
    await waitFor(() => {
      expect(screen.getByText("Styled tip").closest(".tip-style")).toBeInTheDocument();
    });
  });

  it("has aria-hidden=true on the tooltip element", async () => {
    render(
      <Tooltip content="Hidden tip">
        <span>Anchor</span>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText("Anchor"));
    await waitFor(() => {
      const tooltip = screen.getByRole("tooltip", { hidden: true });
      expect(tooltip).toHaveAttribute("aria-hidden", "true");
    });
  });
});
