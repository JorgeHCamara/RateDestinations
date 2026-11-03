/**
 * Overture Maps places (https://docs.overturemaps.org/guides/places/): a free, monthly, bulk
 * dataset of ~88M places from Meta, Microsoft, Foursquare and others, published as Parquet on S3.
 * Read with DuckDB by a scheduled job (scripts/import-overture.ts), never during a page visit, so
 * guides don't depend on any live API. Licences: CDLA Permissive 2.0 / Apache 2.0 (attribution).
 *
 * This module is pure (no DuckDB, no database) so it can be unit-tested.
 */
import type { PlaceCategory } from "./categories";
import { stripDiacritics } from "@/lib/slug";
import { hasAdultName, isAdultTaxonomy, isJunkName } from "./filters";
import { normalizeUrl, type PlaceInput } from "./overpass";

/**
 * Bumped when the selection rules below change, so the scheduled job rebuilds every city from the
 * same Overture release (it compares `${release}+${OVERTURE_PIPELINE}` with cities.overture_release).
 */
export const OVERTURE_PIPELINE = "p2";

/**
 * Overture taxonomy paths (taxonomy.hierarchy joined with ">") → our categories. First match wins,
 * so more specific prefixes come first. Overture has no viewpoints; those come from OpenStreetMap.
 */
const RULES: [prefix: string, category: PlaceCategory][] = [
  // Bar-and-grills, gastropubs and tapas bars are where people go for drinks (Jack Astor's, Moxies).
  ["food_and_drink>restaurant>bar_and_grill_restaurant", "bar"],
  ["food_and_drink>casual_eatery>gastropub", "bar"],
  ["food_and_drink>casual_eatery>tapas_bar", "bar"],
  ["food_and_drink>casual_eatery>cafe", "cafe"],
  ["food_and_drink>casual_eatery>bakery", "cafe"],
  ["food_and_drink>casual_eatery>dessert_shop", "cafe"],
  ["food_and_drink>non_alcoholic_beverage_venue", "cafe"],
  ["food_and_drink>casual_eatery", "restaurant"],
  ["food_and_drink>restaurant", "restaurant"],
  ["food_and_drink>alcoholic_beverage_venue", "bar"],
  ["arts_and_entertainment>nightlife_venue>dance_club", "nightlife"],
  // Kept with adult = true and never listed (see lib/import/filters.ts).
  ["arts_and_entertainment>nightlife_venue>adult_entertainment_venue", "nightlife"],
  ["shopping>specialty_store>adult_store", "shopping"],
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

/**
 * Restaurants whose name says they are a bar ("Moxies Bar & Grill", "The Fox and Fiddle Pub") are
 * listed with bars. Not snack, sushi, juice or salad bars, which are food places.
 */
const BAR_NAME =
  /\b(bar|pub|tavern|taverna|taphouse|tap house|tap room|taproom|brewpub|alehouse|ale house|saloon|boteco|cervejaria|biergarten|beer hall|beer garden|izakaya)\b/i;
const NOT_A_BAR_NAME =
  /\b(snack|sushi|juice|salad|smoothie|coffee|espresso|dessert|noodle|ramen|poke|taco|burrito|salsa|pasta|nail|brow|lash|blow ?dry|oxygen|milk|candy|chocolate|cereal|soup|raw)\s+bar\b|\bbar\s*-?\s*b\s*-?\s*q\b/i;

/**
 * Bar-and-grill chains that Overture often files as plain restaurants, under a name without "bar"
 * ("Moxies Vaughan Colossus Restaurant"). Matched on the brand or the start of the name.
 */
const BAR_AND_GRILL_BRANDS = [
  "moxies",
  "moxie s",
  "jack astor s",
  "kelseys",
  "montana s",
  "shoeless joe s",
  "earls",
  "cactus club",
  "joey",
  "milestones",
  "original joe s",
  "browns socialhouse",
  "the rec room",
  "wild wing",
  "chuck s roadhouse",
  "st louis bar",
  "boston pizza",
  "applebee s",
  "chili s",
  "tgi friday s",
  "tgi fridays",
  "buffalo wild wings",
  "hooters",
  "twin peaks",
];

function brandKey(s: string) {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function looksLikeBar(name: string, brand?: string | null): boolean {
  const keys = [brandKey(name), brand ? brandKey(brand) : ""];
  if (keys.some((k) => BAR_AND_GRILL_BRANDS.some((b) => k === b || k.startsWith(`${b} `))))
    return true;
  return BAR_NAME.test(name) && !NOT_A_BAR_NAME.test(name);
}

/** Quick-service chains: the brand penalty applies to these, not to sit-down chains. */
const QUICK_SERVICE =
  /fast_food|sandwich|coffee|burger|chicken|pizza|donut|bagel|ice_cream|frozen_yogurt|bubble_tea|juice|smoothie|convenience|bakery/;

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
 * from how real and how documented the place is, and how many providers list it. Chains are
 * pushed down so a guide leads with local places: fast-food and coffee chains most, other
 * restaurant and café chains with several locations around (`locations`) a little. Bar-and-grill
 * chains people go out to (Moxies, The Keg) are not.
 */
export function overtureProminence(
  r: Pick<
    OvertureRow,
    "confidence" | "websites" | "socials" | "phones" | "brand" | "source_count" | "hierarchy"
  >,
  locations = 1,
): number {
  let p = Math.round((r.confidence ?? 0.3) * 35);
  p += Math.min(10, Math.max(0, ((r.source_count ?? 1) - 1) * 5));
  if (r.websites?.length) p += 15;
  if (r.socials?.length) p += 7;
  if (r.phones?.length) p += 8;
  const path = r.hierarchy?.join(">") ?? "";
  const chain = Boolean(r.brand) || locations >= 2;
  if (chain && QUICK_SERVICE.test(path)) p -= 15;
  else if (locations >= 3 && /^food_and_drink>(restaurant|casual_eatery|non_alcoholic)/.test(path))
    p -= 10;
  return Math.max(0, Math.min(100, p));
}

/** Category for a row, by taxonomy first and then, for restaurants, by a bar-like name. */
export function overtureRowCategory(
  r: Pick<OvertureRow, "hierarchy" | "name"> & { brand?: string | null },
): PlaceCategory | null {
  const category = overtureCategory(r.hierarchy);
  if (category === "restaurant" && r.name && looksLikeBar(r.name, r.brand)) return "bar";
  return category;
}

/** +18 venues: by the provider's category, or by words in the name. */
export function isAdultOverture(
  r: Pick<OvertureRow, "hierarchy" | "name">,
  category: PlaceCategory | null,
): boolean {
  return (
    isAdultTaxonomy(r.hierarchy) ||
    hasAdultName(r.name, category === "nightlife" || category === "bar")
  );
}

/** The subcategory label shown under a place's name: the most specific taxonomy node. */
function subcategoryOf(hierarchy: string[]): string | null {
  const leaf = hierarchy[hierarchy.length - 1];
  if (!leaf || hierarchy.length < 3) return null;
  return leaf.replace(/_/g, " ").replace(/ (restaurant|venue|shop)$/, "") || null;
}

/**
 * Map rows to place inputs: drop closed, unnamed, test/placeholder and low-confidence places, then
 * keep the best `perCategory` in each category (highest prominence, then nearest the centre).
 * Adult venues are kept apart, flagged `adult`, under their own smaller cap, so they never take a
 * listed place's slot.
 */
export function selectOverturePlaces(
  rows: OvertureRow[],
  centre: { lat: number; lng: number },
  {
    perCategory = 50,
    minConfidence = 0.5,
    adultPerCategory = 15,
  }: { perCategory?: number; minConfidence?: number; adultPerCategory?: number } = {},
): PlaceInput[] {
  const byCategory = new Map<string, (PlaceInput & { _d: number })[]>();
  const cosLat = Math.cos((centre.lat * Math.PI) / 180);
  // How many places around share each name: three Pizza Huts make a chain even without a brand.
  const locations = new Map<string, number>();
  for (const r of rows) {
    const k = brandKey(r.brand || r.name || "");
    if (k) locations.set(k, (locations.get(k) ?? 0) + 1);
  }
  for (const r of rows) {
    if (r.operating_status && r.operating_status !== "open") continue;
    if ((r.confidence ?? 0) < minConfidence) continue;
    const name = r.name?.trim();
    if (!name || name.length > 120 || isJunkName(name)) continue;
    const category = overtureRowCategory({ hierarchy: r.hierarchy, name, brand: r.brand });
    if (!category) continue;
    const adult = isAdultOverture({ hierarchy: r.hierarchy, name }, category);
    const key = adult ? `adult:${category}` : category;
    const dx = (r.lng - centre.lng) * cosLat;
    const dy = r.lat - centre.lat;
    const list = byCategory.get(key) ?? [];
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
      prominence: overtureProminence(r, locations.get(brandKey(r.brand || name)) ?? 1),
      adult,
      tags: Object.fromEntries(
        [
          ["brand", r.brand],
          ["confidence", r.confidence?.toFixed(2)],
          ["socials", r.socials?.[0]],
          ["overture_category", r.hierarchy?.join(">")],
        ].filter((e): e is [string, string] => Boolean(e[1])),
      ),
      _d: dx * dx + dy * dy,
    });
    byCategory.set(key, list);
  }
  const out: PlaceInput[] = [];
  const byProminence = (a: { prominence: number; _d: number }, b: typeof a) =>
    b.prominence - a.prominence || a._d - b._d;
  for (const [key, list] of byCategory) {
    list.sort(byProminence);
    // More locations of one chain add little to a guide: the nearest-best one keeps its score, each
    // further one drops 10 points (up to 30), so a top six isn't one brand three times.
    const seen = new Map<string, number>();
    for (const p of list) {
      const chain = brandKey(p.tags.brand ?? p.name);
      const n = seen.get(chain) ?? 0;
      seen.set(chain, n + 1);
      if (n) p.prominence = Math.max(0, p.prominence - 10 * Math.min(n, 3));
    }
    list.sort(byProminence);
    const cap = key.startsWith("adult:") ? adultPerCategory : perCategory;
    for (const { _d, ...p } of list.slice(0, cap)) {
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
