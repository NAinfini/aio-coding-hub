import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsRow } from "../SettingsRow";

describe("ui/SettingsRow", () => {
  it("renders label and children", () => {
    render(
      <SettingsRow label="Theme">
        <span>Dark</span>
      </SettingsRow>
    );
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
  });

  it("renders complex children", () => {
    render(
      <SettingsRow label="Language">
        <button type="button">English</button>
        <button type="button">Chinese</button>
      </SettingsRow>
    );
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chinese" })).toBeInTheDocument();
  });

  it("merges custom className", () => {
    const { container } = render(
      <SettingsRow label="Custom" className="my-row">
        <span>Value</span>
      </SettingsRow>
    );
    expect(container.firstElementChild).toHaveClass("my-row");
  });

  it("applies default layout classes", () => {
    const { container } = render(
      <SettingsRow label="Layout">
        <span>Content</span>
      </SettingsRow>
    );
    const row = container.firstElementChild;
    expect(row).toHaveClass("flex", "flex-col", "gap-2", "py-3");
  });

  it("renders label in a styled container", () => {
    render(
      <SettingsRow label="Styled Label">
        <span>Value</span>
      </SettingsRow>
    );
    const label = screen.getByText("Styled Label");
    expect(label).toHaveClass("text-sm", "font-medium");
  });
});
