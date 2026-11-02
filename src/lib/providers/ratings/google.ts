import type { ExternalRating, ExternalRatingProvider, PlaceForLookup } from "./index";

/**
 * Google Places API (New) — Text Search with a location bias, requesting only the fields we
 * need so the call bills at the cheapest SKU that includes `rating`.
 *
 * Terms to respect (https://developers.google.com/maps/documentation/places/web-service/policies):
 *  - `places.id` may be cached indefinitely; every other field for at most 30 days
 *    (`maxCacheDays`). The refresh job re-fetches or clears ratings older than that.
 *  - Ratings shown must be attributed to Google where displayed (the place page shows
 *    "Google rating" when external_rating comes from this provider).
 */
const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

type SearchResponse = {
  places?: {
    id: string;
    rating?: number;
    userRatingCount?: number;
    displayName?: { text: string };
  }[];
};

export const googleProvider: ExternalRatingProvider = {
  name: "google",
  maxCacheDays: 30,
  isEnabled: () =>
    process.env.GOOGLE_PLACES_ENABLED === "true" && Boolean(process.env.GOOGLE_PLACES_API_KEY),

  async lookup(place: PlaceForLookup): Promise<ExternalRating | null> {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) return null;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.rating,places.userRatingCount,places.displayName",
      },
      body: JSON.stringify({
        textQuery: place.name,
        maxResultCount: 1,
        locationBias: {
          circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 250 },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as SearchResponse;
    const hit = data.places?.[0];
    if (!hit || hit.rating === undefined || !hit.userRatingCount) return null;
    return { sourceId: hit.id, rating: hit.rating, ratingCount: hit.userRatingCount };
  },
};
