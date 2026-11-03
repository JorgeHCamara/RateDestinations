import { query, queryOne } from "@/lib/db";
import type { CityDimension } from "@/lib/dimensions";

/** Uncached, per-user reads: always behind a Suspense boundary in the UI. */

export type MyPlaceRating = { stars: number; tags: string[]; comment: string | null };

export async function getMyPlaceRating(
  userId: string,
  placeId: number,
): Promise<MyPlaceRating | null> {
  return queryOne<MyPlaceRating>(
    "select stars, tags, comment from place_ratings where user_id = $1 and place_id = $2",
    [userId, placeId],
  );
}

export type RaterRole = "local" | "visitor";

/** Whether the user said they live in the city or are visiting it, if they ever rated it. */
export async function getMyCityRole(userId: string, cityId: number): Promise<RaterRole | null> {
  const row = await queryOne<{ role: RaterRole }>(
    "select role from city_raters where user_id = $1 and city_id = $2",
    [userId, cityId],
  );
  return row?.role ?? null;
}

export async function getMyCityRatings(
  userId: string,
  cityId: number,
): Promise<Partial<Record<CityDimension, number>>> {
  const rows = await query<{ dimension: CityDimension; stars: number }>(
    "select dimension, stars from city_ratings where user_id = $1 and city_id = $2",
    [userId, cityId],
  );
  return Object.fromEntries(rows.map((r) => [r.dimension, r.stars]));
}

export type MyRatingRow = {
  kind: "place" | "city";
  id: number;
  stars: number;
  label: string; // place name or dimension
  city_name: string;
  city_slug: string;
  country_code: string;
  place_id: number | null;
  updated_at: string;
};

export async function getMyRatings(userId: string, limit = 100): Promise<MyRatingRow[]> {
  return query<MyRatingRow>(
    `select * from (
       select 'place'::text as kind, r.id, r.stars, p.name as label, c.name as city_name, c.slug as city_slug,
              c.country_code, p.id as place_id, r.updated_at::text as updated_at
       from place_ratings r join places p on p.id = r.place_id join cities c on c.id = p.city_id
       where r.user_id = $1 and not p.adult and not p.hidden
       union all
       select 'city', r.id, r.stars, r.dimension::text, c.name, c.slug, c.country_code, null, r.updated_at::text
       from city_ratings r join cities c on c.id = r.city_id
       where r.user_id = $1
     ) x order by updated_at desc limit $2`,
    [userId, limit],
  );
}
