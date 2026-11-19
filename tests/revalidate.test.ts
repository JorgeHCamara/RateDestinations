import { describe, expect, it } from "vitest";
import {
  changedPlaceIds,
  compareGuides,
  EMPTY_GUIDE,
  UNKNOWN_GUIDE,
} from "@/lib/import/guide-changes";
import { cityTags, DIRECTORY_TAGS, MAX_PLACE_TAGS, REVALIDATE_TAG } from "@/lib/import/revalidate";

describe("import revalidation", () => {
  it("names a city's guide tags, and the site-wide ones apart", () => {
    expect(cityTags(42)).toEqual(["city:42"]);
    expect(cityTags(42, [7, 9])).toEqual(["city:42", "place:7", "place:9"]);
    expect(DIRECTORY_TAGS).toEqual(["city-directory", "sitemap"]);
  });

  it("never expires every place page in a city", () => {
    const many = Array.from({ length: MAX_PLACE_TAGS + 1 }, (_, i) => i + 1);
    expect(MAX_PLACE_TAGS).toBe(20);
    expect(cityTags(42, many)).toEqual(["city:42"]); // a whole-release refresh: cache lifetime
    expect(cityTags(42, many.slice(0, 20))).toHaveLength(21);
    expect(cityTags(42, null)).toEqual(["city:42"]); // unknown: none
    for (const ids of [[], [1], many, null])
      expect(cityTags(42, ids).some((t) => t.startsWith("city-places:"))).toBe(false);
  });

  it("finds the places whose page changed: edited or removed, not new", () => {
    const before = new Map([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
    const after = new Map([
      [1, "a"], // same
      [2, "B"], // edited
      [4, "d"], // new: no cached page yet
    ]);
    expect(changedPlaceIds(before, after)).toEqual([2, 3]); // 3 was removed
    expect(changedPlaceIds(before, before)).toEqual([]);
    expect(changedPlaceIds(null, after)).toBeNull();
    expect(changedPlaceIds(before, null)).toBeNull();
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
