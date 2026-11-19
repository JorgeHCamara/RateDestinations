import { revalidateTag } from "next/cache";
import {
  changedPlaceIds,
  compareGuides,
  directoryTagsDue,
  guideHash,
  placeHashes,
} from "./guide-changes";

/**
 * After an import, expire only what changed. Guide caches last days (next.config.ts cacheLife), so
 * tags are what show a new guide, and every expired tag costs a re-render (ISR writes).
 *
 * - The city's guide and category pages (city:<id>): only when the guide's content hash changed.
 * - Place pages (place:<id>): only those whose place changed or was removed, and none when more
 *   than MAX_PLACE_TAGS did (a new Overture release touches most of a city): those refresh with
 *   their cache lifetime. Never city-places:<id>, which would expire every place page in the city
 *   and have crawlers re-mint each one.
 * - The /cities list and sitemap (city-directory, sitemap): only when a city gained or lost its
 *   guide, and at most once in 24 hours (lib/import/guide-changes.ts).
 * - A failed import: only city:<id>, so the page can say it failed.
 *
 * Always stale-while-revalidate ("max"): the next visit gets the old page once, then the new one.
 */

/** More changed places than this in one city: expire none of their pages. */
export const MAX_PLACE_TAGS = 20;

/**
 * The tags to expire for a city whose guide changed (also what the Overture job sends to
 * /api/revalidate): its guide, plus the pages of the places that changed (null: unknown).
 */
export function cityTags(cityId: number, changedPlaces: number[] | null = null): string[] {
  const places =
    changedPlaces && changedPlaces.length <= MAX_PLACE_TAGS
      ? changedPlaces.map((id) => `place:${id}`)
      : [];
  return [`city:${cityId}`, ...places];
}

export const DIRECTORY_TAGS = ["city-directory", "sitemap"];

/** Run an import and expire what it changed. Rethrows the import's error. */
export async function importWithRevalidation<T>(cityId: number, run: () => Promise<T>): Promise<T> {
  const [before, placesBefore] = await Promise.all([guideHash(cityId), placeHashes(cityId)]);
  let result: T;
  try {
    result = await run();
  } catch (err) {
    revalidateTag(`city:${cityId}`, "max");
    throw err;
  }
  const after = await guideHash(cityId);
  const { changed, directoryChanged } = compareGuides(before, after);
  const tags = changed
    ? cityTags(cityId, changedPlaceIds(placesBefore, await placeHashes(cityId)))
    : [];
  if (await directoryTagsDue(directoryChanged)) tags.push(...DIRECTORY_TAGS);
  for (const tag of tags) revalidateTag(tag, "max");
  return result;
}

/** Tags /api/revalidate accepts: our own tag shapes only. */
export const REVALIDATE_TAG =
  /^(city:\d+|city-places:\d+|place:\d+|city-slug:[a-z]{2}\/[a-z0-9-]+|city-directory|sitemap|trending)$/;
