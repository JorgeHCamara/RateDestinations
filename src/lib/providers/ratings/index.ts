/**
 * External rating providers. The platform's own ratings always take over as they accumulate
 * (see lib/scoring.ts); a provider only supplies the *prior* for places nobody has rated yet.
 *
 * Today: `none` (free data only). Later: `google` (Google Places API (New)), switched on with
 * GOOGLE_PLACES_ENABLED=true and GOOGLE_PLACES_API_KEY.
 */
export type PlaceForLookup = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  category: string;
};

export type ExternalRating = {
  /** The provider's own id for the place; may be stored indefinitely. */
  sourceId: string;
  rating: number; // 1..5
  ratingCount: number;
};

export interface ExternalRatingProvider {
  readonly name: "none" | "google";
  isEnabled(): boolean;
  /** Best-effort lookup; null when the provider can't match the place. */
  lookup(place: PlaceForLookup): Promise<ExternalRating | null>;
  /** How long a fetched rating may be stored before it must be refreshed or dropped. */
  readonly maxCacheDays: number;
}

import { googleProvider } from "./google";
import { noneProvider } from "./none";

export function getRatingProvider(): ExternalRatingProvider {
  return googleProvider.isEnabled() ? googleProvider : noneProvider;
}
