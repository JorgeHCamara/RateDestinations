import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
const hashes: string[] = [];
let due = false;
vi.mock("@/lib/import/guide-changes", async (orig) => ({
  ...(await orig<typeof import("@/lib/import/guide-changes")>()),
  guideHash: vi.fn(async () => hashes.shift() ?? ""),
  directoryTagsDue: vi.fn(async () => due),
}));

const { importWithRevalidation } = await import("@/lib/import/revalidate");
const { EMPTY_GUIDE } = await import("@/lib/import/guide-changes");

const expired = () => revalidateTag.mock.calls.map(([tag, profile]) => `${tag}@${profile}`);

describe("importWithRevalidation", () => {
  beforeEach(() => {
    revalidateTag.mockClear();
    hashes.length = 0;
    due = false;
  });

  it("on failure expires only the city page, and rethrows", async () => {
    hashes.push("aaa");
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

  it("expires the city's guide and place pages when it changed", async () => {
    hashes.push("aaa", "bbb");
    await importWithRevalidation(7, async () => ({ places: 10 }));
    expect(expired()).toEqual(["city:7@max", "city-places:7@max"]);
  });

  it("adds city-directory and sitemap only when they're due", async () => {
    hashes.push(EMPTY_GUIDE, "bbb");
    due = true;
    await importWithRevalidation(7, async () => ({ places: 10 }));
    expect(expired()).toEqual([
      "city:7@max",
      "city-places:7@max",
      "city-directory@max",
      "sitemap@max",
    ]);
  });
});
