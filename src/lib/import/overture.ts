/**
 * Overture Maps places (https://docs.overturemaps.org/guides/places/): a free, monthly, bulk
 * dataset of ~88M places from Meta, Microsoft, Foursquare and others, published as Parquet on S3.
 * Read with DuckDB by a scheduled job (scripts/import-overture.ts), never during a page visit, so
 * guides don't depend on any live API. Licences: CDLA Permissive 2.0 / Apache 2.0 (attribution).
 *
 * This module is pure (no DuckDB, no database) so it can be unit-tested.
 */
import type { PlaceCategory } from "./categories";
import { normalizeUrl, type PlaceInput } from "./overpass";

/**
 * Overture taxonomy paths (taxonomy.hierarchy joined with ">") → our categories. First match wins,
 * so more specific prefixes come first. Overture has no viewpoints; those come from OpenStreetMap.
 */
const RULES: [prefix: string, category: PlaceCategory][] = [
  ["food_and_drink>casual_eatery>cafe", "cafe"],
  ["food_and_drink>casual_eatery>bakery", "cafe"],
  ["food_and_drink>casual_eatery>dessert_shop", "cafe"],
  ["food_and_drink>non_alcoholic_beverage_venue", "cafe"],
  ["food_and_drink>casual_eatery", "restaurant"],
  ["food_and_drink>restaurant", "restaurant"],
  ["food_and_drink>alcoholic_beverage_venue", "bar"],
  ["arts_and_entertainment>nightlife_venue>dance_club", "nightlife"],
  ["arts_and_entertainment>performing_arts_venue>music_venue", "nightlife"],
  ["arts_and_entertainment>performing_arts_venue>comedy_club", "nightlife"],
  ["arts_and_entertainment>gaming_venue>casino", "nightlife"],
  ["arts_and_entertainment>museum", "museum"],
  ["arts_and_entertainment>arts_and_crafts_space>art_gallery", "museum"],
  ["sports_and_recreation>park>dog_park", "park"],
  ["sports_and_recreation>park>playground", "park"],
  ["sports_and_recreation>park", "park"],
  ["geographic_entities>built_feature>garden", "park"],
  ["geographic_entities>land_feature>nature_reserve", "park"],
  ["cultural_and_historic>historic_site", "attraction"],
  ["cultural_and_historic>memorial_site", "attraction"],
  ["arts_and_entertainment>amusement_attraction", "attraction"],
  ["arts_and_entertainment>animal_attraction", "attraction"],
  ["arts_and_entertainment>science_attraction", "attraction"],
  ["arts_and_entertainment>performing_arts_venue>theatre_venue", "attraction"],
  ["community_and_government>public_facility>public_plaza", "attraction"],
  ["geographic_entities>land_feature>beach", "beach"],
  ["shopping>market", "market"],
  ["shopping>second_hand_store>flea_market", "market"],
  ["shopping>shopping_mall", "shopping"],
  ["shopping>department_store", "shopping"],
];

/** Excluded even though their prefix matches: not what a visitor's guide is for. */
const EXCLUDE = new Set([
  "sports_and_recreation>park>dog_park",
  "sports_and_recreation>park>playground",
]);

/** The Overture taxonomy prefixes the job asks DuckDB for (used to pre-filter rows in SQL). */
export const OVERTURE_PREFIXES = RULES.map(([p]) => p).filter((p) => !EXCLUDE.has(p));

export function overtureCategory(
  hierarchy: readonly string[] | null | undefined,
): PlaceCategory | null {
  if (!hierarchy?.length) return null;
  const path = hierarchy.join(">");
  for (const [prefix, category] of RULES) {
    if (path === prefix || path.startsWith(`${prefix}>`))
      return EXCLUDE.has(prefix) ? null : category;
  }
  return null;
}

/** A row as selected by overtureQuery(). */
export type OvertureRow = {
  id: string;
  name: string | null;
  hierarchy: string[] | null;
  confidence: number | null;
  websites: string[] | null;
  socials: string[] | null;
  phones: string[] | null;
  brand: string | null;
  address: string | null;
  locality: string | null;
  lng: number;
  lat: number;
  operating_status: string | null;
  /** How many providers (Meta, Microsoft, Foursquare…) list this place. */
  source_count?: number | null;
};

/**
 * Prominence 0..100, the rating prior before travellers rate a place (see lib/scoring.ts). Built
 * from how real and how documented the place is; chains are pushed down so a guide leads with
 * local places.
 */
export function overtureProminence(
  r: Pick<OvertureRow, "confidence" | "websites" | "socials" | "phones" | "brand">,
): number {
  let p = Math.round((r.confidence ?? 0.3) * 40);
  if (r.websites?.length) p += 15;
  if (r.socials?.length) p += 7;
  if (r.phones?.length) p += 8;
  if (r.brand) p -= 15;
  return Math.max(0, Math.min(100, p));
}

/** The subcategory label shown under a place's name: the most specific taxonomy node. */
function subcategoryOf(hierarchy: string[]): string | null {
  const leaf = hierarchy[hierarchy.length - 1];
  if (!leaf || hierarchy.length < 3) return null;
  return leaf.replace(/_/g, " ").replace(/ (restaurant|venue|shop)$/, "") || null;
}

/**
 * Map rows to place inputs: drop closed, unnamed and low-confidence places, then keep the best
 * `perCategory` in each category (highest prominence, then nearest the centre).
 */
export function selectOverturePlaces(
  rows: OvertureRow[],
  centre: { lat: number; lng: number },
  { perCategory = 40, minConfidence = 0.5 }: { perCategory?: number; minConfidence?: number } = {},
): PlaceInput[] {
  const byCategory = new Map<PlaceCategory, (PlaceInput & { _d: number })[]>();
  const cosLat = Math.cos((centre.lat * Math.PI) / 180);
  for (const r of rows) {
    if (r.operating_status && r.operating_status !== "open") continue;
    if ((r.confidence ?? 0) < minConfidence) continue;
    const name = r.name?.trim();
    if (!name || name.length > 120) continue;
    const category = overtureCategory(r.hierarchy);
    if (!category) continue;
    const dx = (r.lng - centre.lng) * cosLat;
    const dy = r.lat - centre.lat;
    const list = byCategory.get(category) ?? [];
    list.push({
      source: "overture",
      source_id: r.id,
      name,
      category,
      subcategory: subcategoryOf(r.hierarchy!),
      lat: r.lat,
      lng: r.lng,
      address: [r.address, r.locality].filter(Boolean).join(", ") || null,
      website: normalizeUrl(r.websites?.[0]),
      phone: r.phones?.[0] ?? null,
      opening_hours: null,
      wikidata_id: null,
      wikipedia: null,
      prominence: overtureProminence(r),
      tags: Object.fromEntries(
        [
          ["brand", r.brand],
          ["confidence", r.confidence?.toFixed(2)],
          ["socials", r.socials?.[0]],
        ].filter((e): e is [string, string] => Boolean(e[1])),
      ),
      _d: dx * dx + dy * dy,
    });
    byCategory.set(category, list);
  }
  const out: PlaceInput[] = [];
  for (const list of byCategory.values()) {
    list.sort((a, b) => b.prominence - a.prominence || a._d - b._d);
    for (const { _d, ...p } of list.slice(0, perCategory)) {
      void _d;
      out.push(p);
    }
  }
  return out;
}

/** Bounding box around a centre, in degrees. */
export function bboxAround(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { xmin: lng - dLng, xmax: lng + dLng, ymin: lat - dLat, ymax: lat + dLat };
}

/** DuckDB SQL reading one city's candidate places from an Overture release. */
export function overtureQuery(release: string, box: ReturnType<typeof bboxAround>): string {
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release)) throw new Error(`bad Overture release ${release}`);
  const n = (v: number) => {
    if (!Number.isFinite(v)) throw new Error("bad coordinate");
    return v.toFixed(6);
  };
  const prefixes = Array.from(new Set(OVERTURE_PREFIXES.map((p) => p.split(">")[0])))
    .map((root) => `'${root}'`)
    .join(", ");
  return `
    SELECT id,
           names."primary" AS name,
           taxonomy.hierarchy AS hierarchy,
           confidence,
           websites, socials, phones,
           brand.names."primary" AS brand,
           addresses[1].freeform AS address,
           addresses[1].locality AS locality,
           bbox.xmin AS lng, bbox.ymin AS lat,
           operating_status,
           len(sources)::INTEGER AS source_count
    FROM read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*', hive_partitioning = 1)
    WHERE bbox.xmin BETWEEN ${n(box.xmin)} AND ${n(box.xmax)}
      AND bbox.ymin BETWEEN ${n(box.ymin)} AND ${n(box.ymax)}
      AND taxonomy.hierarchy[1] IN (${prefixes})
      AND coalesce(confidence, 0) >= 0.4`;
}

/** The newest Overture release, from the public bucket's listing (e.g. "2026-10-21.0"). */
export async function latestOvertureRelease(fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(
    "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/",
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`Overture release listing: HTTP ${res.status}`);
  const releases = Array.from(
    (await res.text()).matchAll(/<Prefix>release\/(\d{4}-\d{2}-\d{2}\.\d+)\/<\/Prefix>/g),
  ).map((m) => m[1]);
  if (!releases.length) throw new Error("no Overture releases found");
  return releases.sort().at(-1)!;
}
