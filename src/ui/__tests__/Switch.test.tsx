import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "../Switch";

describe("ui/Switch", () => {
  it("renders with role=switch and aria-checked", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />);
    const sw = screen.getByRole("switch");
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("reflects checked state in aria-checked", () => {
    const { rerender } = render(<Switch checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

    rerender(<Switch checked={true} onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("calls onCheckedChange with toggled value on click", () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("calls onCheckedChange(false) when currently checked", () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={true} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("applies disabled state and prevents click", () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} disabled />);
    const sw = screen.getByRole("switch");
    expect(sw).toBeDisabled();
    fireEvent.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("applies sm size classes", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} size="sm" />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveClass("h-5", "w-9");
  });

  it("applies md size classes by default", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveClass("h-6", "w-11");
  });

  it("merges custom className", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} className="my-switch" />);
    expect(screen.getByRole("switch")).toHaveClass("my-switch");
  });

  it("has type=button to prevent form submission", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("type", "button");
  });
});
