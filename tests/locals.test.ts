import { describe, expect, it } from "vitest";
import { localsVsVisitors } from "@/lib/locals";

const stats = (
  local_count: number,
  visitor_count: number,
  lo: number | null,
  vo: number | null,
) => ({
  local_count,
  visitor_count,
  local_overall: lo,
  visitor_overall: vo,
});

describe("locals vs visitors", () => {
  it("is empty until someone says", () => {
    expect(localsVsVisitors(stats(0, 0, null, null))).toBeNull();
  });
  it("splits raters into percentages that add up to 100", () => {
    expect(localsVsVisitors(stats(2, 1, 4, 3))).toMatchObject({
      total: 3,
      localPct: 67,
      visitorPct: 33,
    });
    expect(localsVsVisitors(stats(0, 4, null, 4))).toMatchObject({ localPct: 0, visitorPct: 100 });
  });
  it("only compares scores once both groups have enough raters", () => {
    expect(localsVsVisitors(stats(2, 9, 4.5, 3))!.verdict).toBe("too-early");
    expect(localsVsVisitors(stats(3, 3, 4.5, 3.5))!.verdict).toBe("locals"); // 9.0 vs 7.0
    expect(localsVsVisitors(stats(3, 3, 3.5, 4.5))!.verdict).toBe("visitors");
    expect(localsVsVisitors(stats(5, 5, 4.0, 4.05))!.verdict).toBe("same"); // 8.0 vs 8.1
  });
});
