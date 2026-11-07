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
import {
  FAME_MATCH_M,
  famousNameScore,
  famousProminence,
  isFamousVariant,
  type FamousPlace,
} from "./famous";
import { hasAdultName, isAdultTaxonomy, isJunkName } from "./filters";
import { distanceM, normalizeName } from "./names";
import { normalizeUrl, type PlaceInput } from "./overpass";

/**
 * Bumped when the selection rules below change, so the scheduled job rebuilds every city from the
 * same Overture release (it compares `${release}+${OVERTURE_PIPELINE}` with cities.overture_release).
 */
export const OVERTURE_PIPELINE = "p3";

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

/** The categories a visitor's guide is built around: famous places are looked up for these. */
const SIGHT_CATEGORIES = new Set<PlaceCategory>([
  "park",
  "attraction",
  "museum",
  "viewpoint",
  "beach",
  "market",
]);

/**
 * Buildings people live in, which Overture often files as historic sites or plazas ("49 Chambers",
 * "140 Franklin Condominium", "Southbridge Towers"): not sights. A famous one (30 Rockefeller
 * Plaza) is kept through Wikidata before this applies.
 */
const RESIDENTIAL_NAME =
  /\b(condo|condos|condominium|condominiums|apartment|apartments|apts|residences|residence|lofts?|luxury suites|owners|co-?op|tenants|townhomes?|housing)\b/i;
/** "49 Chambers", "108 Leonard", "2 River Terrace Apartment 12j": a street number then a name. */
const ADDRESS_NAME = /^\d+[a-z]?(-\d+)?\s+\p{L}/iu;
/** Words a real beach's name has (a "beach" called "Maui, Hawaii" pinned in New York isn't one). */
const BEACH_WORD =
  /\b(beach|beaches|praia|praias|playa|playas|plage|plages|spiaggia|lido|strand|strandbad|plaj|pantai|pla[zž]a|cala|bay|cove|sands?|shore|seafront|waterfront)\b/i;

type Candidate = PlaceInput & { _d: number; _claimed?: boolean };

/**
 * Map rows to place inputs, then keep the best `perCategory` in each category.
 *
 * 1. Drop closed, unnamed, test/placeholder and low-confidence listings.
 * 2. Famous places (Wikidata, see lib/import/famous.ts) come first: each claims its best-matching
 *    listing (same name nearby), which takes its category and a fame-based prominence; one with no
 *    listing is added from Wikidata. Check-in variants of a famous place ("New York Central Park",
 *    "Central Park - Wagner Cove") are dropped.
 * 3. Noise: buildings people live in are not sights, commercial art galleries rank below museums,
 *    and a "beach" needs a beach-like name.
 * 4. Per category: highest prominence first, then nearest the centre; a chain's further locations
 *    drop, and the same name twice within 300 m is kept once.
 *
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
    famous = [],
    cityName = "",
  }: {
    perCategory?: number;
    minConfidence?: number;
    adultPerCategory?: number;
    famous?: FamousPlace[];
    /** Its words don't tell two listings apart ("Central Park NYC" is Central Park). */
    cityName?: string;
  } = {},
): PlaceInput[] {
  const cosLat = Math.cos((centre.lat * Math.PI) / 180);
  const sq = (p: { lat: number; lng: number }) => {
    const dx = (p.lng - centre.lng) * cosLat;
    const dy = p.lat - centre.lat;
    return dx * dx + dy * dy;
  };
  // How many places around share each name: three Pizza Huts make a chain even without a brand.
  const locations = new Map<string, number>();
  for (const r of rows) {
    const k = brandKey(r.brand || r.name || "");
    if (k) locations.set(k, (locations.get(k) ?? 0) + 1);
  }
  const candidates: Candidate[] = [];
  for (const r of rows) {
    if (r.operating_status && r.operating_status !== "open") continue;
    if ((r.confidence ?? 0) < minConfidence) continue;
    const name = r.name?.trim();
    if (!name || name.length > 120 || isJunkName(name)) continue;
    const category = overtureRowCategory({ hierarchy: r.hierarchy, name, brand: r.brand });
    if (!category) continue;
    const adult = isAdultOverture({ hierarchy: r.hierarchy, name }, category);
    candidates.push({
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
      _d: sq(r),
    });
  }

  // 2. Famous places, most famous first, each claiming its listing.
  const famousSorted = [...famous].sort((a, b) => b.sitelinks - a.sitelinks);
  for (const f of famousSorted) {
    let best: { c: Candidate; score: number; d: number } | null = null;
    for (const c of candidates) {
      if (c._claimed || c.adult) continue;
      if (!SIGHT_CATEGORIES.has(c.category) && c.category !== f.category) continue;
      const d = distanceM(c, f);
      if (d > FAME_MATCH_M[f.category]) continue;
      const score = famousNameScore(c.name, f.names, cityName, f.category);
      if (score < 2) continue;
      if (
        !best ||
        score > best.score ||
        (score === best.score &&
          (c.prominence > best.c.prominence || (c.prominence === best.c.prominence && d < best.d)))
      )
        best = { c, score, d };
    }
    const prominence = famousProminence(f.sitelinks);
    if (best) {
      const c = best.c;
      c._claimed = true;
      // Shown under Wikidata's name (the listing's, if different, stays as the local name).
      if (normalizeName(c.name) !== normalizeName(f.name))
        c.tags = { ...c.tags, local_name: c.name };
      c.name = f.name;
      c.category = f.category;
      c.prominence = prominence;
      c.wikidata_id = f.qid;
      c.website = c.website ?? f.website;
      c.tags = { ...c.tags, wikidata_sitelinks: String(f.sitelinks) };
    } else {
      candidates.push({
        source: "wikidata",
        source_id: f.qid,
        name: f.name,
        category: f.category,
        subcategory: null,
        lat: f.lat,
        lng: f.lng,
        address: null,
        website: f.website,
        phone: null,
        opening_hours: null,
        wikidata_id: f.qid,
        wikipedia: null,
        prominence,
        adult: false,
        tags: { wikidata_sitelinks: String(f.sitelinks) },
        _d: sq(f),
        _claimed: true,
      });
    }
  }

  // 2b and 3: drop famous places' variants and the noise.
  const kept = candidates.filter((c) => {
    if (c._claimed || c.adult || !SIGHT_CATEGORIES.has(c.category)) return true;
    if (famousSorted.some((f) => isFamousVariant(c, f))) return false;
    const path = c.tags.overture_category ?? "";
    if (c.category === "attraction" && (RESIDENTIAL_NAME.test(c.name) || ADDRESS_NAME.test(c.name)))
      return false;
    // Check-in pages named like "Brighton Beach, NY" or "Eagle Beach, Aruba" are pinned wherever
    // someone checked in, not at the beach.
    if (c.category === "beach" && (!BEACH_WORD.test(c.name) || /[,|]|\.\s/.test(c.name)))
      return false;
    if (c.category === "museum" && path.includes("art_gallery"))
      c.prominence = Math.max(0, c.prominence - 12);
    return true;
  });

  // 4. Per category.
  const byCategory = new Map<string, Candidate[]>();
  for (const c of kept) {
    const key = c.adult ? `adult:${c.category}` : c.category;
    const list = byCategory.get(key) ?? [];
    list.push(c);
    byCategory.set(key, list);
  }
  const out: PlaceInput[] = [];
  const byProminence = (a: Candidate, b: Candidate) => b.prominence - a.prominence || a._d - b._d;
  for (const [key, list] of byCategory) {
    list.sort(byProminence);
    // More locations of one chain add little to a guide: the nearest-best one keeps its score, each
    // further one drops 10 points (up to 30), so a top six isn't one brand three times.
    const seen = new Map<string, number>();
    for (const p of list) {
      if (p._claimed) continue;
      const chain = brandKey(p.tags.brand ?? p.name);
      const n = seen.get(chain) ?? 0;
      seen.set(chain, n + 1);
      if (n) p.prominence = Math.max(0, p.prominence - 10 * Math.min(n, 3));
    }
    list.sort(byProminence);
    const cap = key.startsWith("adult:") ? adultPerCategory : perCategory;
    const chosen: Candidate[] = [];
    for (const p of list) {
      if (chosen.length >= cap) break;
      // The same sight twice (check-ins of one place): keep the first. Not for restaurants and
      // shops, where two branches of a chain can be a street apart.
      if (SIGHT_CATEGORIES.has(p.category)) {
        const n = normalizeName(p.name);
        if (chosen.some((q) => normalizeName(q.name) === n && distanceM(p, q) < 300)) continue;
      }
      chosen.push(p);
    }
    for (const { _d, _claimed, ...p } of chosen) {
      void _d;
      void _claimed;
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
