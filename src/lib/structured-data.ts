/**
 * Search-engine text and schema.org data (JSON-LD) for the public pages. Pure functions, so the
 * pages stay readable and the output is unit-tested.
 *
 * Star ratings in Google results ("review snippets") are only offered for businesses
 * (LocalBusiness and its kinds: restaurants, cafés, bars, shops), so only those get an
 * aggregateRating; parks, museums and sights are described without one.
 */
import { CATEGORY_META, type PlaceCategory } from "@/lib/import/categories";
import { toTenScale } from "@/lib/scoring";
import { absoluteUrl } from "@/lib/site-url";

export const SITE_NAME = "RateDestinations";

type JsonLd = Record<string, unknown>;

const SCHEMA_TYPE: Record<PlaceCategory, string> = {
  restaurant: "Restaurant",
  cafe: "CafeOrCoffeeShop",
  bar: "BarOrPub",
  nightlife: "NightClub",
  shopping: "Store",
  market: "LocalBusiness",
  park: "Park",
  museum: "Museum",
  attraction: "TouristAttraction",
  viewpoint: "TouristAttraction",
  beach: "Beach",
};
const BUSINESS = new Set<PlaceCategory>([
  "restaurant",
  "cafe",
  "bar",
  "nightlife",
  "shopping",
  "market",
]);

export function cityPath(countryCode: string, slug: string): string {
  return `/city/${countryCode.toLowerCase()}/${slug}`;
}

const n = (x: number) => x.toLocaleString("en-US");

/** "A, B and C" */
function list(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** At most `max` characters, cut at a word. */
export function clip(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:—-]+$/, "")}…`;
}

export function cityTitle(city: { name: string; country_name: string }): string {
  return `${city.name}, ${city.country_name}: best places and what to avoid`;
}

/** The city's search snippet, naming a few of its best-known places when it has them. */
export function cityDescription(
  city: { name: string; country_name: string },
  guide: { placeCount: number; ratingCount: number; topNames: string[] } | null,
): string {
  const people = guide?.ratingCount
    ? `rated ${guide.ratingCount === 1 ? "once" : `${n(guide.ratingCount)} times`} by locals and travellers`
    : "rated by locals and travellers";
  if (!guide || guide.placeCount === 0)
    return clip(
      `${city.name}, ${city.country_name}: what is worth your time and what to avoid — safety, cleanliness, food and scams, ${people}.`,
    );
  const top = guide.topNames.length ? ` Top picks: ${list(guide.topNames.slice(0, 3))}.` : "";
  return clip(
    `${city.name} guide: ${n(guide.placeCount)} places to eat, drink and see, and what to avoid, ${people}.${top}`,
  );
}

export function categoryTitle(
  category: PlaceCategory,
  city: { name: string; country_name: string },
) {
  return `Best ${CATEGORY_META[category].plural.toLowerCase()} in ${city.name}, ${city.country_name}`;
}

export function categoryDescription(
  category: PlaceCategory,
  city: { name: string; country_name: string },
  count: number,
  topNames: string[],
): string {
  const plural = CATEGORY_META[category].plural.toLowerCase();
  const top = topNames.length ? ` Including ${list(topNames.slice(0, 3))}.` : "";
  return clip(
    `${n(count)} ${plural} in ${city.name}, ${city.country_name}, ranked by locals and travellers, with warnings about tourist traps.${top}`,
  );
}

type PlaceForSeo = {
  id: number;
  name: string;
  category: PlaceCategory;
  subcategory: string | null;
  city_name: string;
  country_name: string;
  user_avg: number | null;
  user_count: number;
};

export function placeTitle(place: PlaceForSeo): string {
  return `${place.name}, ${place.city_name}: ratings and warnings`;
}

export function placeDescription(place: PlaceForSeo): string {
  const kind = CATEGORY_META[place.category].label.toLowerCase();
  const article = /^[aeiou]/.test(kind) ? "an" : "a";
  const rated =
    place.user_count > 0 && place.user_avg != null
      ? `Scores ${toTenScale(Number(place.user_avg)).toFixed(1)}/10 from ${place.user_count} ${place.user_count === 1 ? "rating" : "ratings"}.`
      : "Not rated yet: be the first to say what it's really like.";
  return clip(
    `${place.name}, ${article} ${kind} in ${place.city_name}, ${place.country_name}. ${rated} Honest ratings and warnings from locals and travellers.`,
  );
}

// ---- JSON-LD ----

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        url: absoluteUrl("/"),
        name: SITE_NAME,
        alternateName: "Rate Destinations",
        publisher: { "@id": absoluteUrl("/#organization") },
      },
      {
        "@type": "Organization",
        "@id": absoluteUrl("/#organization"),
        name: SITE_NAME,
        url: absoluteUrl("/"),
        logo: absoluteUrl("/email/logo.png"),
      },
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function cityJsonLd(
  city: {
    name: string;
    country_name: string;
    lat: number;
    lng: number;
    country_code: string;
    slug: string;
  },
  description: string,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": ["City", "TouristDestination"],
    name: city.name,
    description,
    url: absoluteUrl(cityPath(city.country_code, city.slug)),
    geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng },
    containedInPlace: { "@type": "Country", name: city.country_name },
  };
}

export function placeJsonLd(
  place: PlaceForSeo & {
    lat: number;
    lng: number;
    address: string | null;
    website: string | null;
    phone: string | null;
    image_url: string | null;
  },
): JsonLd {
  const data: JsonLd = {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[place.category],
    name: place.name,
    url: absoluteUrl(`/place/${place.id}`),
    geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng },
    address: {
      "@type": "PostalAddress",
      ...(place.address ? { streetAddress: place.address } : {}),
      addressLocality: place.city_name,
      addressCountry: place.country_name,
    },
    containedInPlace: { "@type": "City", name: place.city_name },
  };
  if (place.image_url) data.image = place.image_url;
  if (place.website) data.sameAs = place.website;
  if (place.phone) data.telephone = place.phone;
  if (BUSINESS.has(place.category) && place.user_count > 0 && place.user_avg != null) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(place.user_avg).toFixed(1),
      ratingCount: place.user_count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return data;
}
