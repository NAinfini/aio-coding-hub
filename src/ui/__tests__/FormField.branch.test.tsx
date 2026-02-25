import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "../FormField";

describe("ui/FormField (branch coverage)", () => {
  it("supports render-prop children with auto-generated id", () => {
    render(
      <FormField label="Render Prop">{(id) => <input id={id} data-testid="rp-input" />}</FormField>
    );

    const label = screen.getByText("Render Prop");
    const input = screen.getByTestId("rp-input");

    // label htmlFor should match input id
    expect(label.closest("label")).toHaveAttribute("for", input.id);
  });

  it("supports render-prop children with explicit htmlFor", () => {
    render(
      <FormField label="Explicit" htmlFor="my-id">
        {(id) => <input id={id} data-testid="explicit-input" />}
      </FormField>
    );

    const input = screen.getByTestId("explicit-input");
    expect(input.id).toBe("my-id");
  });
});
