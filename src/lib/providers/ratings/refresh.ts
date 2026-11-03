import { query } from "@/lib/db";
import { getRatingProvider } from "./index";

/**
 * Fetch or refresh external ratings for places whose stored rating is missing or older than
 * the provider allows. Stats are recomputed by the places_stats trigger on update.
 * Returns how many places were looked up. A no-op with the `none` provider.
 */
export async function refreshExternalRatings(
  limit = 50,
): Promise<{ provider: string; looked: number; found: number }> {
  const provider = getRatingProvider();
  if (provider.name === "none") return { provider: "none", looked: 0, found: 0 };

  const rows = await query<{
    id: number;
    name: string;
    lat: number;
    lng: number;
    category: string;
  }>(
    `select id, name, lat, lng, category::text from places
     where not adult and not hidden
       and (external_fetched_at is null or external_fetched_at < now() - make_interval(days => $2))
     order by prominence desc, external_fetched_at nulls first
     limit $1`,
    [limit, provider.maxCacheDays],
  );
  let found = 0;
  for (const place of rows) {
    const hit = await provider.lookup(place).catch(() => null);
    if (hit) {
      found++;
      await query(
        `update places set external_rating = $2, external_rating_count = $3, external_fetched_at = now(),
                tags = tags || jsonb_build_object('google_place_id', $4::text) where id = $1`,
        [place.id, hit.rating, hit.ratingCount, hit.sourceId],
      );
    } else {
      // Nothing matched (or the rating expired): clear it so a stale value is never shown past its term.
      await query(
        "update places set external_rating = null, external_rating_count = null, external_fetched_at = now() where id = $1",
        [place.id],
      );
    }
  }
  return { provider: provider.name, looked: rows.length, found };
}
