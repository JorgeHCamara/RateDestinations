import { cacheLife, cacheTag } from "next/cache";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db";
import type { PlaceCategory } from "@/lib/import/categories";

/**
 * What search engines are told about. Only pages with something on them: a city whose guide has
 * places (or ratings), a category list with a few places, a place someone has rated. The ~30,000
 * cities nobody has opened yet show only "Building this guide…", so they are left out of the
 * sitemap and marked noindex until their guide exists.
 */

/** A category page needs this many places to be worth a search result. */
export const MIN_CATEGORY_PLACES = 3;
/** Google reads at most 50,000 URLs per sitemap file. */
const MAX_URLS = 50_000;

export type SitemapRows = {
  cities: { country_code: string; slug: string; updated: string | null; population: number }[];
  categories: {
    country_code: string;
    slug: string;
    category: PlaceCategory;
    updated: string | null;
  }[];
  places: { id: number; updated: string }[];
};

export async function getSitemapRows(): Promise<SitemapRows> {
  "use cache";
  cacheLife("hours");
  cacheTag("sitemap");
  if (!isDatabaseConfigured()) return { cities: [], categories: [], places: [] };
  const cities = await query<SitemapRows["cities"][number]>(
    `select c.country_code, c.slug, greatest(c.imported_at, cs.updated_at)::text as updated, c.population
     from cities c left join city_stats cs on cs.city_id = c.id
     where coalesce(cs.rating_count, 0) > 0
        or exists (select 1 from places p where p.city_id = c.id and not p.adult and not p.hidden)
     order by c.population desc
     limit $1`,
    [MAX_URLS],
  );
  const categories = await query<SitemapRows["categories"][number]>(
    `select c.country_code, c.slug, p.category::text as category, c.imported_at::text as updated
     from places p join cities c on c.id = p.city_id
     where not p.adult and not p.hidden
     group by c.id, c.country_code, c.slug, p.category, c.imported_at, c.population
     having count(*) >= $1
     order by c.population desc, p.category
     limit $2`,
    [MIN_CATEGORY_PLACES, Math.max(0, MAX_URLS - 1 - cities.length)],
  );
  const places = await query<SitemapRows["places"][number]>(
    `select p.id, s.updated_at::text as updated
     from places p join place_stats s on s.place_id = p.id
     where s.user_count > 0 and not p.adult and not p.hidden
     order by s.user_count desc, p.id
     limit $1`,
    [Math.max(0, MAX_URLS - 1 - cities.length - categories.length)],
  );
  return { cities, categories, places };
}

/** Whether a city's page has anything on it besides "Building this guide…". */
export async function cityHasContent(cityId: number): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `select exists (select 1 from places where city_id = $1 and not adult and not hidden)
         or exists (select 1 from city_stats where city_id = $1 and rating_count > 0) as ok`,
    [cityId],
  );
  return Boolean(row?.ok);
}
