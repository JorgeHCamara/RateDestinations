import { revalidateTag } from "next/cache";
import { compareGuides, directoryTagsDue, guideHash } from "./guide-changes";

/**
 * After an import, expire only what changed. Guide caches last days (next.config.ts cacheLife), so
 * tags are what show a new guide, and every expired tag costs a re-render (ISR writes).
 *
 * - The city's guide and place pages (city:<id>, city-places:<id>): only when the guide's content
 *   hash changed.
 * - The /cities list and sitemap (city-directory, sitemap): only when a city gained or lost its
 *   guide, and at most once in 24 hours (lib/import/guide-changes.ts).
 * - A failed import: only city:<id>, so the page can say it failed.
 *
 * Always stale-while-revalidate ("max"): the next visit gets the old page once, then the new one.
 */

/** The tags a city's guide uses (also what the Overture job sends to /api/revalidate). */
export function cityTags(cityId: number): string[] {
  return [`city:${cityId}`, `city-places:${cityId}`];
}

export const DIRECTORY_TAGS = ["city-directory", "sitemap"];

/** Run an import and expire what it changed. Rethrows the import's error. */
export async function importWithRevalidation<T>(cityId: number, run: () => Promise<T>): Promise<T> {
  const before = await guideHash(cityId);
  let result: T;
  try {
    result = await run();
  } catch (err) {
    revalidateTag(`city:${cityId}`, "max");
    throw err;
  }
  const after = await guideHash(cityId);
  const { changed, directoryChanged } = compareGuides(before, after);
  const tags = changed ? cityTags(cityId) : [];
  if (await directoryTagsDue(directoryChanged)) tags.push(...DIRECTORY_TAGS);
  for (const tag of tags) revalidateTag(tag, "max");
  return result;
}

/** Tags /api/revalidate accepts: our own tag shapes only. */
export const REVALIDATE_TAG =
  /^(city:\d+|city-places:\d+|place:\d+|city-slug:[a-z]{2}\/[a-z0-9-]+|city-directory|sitemap|trending)$/;
