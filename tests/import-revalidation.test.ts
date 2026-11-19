import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
const hashes: string[] = [];
const placeSnapshots: (Map<number, string> | null)[] = [];
let due = false;
vi.mock("@/lib/import/guide-changes", async (orig) => ({
  ...(await orig<typeof import("@/lib/import/guide-changes")>()),
  guideHash: vi.fn(async () => hashes.shift() ?? ""),
  placeHashes: vi.fn(async () => placeSnapshots.shift() ?? new Map()),
  directoryTagsDue: vi.fn(async () => due),
}));

const { importWithRevalidation } = await import("@/lib/import/revalidate");
const { EMPTY_GUIDE } = await import("@/lib/import/guide-changes");

const expired = () => revalidateTag.mock.calls.map(([tag, profile]) => `${tag}@${profile}`);

describe("importWithRevalidation", () => {
  beforeEach(() => {
    revalidateTag.mockClear();
    hashes.length = 0;
    placeSnapshots.length = 0;
    due = false;
  });

  it("on failure expires only the city page, and rethrows", async () => {
    hashes.push("aaa");
    due = true; // even with the lists due, a failure doesn't touch them
    await expect(
      importWithRevalidation(7, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(expired()).toEqual(["city:7@max"]);
  });

  it("expires nothing when the guide didn't change", async () => {
    hashes.push("aaa", "aaa");
    await importWithRevalidation(7, async () => ({ places: 10 }));
    expect(expired()).toEqual([]);
  });

  it("expires nothing when the guide didn't change, even if a place's phone did", async () => {
    hashes.push("aaa", "aaa");
    placeSnapshots.push(new Map([[1, "x"]]), new Map([[1, "y"]]));
    await importWithRevalidation(7, async () => ({ places: 10 }));
    expect(expired()).toEqual([]);
  });

  it("on a changed guide expires the city and only the changed places, never city-places", async () => {
    hashes.push("aaa", "bbb");
    placeSnapshots.push(
      new Map([
        [1, "x"],
        [2, "y"],
        [3, "z"],
      ]),
      new Map([
        [1, "x"],
        [2, "Y"],
        [5, "new"],
      ]),
    );
    await importWithRevalidation(7, async () => ({ places: 10 }));
    expect(expired()).toEqual(["city:7@max", "place:2@max", "place:3@max"]);
  });

  it("expires no place pages when a rebuild refreshes most of the city", async () => {
    hashes.push("aaa", "bbb");
    const ids = Array.from({ length: 300 }, (_, i) => i + 1);
    placeSnapshots.push(
      new Map(ids.map((id) => [id, "old"])),
      new Map(ids.map((id) => [id, "new"])),
    );
    await importWithRevalidation(7, async () => ({ places: 10 }));
    expect(expired()).toEqual(["city:7@max"]);
  });

  it("adds city-directory and sitemap only when they're due", async () => {
    hashes.push(EMPTY_GUIDE, "bbb");
    due = true;
    await importWithRevalidation(7, async () => ({ places: 10 }));
    expect(expired()).toEqual(["city:7@max", "city-directory@max", "sitemap@max"]);
  });
});
