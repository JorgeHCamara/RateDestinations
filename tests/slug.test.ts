import { describe, expect, it } from "vitest";
import { slugify, stripDiacritics } from "@/lib/slug";

describe("slug helpers", () => {
  it("strips diacritics", () => {
    expect(stripDiacritics("São Paulo")).toBe("Sao Paulo");
    expect(stripDiacritics("München")).toBe("Munchen");
    expect(stripDiacritics("Kraków")).toBe("Krakow");
  });
  it("slugifies", () => {
    expect(slugify("São Paulo")).toBe("sao-paulo");
    expect(slugify("Rio de Janeiro")).toBe("rio-de-janeiro");
    expect(slugify("  's-Hertogenbosch ")).toBe("s-hertogenbosch");
    expect(slugify("Saint-Étienne")).toBe("saint-etienne");
  });
});
