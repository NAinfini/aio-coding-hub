import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "../Select";

describe("ui/Select", () => {
  it("renders a select element with options", () => {
    render(
      <Select aria-label="color">
        <option value="red">Red</option>
        <option value="blue">Blue</option>
      </Select>
    );
    const select = screen.getByLabelText("color");
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe("SELECT");
  });

  it("fires onChange when selection changes", () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="fruit" onChange={onChange}>
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </Select>
    );
    fireEvent.change(screen.getByLabelText("fruit"), { target: { value: "banana" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("applies disabled state", () => {
    render(
      <Select aria-label="disabled-select" disabled>
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText("disabled-select")).toBeDisabled();
  });

  it("applies mono class when mono prop is true", () => {
    const { rerender } = render(
      <Select aria-label="mono-select" mono>
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText("mono-select")).toHaveClass("font-mono");

    rerender(
      <Select aria-label="mono-select">
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText("mono-select")).not.toHaveClass("font-mono");
  });

  it("merges custom className", () => {
    render(
      <Select aria-label="styled-select" className="extra-class">
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText("styled-select")).toHaveClass("extra-class");
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} aria-label="ref-select">
        <option value="a">A</option>
      </Select>
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });

  it("reflects controlled value", () => {
    render(
      <Select aria-label="controlled" value="b" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    expect(screen.getByLabelText("controlled")).toHaveValue("b");
  });
});
