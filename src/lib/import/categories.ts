/**
 * OpenStreetMap tag → RateDestinations category mapping, and the "prominence" heuristic
 * used as a rating prior before the community has rated a place.
 */
export const PLACE_CATEGORIES = [
  "restaurant",
  "cafe",
  "bar",
  "nightlife",
  "park",
  "attraction",
  "museum",
  "viewpoint",
  "beach",
  "market",
  "shopping",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export type OsmTags = Record<string, string>;

export const CATEGORY_META: Record<
  PlaceCategory,
  { label: string; plural: string; emoji: string; blurb: string }
> = {
  restaurant: { label: "Restaurant", plural: "Restaurants", emoji: "🍽️", blurb: "Where to eat" },
  cafe: {
    label: "Café",
    plural: "Cafés & bakeries",
    emoji: "☕",
    blurb: "Coffee, pastries, slow mornings",
  },
  bar: { label: "Bar", plural: "Bars & pubs", emoji: "🍻", blurb: "Drinks after dark" },
  nightlife: {
    label: "Nightlife",
    plural: "Nightlife",
    emoji: "🪩",
    blurb: "Clubs and late nights",
  },
  park: { label: "Park", plural: "Parks & gardens", emoji: "🌳", blurb: "Green space to breathe" },
  attraction: {
    label: "Attraction",
    plural: "Sights & landmarks",
    emoji: "🏛️",
    blurb: "The must-sees",
  },
  museum: {
    label: "Museum",
    plural: "Museums & galleries",
    emoji: "🖼️",
    blurb: "Culture and history",
  },
  viewpoint: { label: "Viewpoint", plural: "Viewpoints", emoji: "🌄", blurb: "Best views in town" },
  beach: { label: "Beach", plural: "Beaches", emoji: "🏖️", blurb: "Sand and sea" },
  market: { label: "Market", plural: "Markets", emoji: "🧺", blurb: "Local food and crafts" },
  shopping: {
    label: "Shopping",
    plural: "Shopping",
    emoji: "🛍️",
    blurb: "Malls and department stores",
  },
};

const HISTORIC_ATTRACTIONS = new Set([
  "castle",
  "monument",
  "memorial",
  "ruins",
  "palace",
  "fort",
  "archaeological_site",
  "city_gate",
  "tower",
  "citywalls",
  "aqueduct",
  "church",
  "cathedral",
  "monastery",
]);

function has(tags: OsmTags, key: string) {
  return typeof tags[key] === "string" && tags[key].length > 0;
}

/** Map OSM tags to a category. Returns null for things we don't list. */
export function classify(
  tags: OsmTags,
): { category: PlaceCategory; subcategory: string | null } | null {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  const historic = tags.historic;
  const shop = tags.shop;
  const natural = tags.natural;

  if (tourism === "museum") return { category: "museum", subcategory: tags.museum ?? null };
  if (tourism === "gallery") return { category: "museum", subcategory: "gallery" };
  if (tourism === "viewpoint") return { category: "viewpoint", subcategory: null };
  if (natural === "beach") return { category: "beach", subcategory: tags.surface ?? null };
  if (amenity === "marketplace") return { category: "market", subcategory: null };
  if (shop === "mall") return { category: "shopping", subcategory: "mall" };
  if (shop === "department_store") return { category: "shopping", subcategory: "department store" };

  if (amenity === "restaurant") return { category: "restaurant", subcategory: cuisine(tags) };
  if (amenity === "food_court") return { category: "restaurant", subcategory: "food court" };
  if (amenity === "cafe") return { category: "cafe", subcategory: cuisine(tags) };
  if (amenity === "ice_cream") return { category: "cafe", subcategory: "ice cream" };
  if (shop === "bakery" || shop === "pastry") return { category: "cafe", subcategory: "bakery" };
  if (amenity === "bar") return { category: "bar", subcategory: tags.bar ?? null };
  if (amenity === "pub") return { category: "bar", subcategory: "pub" };
  if (amenity === "biergarten") return { category: "bar", subcategory: "beer garden" };
  if (craftIs(tags, "brewery") || tags.microbrewery === "yes")
    return { category: "bar", subcategory: "brewery" };
  if (amenity === "nightclub") return { category: "nightlife", subcategory: "club" };
  if (amenity === "casino") return { category: "nightlife", subcategory: "casino" };
  if (amenity === "music_venue") return { category: "nightlife", subcategory: "live music" };

  if (leisure === "park") return { category: "park", subcategory: null };
  if (leisure === "garden") return { category: "park", subcategory: "garden" };
  if (leisure === "nature_reserve") return { category: "park", subcategory: "nature reserve" };
  if (tourism === "zoo") return { category: "attraction", subcategory: "zoo" };
  if (tourism === "aquarium") return { category: "attraction", subcategory: "aquarium" };
  if (tourism === "theme_park") return { category: "attraction", subcategory: "theme park" };
  if (tourism === "attraction") return { category: "attraction", subcategory: historic ?? null };
  if (historic && HISTORIC_ATTRACTIONS.has(historic))
    return { category: "attraction", subcategory: historic.replace(/_/g, " ") };
  if (amenity === "theatre") return { category: "attraction", subcategory: "theatre" };
  // Places of worship only when they're notable enough to be documented.
  if (
    amenity === "place_of_worship" &&
    (has(tags, "wikidata") || has(tags, "wikipedia") || has(tags, "heritage"))
  ) {
    return { category: "attraction", subcategory: tags.building ?? "place of worship" };
  }
  return null;
}

function cuisine(tags: OsmTags): string | null {
  if (!tags.cuisine) return null;
  return tags.cuisine.split(";")[0].replace(/_/g, " ").trim() || null;
}

function craftIs(tags: OsmTags, value: string) {
  return tags.craft === value;
}

/**
 * Prominence 0..100. A documentation-richness proxy for "people care about this place",
 * used as the rating prior until the community has rated it. Wikidata sitelinks are added
 * separately by lib/import/wikidata.ts.
 */
export function baseProminence(tags: OsmTags): number {
  let p = 0;
  if (has(tags, "website") || has(tags, "contact:website") || has(tags, "url")) p += 15;
  if (has(tags, "opening_hours")) p += 10;
  if (has(tags, "phone") || has(tags, "contact:phone")) p += 8;
  if (has(tags, "wikipedia") || has(tags, "wikidata")) p += 25;
  if (has(tags, "cuisine") || has(tags, "description")) p += 7;
  if (has(tags, "heritage")) p += 10;
  if (has(tags, "image") || has(tags, "wikimedia_commons")) p += 5;
  return Math.min(100, p);
}

/** Prefer an English name for a global audience, keep the local one in tags. */
export function displayName(tags: OsmTags): string | null {
  const name = tags["name:en"] || tags.int_name || tags.name;
  return name ? name.trim() : null;
}

export function formatAddress(tags: OsmTags): string | null {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const parts = [street, tags["addr:city"] ?? tags["addr:suburb"]].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
