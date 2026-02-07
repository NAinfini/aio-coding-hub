import { describe, expect, it } from "vitest";
import {
  computeNiceYAxis,
  escapeHtml,
  formatTokensMillions,
  pickTopSlices,
  toDateLabel,
} from "../chartHelpers";

describe("utils/chartHelpers", () => {
  it("formats token units across zero/K/M branches", () => {
    expect(formatTokensMillions(0)).toBe("0");
    expect(formatTokensMillions(Number.NaN)).toBe("0");
    expect(formatTokensMillions(999)).toBe("999");
    expect(formatTokensMillions(1_000)).toBe("1.0K");
    expect(formatTokensMillions(2_000_000)).toBe("2.0M");
  });

  it("computes fallback axis for non-positive max values", () => {
    expect(computeNiceYAxis(0)).toEqual({ max: 1_000_000, interval: 200_000 });
    expect(computeNiceYAxis(-1)).toEqual({ max: 1_000_000, interval: 200_000 });
  });

  it("computes nice axis multipliers for all threshold branches", () => {
    expect(computeNiceYAxis(4, 5)).toEqual({ max: 4, interval: 1 });
    expect(computeNiceYAxis(7, 5)).toEqual({ max: 8, interval: 2 });
    expect(computeNiceYAxis(12, 5)).toEqual({ max: 12.5, interval: 2.5 });
    expect(computeNiceYAxis(17, 5)).toEqual({ max: 20, interval: 5 });
    expect(computeNiceYAxis(80, 5)).toEqual({ max: 80, interval: 20 });
  });

  it("formats date label and escapes html", () => {
    expect(toDateLabel("2026-02-07")).toBe("02/07");
    expect(escapeHtml('<a & "b">')).toBe("&lt;a &amp; &quot;b&quot;&gt;");
  });

  it("picks top slices with normalized topN and tail sum", () => {
    const rows = [
      { name: "a", cost_usd: 1 },
      { name: "b", cost_usd: 5 },
      { name: "c", cost_usd: 3 },
      { name: "d", cost_usd: Number.NaN },
    ];

    const withFloor = pickTopSlices(rows, 2.9);
    expect(withFloor.head.map((row) => row.name)).toEqual(["b", "c"]);
    expect(withFloor.tailSum).toBe(1);

    const withAtLeastOne = pickTopSlices(rows, 0);
    expect(withAtLeastOne.head.map((row) => row.name)).toEqual(["b"]);
    expect(withAtLeastOne.tailSum).toBe(4);
  });
});
