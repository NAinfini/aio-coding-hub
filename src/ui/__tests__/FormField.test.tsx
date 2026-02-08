import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "../FormField";

describe("ui/FormField", () => {
  it("renders label and children", () => {
    render(
      <FormField label="Username">
        <input aria-label="username-input" />
      </FormField>
    );
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("username-input")).toBeInTheDocument();
  });

  it("renders hint when provided", () => {
    render(
      <FormField label="Email" hint="We won't share it">
        <input />
      </FormField>
    );
    expect(screen.getByText("We won't share it")).toBeInTheDocument();
  });

  it("omits hint when not provided", () => {
    const { container } = render(
      <FormField label="Name">
        <input />
      </FormField>
    );
    // Only the label text and the input should be present
    const hintCandidates = container.querySelectorAll(".text-xs");
    expect(hintCandidates).toHaveLength(0);
  });

  it("renders ReactNode as hint", () => {
    render(
      <FormField label="Field" hint={<span data-testid="custom-hint">Custom</span>}>
        <input />
      </FormField>
    );
    expect(screen.getByTestId("custom-hint")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("merges custom className", () => {
    const { container } = render(
      <FormField label="Styled" className="my-field">
        <input />
      </FormField>
    );
    expect(container.firstElementChild).toHaveClass("my-field");
  });

  it("renders multiple children", () => {
    render(
      <FormField label="Multi">
        <input aria-label="first" />
        <input aria-label="second" />
      </FormField>
    );
    expect(screen.getByLabelText("first")).toBeInTheDocument();
    expect(screen.getByLabelText("second")).toBeInTheDocument();
  });
});
