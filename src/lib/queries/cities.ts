import { cacheLife, cacheTag } from "next/cache";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db";
import type { PlaceCategory } from "@/lib/import/categories";
import type { CityDimension } from "@/lib/dimensions";

export type City = {
  id: number;
  name: string;
  ascii_name: string;
  country_code: string;
  country_name: string;
  continent: string | null;
  admin1: string | null;
  population: number;
  lat: number;
  lng: number;
  slug: string;
  timezone: string | null;
  import_status: "none" | "pending" | "done" | "failed";
  imported_at: string | null;
};

export type CitySearchHit = {
  id: number;
  name: string;
  country_code: string;
  country_name: string;
  admin1: string | null;
  population: number;
  slug: string;
  score: number;
};

export type DimensionStat = { avg: number; count: number; score: number };
export type CityStats = {
  dimensions: Partial<Record<CityDimension, DimensionStat>>;
  overall: number | null;
  rating_count: number;
  rater_count: number;
  /** People who said they live in the city / are visiting it (see migration 0006). */
  local_count: number;
  visitor_count: number;
  /** The city's overall score from locals only / visitors only. */
  local_overall: number | null;
  visitor_overall: number | null;
};

export { CITY_DIMENSIONS, DIMENSION_META } from "@/lib/dimensions";
export type { CityDimension } from "@/lib/dimensions";

export type TopPlace = {
  id: number;
  name: string;
  category: PlaceCategory;
  subcategory: string | null;
  lat: number;
  lng: number;
  website: string | null;
  prominence: number;
  blended_score: number;
  user_avg: number | null;
  user_count: number;
  warning_count: number;
  rank: number;
};

export type WatchOutPlace = {
  id: number;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  blended_score: number;
  user_avg: number | null;
  user_count: number;
  warning_count: number;
  tag_counts: Record<string, number>;
};

/** Uncached: tiny indexed lookup. Its imported_at doubles as the cache version for the guide. */
export async function getCityBySlug(countryCode: string, slug: string): Promise<City | null> {
  return queryOne<City>(
    `select c.id, c.name, c.ascii_name, c.country_code, co.name as country_name, co.continent, c.admin1,
            c.population, c.lat, c.lng, c.slug, c.timezone, c.import_status, c.imported_at::text as imported_at
     from cities c join countries co on co.code = c.country_code
     where c.country_code = upper($1) and c.slug = $2`,
    [countryCode, slug],
  );
}

export async function getCityById(id: number): Promise<City | null> {
  return queryOne<City>(
    `select c.id, c.name, c.ascii_name, c.country_code, co.name as country_name, co.continent, c.admin1,
            c.population, c.lat, c.lng, c.slug, c.timezone, c.import_status, c.imported_at::text as imported_at
     from cities c join countries co on co.code = c.country_code where c.id = $1`,
    [id],
  );
}

export async function searchCities(q: string, limit = 8): Promise<CitySearchHit[]> {
  "use cache";
  cacheLife("minutes");
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  return query<CitySearchHit>("select * from search_cities($1, $2)", [trimmed.slice(0, 80), limit]);
}

export type TrendingCity = {
  id: number;
  name: string;
  country_code: string;
  country_name: string;
  slug: string;
  population: number;
  overall: number | null;
  rating_count: number;
  place_count: number;
};

export async function getTrendingCities(limit = 12): Promise<TrendingCity[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("trending");
  if (!isDatabaseConfigured()) return [];
  try {
    return await query<TrendingCity>("select * from trending_cities($1)", [limit]);
  } catch {
    return [];
  }
}

// Lisbon, Tokyo, Mexico City, Cape Town, New York, Barcelona, Bangkok, Buenos Aires
const FEATURED_GEONAMES_IDS = [
  2267057, 1850147, 3530597, 3369157, 5128581, 3128760, 1609350, 3435910,
];
const FEATURED_FALLBACK = [
  ["pt", "lisbon"],
  ["jp", "tokyo"],
  ["mx", "mexico-city"],
  ["za", "cape-town"],
  ["us", "new-york-city"],
  ["es", "barcelona"],
  ["th", "bangkok"],
  ["ar", "buenos-aires"],
] as const;

/**
 * The featured cities' URL params, for generateStaticParams. Reads only the cities table, and falls
 * back to a fixed list when the database can't answer: with Cache Components an empty list fails
 * the build, and a build must not depend on the database being reachable or fully migrated.
 */
export async function getFeaturedCityParams(): Promise<{ country: string; slug: string }[]> {
  if (isDatabaseConfigured()) {
    try {
      const rows = await query<{ country_code: string; slug: string }>(
        `select country_code, slug from cities where geonames_id = any($1::int[])
         order by array_position($1::int[], geonames_id)`,
        [FEATURED_GEONAMES_IDS],
      );
      if (rows.length)
        return rows.map((r) => ({ country: r.country_code.toLowerCase(), slug: r.slug }));
    } catch {
      // fall through
    }
  }
  return FEATURED_FALLBACK.map(([country, slug]) => ({ country, slug }));
}

/** A handful of big cities to show on the home page before anyone has visited anything. */
export async function getFeaturedCities(): Promise<TrendingCity[]> {
  "use cache";
  cacheLife("days");
  if (!isDatabaseConfigured()) return [];
  try {
    return await query<TrendingCity>(
      `select c.id, c.name, c.country_code, co.name as country_name, c.slug, c.population,
              cs.overall, coalesce(cs.rating_count, 0) as rating_count,
              (select count(*) from places p where p.city_id = c.id and not p.adult and not p.hidden) as place_count
       from cities c join countries co on co.code = c.country_code
       left join city_stats cs on cs.city_id = c.id
       where c.geonames_id = any($1::int[])
       order by array_position($1::int[], c.geonames_id)`,
      [FEATURED_GEONAMES_IDS],
    );
  } catch {
    return [];
  }
}

/** Everything the city guide page needs, cached per city and per import version. */
export async function getCityGuide(cityId: number, version: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`city:${cityId}`);
  void version; // part of the cache key: a re-import changes imported_at and busts this entry
  const [top, watchOut, stats, counts] = await Promise.all([
    query<TopPlace>("select * from city_top_places($1, 6)", [cityId]),
    query<WatchOutPlace>("select * from city_watch_out($1, 12)", [cityId]),
    getCityStats(cityId),
    query<{ category: PlaceCategory; n: number }>(
      "select category, count(*)::int as n from places where city_id = $1 and not adult and not hidden group by category",
      [cityId],
    ),
  ]);
  const byCategory = new Map<PlaceCategory, TopPlace[]>();
  for (const p of top) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  return {
    byCategory,
    watchOut,
    stats,
    counts: Object.fromEntries(counts.map((c) => [c.category, c.n])) as Partial<
      Record<PlaceCategory, number>
    >,
    placeCount: counts.reduce((a, c) => a + c.n, 0),
  };
}

export async function getCityStats(cityId: number): Promise<CityStats> {
  const row = await queryOne<CityStats>(
    `select dimensions, overall, rating_count, rater_count,
            local_count, visitor_count, local_overall, visitor_overall
     from city_stats where city_id = $1`,
    [cityId],
  );
  return (
    row ?? {
      dimensions: {},
      overall: null,
      rating_count: 0,
      rater_count: 0,
      local_count: 0,
      visitor_count: 0,
      local_overall: null,
      visitor_overall: null,
    }
  );
}

export type CategoryPlace = TopPlace & { address: string | null; opening_hours: string | null };

export async function getCityCategory(cityId: number, category: PlaceCategory, version: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`city:${cityId}`);
  void version;
  return query<CategoryPlace>(
    `select p.id, p.name, p.category, p.subcategory, p.lat, p.lng, p.website, p.prominence, p.address, p.opening_hours,
            s.blended_score, s.user_avg, s.user_count, s.warning_count,
            row_number() over (order by s.blended_score desc, p.prominence desc, p.location <-> c.location, p.name)::int as rank
     from places p join place_stats s on s.place_id = p.id join cities c on c.id = p.city_id
     where p.city_id = $1 and p.category = $2 and not p.adult and not p.hidden
     order by rank limit 200`,
    [cityId, category],
  );
}

/** For sitemaps and generateStaticParams: the biggest cities. */
export async function getTopCitySlugs(limit = 200) {
  if (!isDatabaseConfigured()) return [];
  try {
    return await query<{ country_code: string; slug: string; imported_at: string | null }>(
      "select country_code, slug, imported_at::text from cities order by population desc limit $1",
      [limit],
    );
  } catch {
    return [];
  }
}

/** Cached minimal city lookup for metadata and breadcrumbs (names don't change). */
export async function getCityBasic(countryCode: string, slug: string) {
  "use cache";
  cacheLife("days");
  return queryOne<{
    id: number;
    name: string;
    country_code: string;
    country_name: string;
    admin1: string | null;
    population: number;
    lat: number;
    lng: number;
  }>(
    `select c.id, c.name, c.country_code, co.name as country_name, c.admin1, c.population, c.lat, c.lng
     from cities c join countries co on co.code = c.country_code
     where c.country_code = upper($1) and c.slug = $2`,
    [countryCode, slug],
  );
}
