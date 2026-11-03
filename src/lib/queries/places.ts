import { cacheLife, cacheTag } from "next/cache";
import { query, queryOne } from "@/lib/db";
import type { PlaceCategory } from "@/lib/import/categories";

export type Place = {
  id: number;
  city_id: number;
  city_name: string;
  city_slug: string;
  country_code: string;
  country_name: string;
  source: "osm" | "google";
  source_id: string;
  name: string;
  category: PlaceCategory;
  subcategory: string | null;
  lat: number;
  lng: number;
  address: string | null;
  website: string | null;
  phone: string | null;
  opening_hours: string | null;
  wikidata_id: string | null;
  wikipedia: string | null;
  prominence: number;
  external_rating: number | null;
  external_rating_count: number | null;
  tags: Record<string, string>;
  user_avg: number | null;
  user_count: number;
  warning_count: number;
  tag_counts: Record<string, number>;
  blended_score: number;
  image_url: string | null;
  image_source: "commons" | "website" | null;
  image_credit: string | null;
  image_page: string | null;
  image_checked: boolean;
};

export type PlaceReview = {
  id: number;
  stars: number;
  tags: string[];
  comment: string | null;
  created_at: string;
  display_name: string | null;
  /** Whether the reviewer said they live in the place's city (from their city rating). */
  rater_role: "local" | "visitor" | null;
  /** How many places the reviewer has rated, and when they joined: shown so readers can judge. */
  reviewer_ratings: number;
  member_since: string | null;
};

export async function getPlace(placeId: number): Promise<Place | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`place:${placeId}`);
  return queryOne<Place>(
    `select p.id, p.city_id, c.name as city_name, c.slug as city_slug, c.country_code, co.name as country_name,
            p.source, p.source_id, p.name, p.category, p.subcategory, p.lat, p.lng, p.address, p.website, p.phone,
            p.opening_hours, p.wikidata_id, p.wikipedia, p.prominence, p.external_rating, p.external_rating_count, p.tags,
            s.user_avg, s.user_count, s.warning_count, s.tag_counts, s.blended_score,
            p.image_url, p.image_source, p.image_credit, p.image_page,
            p.image_checked_at is not null as image_checked
     from places p
     join cities c on c.id = p.city_id
     join countries co on co.code = c.country_code
     join place_stats s on s.place_id = p.id
     where p.id = $1 and not p.adult and not p.hidden`,
    [placeId],
  );
}

export async function getPlaceReviews(placeId: number, limit = 20): Promise<PlaceReview[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(`place:${placeId}`);
  return query<PlaceReview>(
    `select r.id, r.stars, r.tags, r.comment, r.created_at::text as created_at, pr.display_name,
            cr.role as rater_role,
            (select count(*)::int from place_ratings x where x.user_id = r.user_id) as reviewer_ratings,
            pr.created_at::text as member_since
     from place_ratings r
     join places p on p.id = r.place_id
     left join profiles pr on pr.id = r.user_id
     left join city_raters cr on cr.city_id = p.city_id and cr.user_id = r.user_id
     where r.place_id = $1
     order by (r.comment is not null) desc, r.updated_at desc
     limit $2`,
    [placeId, limit],
  );
}

export type NearbyPlace = {
  id: number;
  name: string;
  category: PlaceCategory;
  blended_score: number;
  user_avg: number | null;
  user_count: number;
  distance_m: number;
};

export async function getNearbyPlaces(placeId: number, limit = 6): Promise<NearbyPlace[]> {
  "use cache";
  cacheLife("days");
  cacheTag(`place:${placeId}`);
  return query<NearbyPlace>(
    `select q.id, q.name, q.category, s.blended_score, s.user_avg, s.user_count,
            st_distance(q.location, p.location)::int as distance_m
     from places p
     join places q on q.city_id = p.city_id and q.id <> p.id
     join place_stats s on s.place_id = q.id
     where p.id = $1 and st_dwithin(q.location, p.location, 1500) and not q.adult and not q.hidden
     order by s.blended_score desc, distance_m asc
     limit $2`,
    [placeId, limit],
  );
}

export type RatingTag = { tag: string; label: string; is_warning: boolean };

export async function getRatingTags(): Promise<RatingTag[]> {
  "use cache";
  cacheLife("max");
  return query<RatingTag>(
    "select tag, label, is_warning from rating_tags order by is_warning, tag",
  );
}
