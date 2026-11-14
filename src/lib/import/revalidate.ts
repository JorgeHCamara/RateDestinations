import { revalidateTag } from "next/cache";

/**
 * Tags to clear after a city's places change (an import or re-import): its guide and lookups
 * (city:<id>), its place pages (city-places:<id>), the /cities and country lists
 * (city-directory) and the sitemap. Guide caches last days (next.config.ts cacheLife), so this,
 * not time, is what shows a new guide.
 */
export function cityImportTags(cityId: number): string[] {
  return [`city:${cityId}`, `city-places:${cityId}`, "city-directory", "sitemap"];
}

/** Clear them (stale-while-revalidate: the next visit gets the old page once, then the new one). */
export function revalidateCityImport(cityId: number): void {
  for (const tag of cityImportTags(cityId)) revalidateTag(tag, "max");
}

/** Tags /api/revalidate accepts: our own tag shapes only. */
export const REVALIDATE_TAG =
  /^(city:\d+|city-places:\d+|place:\d+|city-slug:[a-z]{2}\/[a-z0-9-]+|city-directory|sitemap|trending)$/;
