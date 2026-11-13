import { cacheLife, cacheTag } from "next/cache";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db";
import { getCityDirectory, type DirectoryCity } from "@/lib/queries/cities";

export type Country = { code: string; name: string; continent: string | null };

/** A country page needs this many city guides to be worth a search result (and a sitemap entry). */
export const MIN_COUNTRY_GUIDES = 2;

export const CONTINENTS: Record<string, string> = {
  AF: "Africa",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
  AN: "Antarctica",
};

export function countryPath(code: string): string {
  return `/country/${code.toLowerCase()}`;
}

export async function getCountry(code: string): Promise<Country | null> {
  "use cache";
  cacheLife("reference");
  if (!/^[a-z]{2}$/i.test(code) || !isDatabaseConfigured()) return null;
  return queryOne<Country>(
    "select trim(code) as code, name, continent from countries where code = upper($1)",
    [code],
  );
}

/** The country's city guides, biggest city first (from the /cities list, so the two agree). */
export async function getCountryGuides(code: string): Promise<DirectoryCity[]> {
  const all = await getCityDirectory();
  return all
    .filter((c) => c.country_code.trim().toUpperCase() === code.toUpperCase())
    .sort((a, b) => b.population - a.population);
}

/** Every country with at least `min` city guides, with how many it has. */
export async function getCountriesWithGuides(
  min = 1,
): Promise<{ code: string; name: string; guides: number }[]> {
  const counts = new Map<string, { code: string; name: string; guides: number }>();
  for (const c of await getCityDirectory()) {
    const code = c.country_code.trim().toUpperCase();
    const entry = counts.get(code) ?? { code, name: c.country_name, guides: 0 };
    entry.guides++;
    counts.set(code, entry);
  }
  return [...counts.values()].filter((c) => c.guides >= min);
}

export type CityWithoutGuide = {
  id: number;
  name: string;
  country_code: string;
  slug: string;
  population: number;
};

/** The country's biggest cities nobody has opened yet: each guide builds on its first visit. */
export async function getCitiesWithoutGuide(code: string, limit = 24): Promise<CityWithoutGuide[]> {
  "use cache";
  cacheLife("guide");
  cacheTag("city-directory");
  if (!isDatabaseConfigured()) return [];
  try {
    return await query<CityWithoutGuide>(
      `select c.id, c.name, c.country_code, c.slug, c.population
       from cities c
       left join city_stats cs on cs.city_id = c.id
       where c.country_code = upper($1)
         and coalesce(cs.rating_count, 0) = 0
         and not exists (select 1 from places p where p.city_id = c.id and not p.adult and not p.hidden)
       order by c.population desc
       limit $2`,
      [code, limit],
    );
  } catch {
    return [];
  }
}
