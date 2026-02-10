import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../ErrorState";

describe("ui/ErrorState", () => {
  it("renders default title", () => {
    render(<ErrorState />);
    expect(screen.getByText("加载失败")).toBeInTheDocument();
  });

  it("renders custom title", () => {
    render(<ErrorState title="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders message when provided", () => {
    render(<ErrorState message="Network error occurred" />);
    expect(screen.getByText("Network error occurred")).toBeInTheDocument();
  });

  it("does not render message when not provided", () => {
    render(<ErrorState />);
    // Only title should be present
    const textElements = screen.queryByText("Network error occurred");
    expect(textElements).toBeNull();
  });

  it("renders retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("does not render retry button when onRetry is not provided", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("applies rose-themed border classes", () => {
    const { container } = render(<ErrorState />);
    const el = container.firstElementChild;
    expect(el).toHaveClass("border-rose-200");
  });

  it("supports dark mode classes", () => {
    const { container } = render(<ErrorState />);
    const el = container.firstElementChild;
    expect(el).toHaveClass("dark:border-rose-800", "dark:bg-rose-950");
  });

  it("merges custom className", () => {
    const { container } = render(<ErrorState className="my-error" />);
    const el = container.firstElementChild;
    expect(el).toHaveClass("my-error");
  });

  it("renders title with rose color", () => {
    render(<ErrorState title="Error" />);
    const title = screen.getByText("Error");
    expect(title).toHaveClass("text-rose-900");
  });
});
