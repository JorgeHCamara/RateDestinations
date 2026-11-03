/**
 * Geoapify Places API (https://apidocs.geoapify.com/docs/places/): OpenStreetMap data through a
 * web API built for apps. Used instead of the public Overpass servers when GEOAPIFY_API_KEY is
 * set, because those servers throttle shared cloud IPs such as Vercel's.
 *
 * Billing: 1 credit per 20 places returned (free plan: 3,000 credits/day). One request per
 * category, capped at GEOAPIFY_PER_CATEGORY places nearest the city centre (default 60), so a
 * city costs at most ~33 credits.
 */
import {
  baseProminence,
  classify,
  displayName,
  formatAddress,
  type OsmTags,
  type PlaceCategory,
} from "./categories";
import { normalizeUrl, radiusForPopulation, type PlaceInput } from "./overpass";

const ENDPOINT = "https://api.geoapify.com/v2/places";

/** Our categories → Geoapify category keys. */
export const GEOAPIFY_CATEGORIES: Record<PlaceCategory, string[]> = {
  restaurant: ["catering.restaurant", "catering.food_court"],
  cafe: ["catering.cafe", "catering.ice_cream", "commercial.food_and_drink.bakery"],
  bar: ["catering.bar", "catering.pub", "catering.biergarten"],
  nightlife: ["adult.nightclub", "adult.casino"],
  park: ["leisure.park"],
  attraction: [
    "tourism.attraction",
    "tourism.sights",
    "entertainment.culture.theatre",
    "entertainment.zoo",
    "entertainment.aquarium",
    "entertainment.theme_park",
  ],
  museum: ["entertainment.museum", "entertainment.culture.gallery"],
  viewpoint: ["tourism.attraction.viewpoint"],
  beach: ["beach"],
  market: ["commercial.marketplace"],
  shopping: ["commercial.shopping_mall", "commercial.department_store"],
};

export function isGeoapifyEnabled(): boolean {
  return Boolean(process.env.GEOAPIFY_API_KEY);
}

type Feature = {
  properties: {
    name?: string;
    lat: number;
    lon: number;
    categories?: string[];
    place_id: string;
    address_line2?: string;
    formatted?: string;
    website?: string;
    opening_hours?: string;
    contact?: { phone?: string };
    wiki_and_media?: { wikidata?: string; wikipedia?: string };
    datasource?: { sourcename?: string; raw?: Record<string, string | number> };
  };
};

/** Turn Geoapify features for one of our categories into place rows. Exported for tests. */
export function parseGeoapify(features: Feature[], category: PlaceCategory): PlaceInput[] {
  const out: PlaceInput[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const p = f.properties;
    const raw = (p.datasource?.raw ?? {}) as Record<string, string | number>;
    // Raw OSM tags when Geoapify passes them through; otherwise build the few we use.
    const tags: OsmTags = Object.fromEntries(
      Object.entries(raw)
        .filter(([, v]) => typeof v === "string" || typeof v === "number")
        .map(([k, v]) => [k, String(v)]),
    );
    if (!tags.name && p.name) tags.name = p.name;
    if (!tags.website && p.website) tags.website = p.website;
    if (!tags.opening_hours && p.opening_hours) tags.opening_hours = p.opening_hours;
    if (!tags.phone && p.contact?.phone) tags.phone = p.contact.phone;
    if (!tags.wikidata && p.wiki_and_media?.wikidata) tags.wikidata = p.wiki_and_media.wikidata;
    if (!tags.wikipedia && p.wiki_and_media?.wikipedia) tags.wikipedia = p.wiki_and_media.wikipedia;

    const name = displayName(tags);
    if (!name || name.length > 120) continue;
    // Same id scheme as the Overpass importer (node/123), so both sources update the same rows.
    const osmType = {
      n: "node",
      w: "way",
      r: "relation",
      node: "node",
      way: "way",
      relation: "relation",
    }[String(raw.osm_type ?? "")];
    const sourceId = osmType && raw.osm_id ? `${osmType}/${raw.osm_id}` : `geoapify/${p.place_id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const cls = classify(tags);
    const subcategory =
      cls?.category === category
        ? cls.subcategory
        : ((p.categories ?? [])
            .filter((c) => GEOAPIFY_CATEGORIES[category].some((k) => c.startsWith(`${k}.`)))
            .map((c) => c.split(".").pop()!.replace(/_/g, " "))[0] ?? null);

    out.push({
      source: "osm",
      source_id: sourceId,
      name,
      category,
      subcategory,
      lat: p.lat,
      lng: p.lon,
      address: formatAddress(tags) ?? p.address_line2 ?? null,
      website: normalizeUrl(tags.website ?? tags["contact:website"]),
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      opening_hours: tags.opening_hours ?? null,
      wikidata_id: tags.wikidata && /^Q\d+$/.test(tags.wikidata) ? tags.wikidata : null,
      wikipedia: tags.wikipedia ?? null,
      prominence: baseProminence(tags),
      tags: Object.fromEntries(
        ["name", "name:en", "cuisine", "description", "heritage", "brand"]
          .filter((k) => tags[k])
          .map((k) => [k, tags[k].slice(0, 300)]),
      ),
    });
  }
  return out;
}

export async function fetchGeoapifyCategory(
  city: { lat: number; lng: number; population: number },
  category: PlaceCategory,
  opts: { timeoutMs: number; fetchImpl?: typeof fetch },
): Promise<PlaceInput[]> {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) throw new Error("GEOAPIFY_API_KEY is not set");
  const radius = radiusForPopulation(city.population);
  const limit = Math.min(500, Math.max(20, Number(process.env.GEOAPIFY_PER_CATEGORY ?? 60)));
  const params = new URLSearchParams({
    categories: GEOAPIFY_CATEGORIES[category].join(","),
    filter: `circle:${city.lng},${city.lat},${radius}`,
    bias: `proximity:${city.lng},${city.lat}`,
    limit: String(limit),
    lang: "en",
    apiKey: key,
  });
  const res = await (opts.fetchImpl ?? fetch)(`${ENDPOINT}?${params}`, {
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200).replace(key, "***");
    throw new Error(`Geoapify HTTP ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { features?: Feature[] };
  return parseGeoapify(json.features ?? [], category);
}
