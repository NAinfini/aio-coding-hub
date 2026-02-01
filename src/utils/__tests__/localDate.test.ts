import { describe, expect, it } from "vitest";
import {
  parseYyyyMmDd,
  unixSecondsAtLocalStartOfDay,
  unixSecondsAtLocalStartOfNextDay,
} from "../localDate";

describe("utils/localDate", () => {
  it("parseYyyyMmDd validates input", () => {
    expect(parseYyyyMmDd("")).toBeNull();
    expect(parseYyyyMmDd("2020-00-01")).toBeNull();
    expect(parseYyyyMmDd("2020-01-00")).toBeNull();
    expect(parseYyyyMmDd("2020-01-01")).toEqual({ year: 2020, month: 1, day: 1 });
  });

  it("unix seconds helpers return numbers", () => {
    const start = unixSecondsAtLocalStartOfDay("2020-01-01");
    const next = unixSecondsAtLocalStartOfNextDay("2020-01-01");
    expect(typeof start).toBe("number");
    expect(typeof next).toBe("number");
    expect(next).toBeGreaterThan(start as number);
  });
});
