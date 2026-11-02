import {
  baseProminence,
  classify,
  displayName,
  formatAddress,
  type OsmTags,
  type PlaceCategory,
} from "./categories";

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
};

export type PlaceInput = {
  source: "osm";
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
  tags: Record<string, string>;
};

/** Search radius in metres, scaled by population. */
export function radiusForPopulation(population: number): number {
  if (population >= 3_000_000) return 14_000;
  if (population >= 1_000_000) return 11_000;
  if (population >= 400_000) return 8_000;
  if (population >= 100_000) return 5_500;
  return 4_000;
}

/**
 * Query groups: each group becomes one Overpass request so a single slow or failing group
 * doesn't lose the whole city. Within a group, a "rich" tier (places with a website or a
 * Wikidata item) is requested first with its own cap, then any named place, so the caps
 * favour notable places. Overpass returns elements in id order, not by importance; the
 * tiers compensate. Plain tag-existence filters are used (no regex on keys): they are cheap
 * on public instances.
 */
type Group = { key: string; selectors: string[]; richCap: number; anyCap: number };

export const QUERY_GROUPS: Group[] = [
  {
    key: "food",
    selectors: ['["amenity"="restaurant"]', '["amenity"="food_court"]'],
    richCap: 220,
    anyCap: 120,
  },
  {
    key: "cafe_bar",
    selectors: [
      '["amenity"="cafe"]',
      '["amenity"="ice_cream"]',
      '["shop"~"^(bakery|pastry)$"]',
      '["amenity"~"^(bar|pub|biergarten)$"]',
      '["craft"="brewery"]',
      '["amenity"~"^(nightclub|casino|music_venue)$"]',
    ],
    richCap: 220,
    anyCap: 140,
  },
  {
    key: "sights",
    selectors: [
      '["tourism"~"^(museum|gallery|attraction|viewpoint|zoo|aquarium|theme_park)$"]',
      '["historic"~"^(castle|monument|memorial|ruins|palace|fort|archaeological_site|city_gate|tower|citywalls|aqueduct|church|cathedral|monastery)$"]',
      '["amenity"="theatre"]',
      '["amenity"="place_of_worship"]["wikidata"]',
    ],
    richCap: 260,
    anyCap: 160,
  },
  {
    key: "outdoors_shopping",
    selectors: [
      '["leisure"~"^(park|garden|nature_reserve)$"]',
      '["natural"="beach"]',
      '["amenity"="marketplace"]',
      '["shop"~"^(mall|department_store)$"]',
    ],
    richCap: 160,
    anyCap: 140,
  },
];

export function buildGroupQuery(group: Group, lat: number, lng: number, radius: number): string {
  const around = `(around:${radius},${lat.toFixed(5)},${lng.toFixed(5)})`;
  const rich = group.selectors
    .flatMap((s) => [
      `nwr${s}["name"]["website"]${around};`,
      `nwr${s}["name"]["wikidata"]${around};`,
    ])
    .join("");
  const any = group.selectors.map((s) => `nwr${s}["name"]${around};`).join("");
  return (
    `[out:json][timeout:45];` +
    `(${rich})->.rich;.rich out center tags ${group.richCap};` +
    `(${any})->.any;(.any; - .rich;)->.rest;.rest out center tags ${group.anyCap};`
  );
}

export function parseEndpoints(): string[] {
  const raw = process.env.OVERPASS_ENDPOINTS ?? "https://overpass-api.de/api/interpreter";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export class OverpassError extends Error {}

/** Backoff between full endpoint sweeps. Override with OVERPASS_RETRY_DELAYS_MS="3000,10000,30000". */
function retryDelays(): number[] {
  const raw = process.env.OVERPASS_RETRY_DELAYS_MS;
  if (!raw) return [3_000, 10_000, 30_000];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

/**
 * POST a query, trying each endpoint in order; the whole endpoint list is retried a few
 * times with backoff because public instances answer 429/503/504 when busy.
 */
export async function fetchOverpass(
  query: string,
  endpoints = parseEndpoints(),
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<OverpassElement[]> {
  const errors: string[] = [];
  const delays = retryDelays();
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1]);
    const result = await tryEndpoints(query, endpoints, fetchImpl, errors);
    if (result) return result;
  }
  throw new OverpassError(`all Overpass endpoints failed: ${errors.join("; ")}`);
}

async function tryEndpoints(
  query: string,
  endpoints: string[],
  fetchImpl: typeof fetch,
  errors: string[],
): Promise<OverpassElement[] | null> {
  for (const endpoint of endpoints) {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": process.env.IMPORT_USER_AGENT ?? "RateDestinations/0.1",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(55_000),
      });
      if (!res.ok) {
        errors.push(`${endpoint}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
      if (!Array.isArray(json.elements)) {
        errors.push(`${endpoint}: malformed response${json.remark ? ` (${json.remark})` : ""}`);
        continue;
      }
      return json.elements;
    } catch (err) {
      errors.push(`${endpoint}: ${(err as Error).message}`);
    }
  }
  return null;
}

const KEEP_TAGS = [
  "name",
  "name:en",
  "cuisine",
  "description",
  "heritage",
  "wheelchair",
  "outdoor_seating",
  "internet_access",
  "level",
  "fee",
  "charge",
  "diet:vegetarian",
  "diet:vegan",
  "brand",
];

/** Convert Overpass elements into place rows. Deduplicates by OSM id. */
export function parseElements(elements: OverpassElement[]): PlaceInput[] {
  const seen = new Set<string>();
  const out: PlaceInput[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const source_id = `${el.type}/${el.id}`;
    if (seen.has(source_id)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;
    const name = displayName(tags);
    if (!name || name.length > 120) continue;
    const cls = classify(tags);
    if (!cls) continue;
    seen.add(source_id);
    const kept: Record<string, string> = {};
    for (const k of KEEP_TAGS) if (tags[k]) kept[k] = tags[k].slice(0, 300);
    if (tags.name && tags.name !== name) kept.local_name = tags.name;
    out.push({
      source: "osm",
      source_id,
      name,
      category: cls.category,
      subcategory: cls.subcategory,
      lat,
      lng,
      address: formatAddress(tags),
      website: normalizeUrl(tags.website ?? tags["contact:website"] ?? tags.url),
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      opening_hours: tags.opening_hours ?? null,
      wikidata_id: tags.wikidata && /^Q\d+$/.test(tags.wikidata) ? tags.wikidata : null,
      wikipedia: tags.wikipedia ?? null,
      prominence: baseProminence(tags),
      tags: kept,
    });
  }
  return out;
}

function normalizeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const first = url.split(";")[0].trim();
  if (!first) return null;
  const withScheme = /^https?:\/\//i.test(first) ? first : `https://${first}`;
  try {
    return new URL(withScheme).toString().slice(0, 500);
  } catch {
    return null;
  }
}
