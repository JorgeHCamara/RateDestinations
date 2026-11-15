import { describe, expect, it } from "vitest";
import { compareGuides, EMPTY_GUIDE, UNKNOWN_GUIDE } from "@/lib/import/guide-changes";
import { cityTags, DIRECTORY_TAGS, REVALIDATE_TAG } from "@/lib/import/revalidate";

describe("import revalidation", () => {
  it("names a city's guide tags, and the site-wide ones apart", () => {
    expect(cityTags(42)).toEqual(["city:42", "city-places:42"]);
    expect(DIRECTORY_TAGS).toEqual(["city-directory", "sitemap"]);
  });

  it("expires a city only when its guide changed, and the lists only when it gained or lost one", () => {
    expect(compareGuides("aaa", "aaa")).toEqual({ changed: false, directoryChanged: false });
    expect(compareGuides("aaa", "bbb")).toEqual({ changed: true, directoryChanged: false });
    expect(compareGuides(EMPTY_GUIDE, "bbb")).toEqual({ changed: true, directoryChanged: true });
    expect(compareGuides("", "bbb")).toEqual({ changed: true, directoryChanged: true });
    expect(compareGuides("aaa", EMPTY_GUIDE)).toEqual({ changed: true, directoryChanged: true });
    // without migration 0015: expire the city as before, never the site-wide lists
    expect(compareGuides(UNKNOWN_GUIDE, UNKNOWN_GUIDE)).toEqual({
      changed: true,
      directoryChanged: false,
    });
    expect(compareGuides(EMPTY_GUIDE, EMPTY_GUIDE)).toEqual({
      changed: false,
      directoryChanged: false,
    });
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
