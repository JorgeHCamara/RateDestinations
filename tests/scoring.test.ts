import { describe, expect, it } from "vitest";
import { blendScore, confidence, placePrior, toTenScale, toneFor, userWeight } from "@/lib/scoring";

describe("scoring", () => {
  it("prior depends on external rating, then prominence", () => {
    expect(placePrior(4.3, 100)).toBe(4.3);
    expect(placePrior(null, 0)).toBe(3.5);
    expect(placePrior(null, 100)).toBe(4);
    expect(placePrior(undefined, 250)).toBe(4);
  });
  it("blends with n/(n+K) weight — matches the SQL smoke test values", () => {
    expect(blendScore(null, 0, 3.7)).toBe(3.7);
    expect(blendScore(5, 1, 3.7)).toBe(3.82);
    expect(blendScore(5, 10, 3.7)).toBe(4.35);
    expect(blendScore(5, 100, 3.7)).toBe(4.88);
    expect(userWeight(0)).toBe(0);
    expect(userWeight(10)).toBe(0.5);
  });
  it("one bad early rating barely moves a prominent place", () => {
    const before = blendScore(null, 0, placePrior(null, 80));
    const after = blendScore(1, 1, placePrior(null, 80));
    expect(before - after).toBeLessThan(0.3);
  });
  it("confidence tiers and display helpers", () => {
    expect(confidence(0)).toBe("none");
    expect(confidence(2)).toBe("low");
    expect(confidence(14)).toBe("medium");
    expect(confidence(15)).toBe("high");
    expect(toTenScale(3.82)).toBe(7.6);
    expect(toneFor(4.2)).toBe("good");
    expect(toneFor(3.2)).toBe("ok");
    expect(toneFor(2.1)).toBe("bad");
    expect(toneFor(4.5, 0)).toBe("neutral");
  });
});
