import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { init } from "echarts";
import { EChartsCanvas } from "../EChartsCanvas";

describe("components/charts/EChartsCanvas", () => {
  it("initializes and updates options", async () => {
    const option1 = { title: { text: "a" } };
    const option2 = { title: { text: "b" } };

    const { rerender, unmount } = render(<EChartsCanvas option={option1 as any} />);

    await waitFor(() => {
      expect(init).toHaveBeenCalled();
    });

    const chart = vi.mocked(init).mock.results[0]?.value as any;
    expect(chart?.setOption).toBeTypeOf("function");

    rerender(<EChartsCanvas option={option2 as any} />);

    await waitFor(() => {
      expect(chart.setOption).toHaveBeenCalled();
    });

    unmount();
    expect(chart.dispose).toHaveBeenCalled();
  });
});
