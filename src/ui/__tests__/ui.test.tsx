import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "../Dialog";
import { FormField } from "../FormField";
import { Popover } from "../Popover";
import { RadioGroup } from "../RadioGroup";
import { Select } from "../Select";
import { Textarea } from "../Textarea";
import { Tooltip } from "../Tooltip";

describe("ui components", () => {
  it("Popover opens and closes (click outside + Escape)", async () => {
    render(
      <Popover trigger={<span>trigger</span>} placement="bottom" align="center">
        <div>content</div>
      </Popover>
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("Tooltip shows and hides (top/bottom placement)", async () => {
    const { rerender } = render(
      <Tooltip content="hello" placement="top">
        <span>anchor</span>
      </Tooltip>
    );

    fireEvent.mouseEnter(screen.getByText("anchor"));
    await waitFor(() => {
      expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
      expect(screen.getByText("hello")).toBeInTheDocument();
    });
    fireEvent.mouseLeave(screen.getByText("anchor"));
    await waitFor(() => {
      expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
    });

    rerender(
      <Tooltip content="world" placement="bottom">
        <span>anchor</span>
      </Tooltip>
    );
    fireEvent.mouseEnter(screen.getByText("anchor"));
    await waitFor(() => {
      expect(screen.getByText("world")).toBeInTheDocument();
    });
  });

  it("RadioGroup calls onChange and respects disabled", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RadioGroup
        name="t"
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />
    );

    fireEvent.click(screen.getByLabelText("B"));
    expect(onChange).toHaveBeenCalledWith("b");

    onChange.mockClear();
    rerender(
      <RadioGroup
        name="t"
        value="a"
        onChange={onChange}
        disabled
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />
    );
    expect(screen.getByLabelText("B")).toBeDisabled();
  });

  it("Select renders mono style and accepts change", () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="sel" mono onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    fireEvent.change(screen.getByLabelText("sel"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("Textarea forwards props", () => {
    render(<Textarea aria-label="ta" defaultValue="hi" />);
    expect(screen.getByLabelText("ta")).toHaveValue("hi");
  });

  it("FormField renders label + hint", () => {
    render(
      <FormField label="L" hint="H">
        <div>child</div>
      </FormField>
    );
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("H")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("Dialog calls onOpenChange from overlay and Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open title="T" description="D" onOpenChange={onOpenChange}>
        <div>content</div>
      </Dialog>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(document.querySelector(".bg-black\\/30") as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
