import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "../Dialog";

describe("ui/Dialog", () => {
  it("renders description when provided and omits it otherwise", () => {
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <Dialog open={true} title="Title" description="Desc" onOpenChange={onOpenChange}>
        <div>Body</div>
      </Dialog>
    );

    expect(screen.getByText("Desc")).toBeInTheDocument();

    rerender(
      <Dialog open={true} title="Title" onOpenChange={onOpenChange}>
        <div>Body</div>
      </Dialog>
    );

    expect(screen.queryByText("Desc")).toBeNull();
  });
});
