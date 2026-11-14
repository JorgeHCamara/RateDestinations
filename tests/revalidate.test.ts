import { describe, expect, it } from "vitest";
import { cityImportTags, REVALIDATE_TAG } from "@/lib/import/revalidate";

describe("import revalidation tags", () => {
  it("clears a city's guide, its place pages, the lists and the sitemap", () => {
    expect(cityImportTags(42)).toEqual(["city:42", "city-places:42", "city-directory", "sitemap"]);
  });

  it("accepts only our own tag shapes on /api/revalidate", () => {
    for (const ok of [
      "city:1",
      "city-places:9",
      "place:123",
      "city-slug:pt/lisbon",
      "trending",
      "sitemap",
    ])
      expect(REVALIDATE_TAG.test(ok), ok).toBe(true);
    for (const bad of ["city:", "city:abc", "everything", "place:1 ", "_N_T_/city/pt/lisbon", ""])
      expect(REVALIDATE_TAG.test(bad), bad).toBe(false);
  });
});
