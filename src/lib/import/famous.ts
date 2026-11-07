/**
 * Famous places, from Wikidata. Overture's places come mostly from business listings and
 * check-ins: they say a lot about a condo building's website and phone, and nothing about whether
 * a place is Central Park. Wikidata does: how many language Wikipedias have an article about a
 * place (its sitelinks) is a free, worldwide measure of how famous it is. Central Park has 87,
 * the Met 89, a pocket park none.
 *
 * Each city build asks Wikidata for the parks, museums, sights, viewpoints, beaches and markets
 * within the city's radius that have Wikipedia articles, puts them at the top of their lists,
 * and lets Overture fill the rest (see selectOverturePlaces).
 *
 * Pure apart from fetchFamousPlaces, so the rules are unit-tested.
 */
import placeTypes from "@/data/wikidata-place-types.json";
import type { PlaceCategory } from "./categories";
import { distanceM, normalizeName } from "./names";

export const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";

/**
 * Wikidata classes → our categories. An item is a kind of one of these (any subclass counts:
 * src/data/wikidata-place-types.json, refreshed by scripts/sync-wikidata-place-types.ts) and needs
 * at least `minLinks` Wikipedia articles: a church or an office tower has to be really well known
 * to count as a sight. When an item matches several, the lowest `rank` wins: a zoo is a sight,
 * not a garden; the Statue of Liberty is a statue before it is an observation tower.
 */
export const FAME_ROOTS: {
  qid: string;
  label: string;
  category: PlaceCategory;
  minLinks: number;
  rank: number;
}[] = [
  { qid: "Q33506", label: "museum", category: "museum", minLinks: 3, rank: 1 },
  { qid: "Q1007870", label: "art gallery", category: "museum", minLinks: 8, rank: 1 },
  { qid: "Q43501", label: "zoo", category: "attraction", minLinks: 3, rank: 2 },
  { qid: "Q2281788", label: "public aquarium", category: "attraction", minLinks: 3, rank: 2 },
  { qid: "Q194195", label: "amusement park", category: "attraction", minLinks: 3, rank: 2 },
  { qid: "Q23413", label: "castle", category: "attraction", minLinks: 3, rank: 2 },
  { qid: "Q16560", label: "palace", category: "attraction", minLinks: 3, rank: 2 },
  { qid: "Q57821", label: "fortification", category: "attraction", minLinks: 5, rank: 2 },
  { qid: "Q22698", label: "park", category: "park", minLinks: 3, rank: 3 },
  { qid: "Q1107656", label: "garden", category: "park", minLinks: 3, rank: 3 },
  { qid: "Q46169", label: "national park", category: "park", minLinks: 3, rank: 3 },
  { qid: "Q179049", label: "nature reserve", category: "park", minLinks: 5, rank: 3 },
  { qid: "Q40080", label: "beach", category: "beach", minLinks: 3, rank: 4 },
  // Not "market" (Q37654): that also covers stock exchanges.
  { qid: "Q330284", label: "marketplace", category: "market", minLinks: 3, rank: 4 },
  { qid: "Q570116", label: "tourist attraction", category: "attraction", minLinks: 3, rank: 8 },
  { qid: "Q4989906", label: "monument", category: "attraction", minLinks: 5, rank: 6 },
  { qid: "Q5003624", label: "memorial", category: "attraction", minLinks: 8, rank: 6 },
  { qid: "Q179700", label: "statue", category: "attraction", minLinks: 8, rank: 6 },
  { qid: "Q174782", label: "square", category: "attraction", minLinks: 5, rank: 6 },
  { qid: "Q839954", label: "archaeological site", category: "attraction", minLinks: 5, rank: 6 },
  { qid: "Q2319498", label: "landmark", category: "attraction", minLinks: 5, rank: 6 },
  { qid: "Q12518", label: "tower", category: "attraction", minLinks: 8, rank: 6 },
  { qid: "Q2977", label: "cathedral", category: "attraction", minLinks: 5, rank: 6 },
  { qid: "Q153562", label: "opera house", category: "attraction", minLinks: 5, rank: 6 },
  { qid: "Q24354", label: "theatre building", category: "attraction", minLinks: 10, rank: 6 },
  { qid: "Q16970", label: "church building", category: "attraction", minLinks: 10, rank: 6 },
  { qid: "Q32815", label: "mosque", category: "attraction", minLinks: 10, rank: 6 },
  { qid: "Q44539", label: "temple", category: "attraction", minLinks: 8, rank: 6 },
  { qid: "Q34627", label: "synagogue", category: "attraction", minLinks: 10, rank: 6 },
  { qid: "Q24398318", label: "religious building", category: "attraction", minLinks: 12, rank: 6 },
  { qid: "Q12280", label: "bridge", category: "attraction", minLinks: 15, rank: 6 },
  { qid: "Q483110", label: "stadium", category: "attraction", minLinks: 40, rank: 6 },
  { qid: "Q11303", label: "skyscraper", category: "attraction", minLinks: 60, rank: 6 },
  // After the specific sights (the Statue of Liberty is a statue first, though it has an
  // observation deck), before the generic "tourist attraction" (a miradouro is often both).
  { qid: "Q6017969", label: "scenic viewpoint", category: "viewpoint", minLinks: 2, rank: 7 },
  { qid: "Q1440300", label: "observation tower", category: "viewpoint", minLinks: 3, rank: 7 },
];

/** Class → the FAME_ROOTS (indexes) it is a kind of. */
let classIndex: Map<string, number[]> | null = null;
function rootsOf(type: string): number[] {
  if (!classIndex) {
    classIndex = new Map();
    const data = placeTypes as Record<string, string[]>;
    FAME_ROOTS.forEach((root, i) => {
      for (const t of data[root.qid] ?? [root.qid]) {
        const list = classIndex!.get(t) ?? [];
        list.push(i);
        classIndex!.set(t, list);
      }
    });
  }
  return classIndex.get(type) ?? [];
}

/**
 * Classes that are never a place to visit, whatever else an item is: New Amsterdam (a former
 * settlement, filed under archaeological sites), towns and villages, people, species, events.
 */
const NOT_A_SIGHT = new Set([
  "Q22674925", // former settlement
  "Q486972", // human settlement
  "Q515", // city
  "Q3957", // town
  "Q532", // village
  "Q5", // human
  "Q16521", // taxon
  "Q1656682", // event
]);

/** Our category for a Wikidata item, from its classes (P31) and Wikipedia articles; null if none. */
export function classifyWikidataItem(types: string[], sitelinks: number): PlaceCategory | null {
  if (types.some((t) => NOT_A_SIGHT.has(t))) return null;
  let best: (typeof FAME_ROOTS)[number] | null = null;
  for (const t of types)
    for (const i of rootsOf(t)) {
      const root = FAME_ROOTS[i];
      if (sitelinks < root.minLinks) continue;
      if (!best || root.rank < best.rank) best = root;
    }
  return best?.category ?? null;
}

/**
 * Prominence for a famous place: 81 with 3 Wikipedia articles up to 100 with 150 or more. Always
 * above the best an Overture listing can reach (75), so famous places lead their lists, in
 * order of fame.
 */
export function famousProminence(sitelinks: number): number {
  const x = Math.min(1, Math.log(Math.max(3, sitelinks)) / Math.log(150));
  return Math.round(76 + 24 * x);
}

/** How far an Overture listing may be from Wikidata's point and still be the same place. */
export const FAME_MATCH_M: Record<PlaceCategory, number> = {
  park: 2_000, // a big park's listings sit anywhere inside it
  beach: 1_500,
  attraction: 500,
  museum: 400,
  viewpoint: 300,
  market: 300,
  restaurant: 100,
  cafe: 100,
  bar: 100,
  nightlife: 100,
  shopping: 300,
};

/** The language a country's places are usually named in, for Wikidata labels (English is always asked too). */
const COUNTRY_LANGUAGE: Record<string, string> = {
  PT: "pt",
  BR: "pt",
  AO: "pt",
  MZ: "pt",
  ES: "es",
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  VE: "es",
  EC: "es",
  BO: "es",
  PY: "es",
  UY: "es",
  CU: "es",
  DO: "es",
  GT: "es",
  HN: "es",
  SV: "es",
  NI: "es",
  CR: "es",
  PA: "es",
  PR: "es",
  FR: "fr",
  BE: "fr",
  LU: "fr",
  MC: "fr",
  SN: "fr",
  CI: "fr",
  CM: "fr",
  MA: "fr",
  DZ: "fr",
  TN: "fr",
  DE: "de",
  AT: "de",
  CH: "de",
  IT: "it",
  SM: "it",
  NL: "nl",
  DK: "da",
  SE: "sv",
  NO: "nb",
  FI: "fi",
  IS: "is",
  PL: "pl",
  CZ: "cs",
  SK: "sk",
  HU: "hu",
  RO: "ro",
  MD: "ro",
  BG: "bg",
  GR: "el",
  CY: "el",
  RS: "sr",
  HR: "hr",
  BA: "bs",
  SI: "sl",
  MK: "mk",
  AL: "sq",
  RU: "ru",
  BY: "be",
  UA: "uk",
  LT: "lt",
  LV: "lv",
  EE: "et",
  TR: "tr",
  GE: "ka",
  AM: "hy",
  AZ: "az",
  KZ: "kk",
  UZ: "uz",
  IL: "he",
  SA: "ar",
  AE: "ar",
  EG: "ar",
  JO: "ar",
  LB: "ar",
  SY: "ar",
  IQ: "ar",
  KW: "ar",
  QA: "ar",
  OM: "ar",
  BH: "ar",
  YE: "ar",
  LY: "ar",
  SD: "ar",
  IR: "fa",
  AF: "fa",
  PK: "ur",
  IN: "hi",
  BD: "bn",
  LK: "si",
  NP: "ne",
  CN: "zh",
  TW: "zh",
  HK: "zh",
  JP: "ja",
  KR: "ko",
  TH: "th",
  VN: "vi",
  ID: "id",
  MY: "ms",
  PH: "tl",
  MM: "my",
  KH: "km",
  LA: "lo",
  MN: "mn",
  ET: "am",
  KE: "sw",
  TZ: "sw",
};

export type FamousPlace = {
  qid: string;
  /** The name to show: English, else the local or default label. */
  name: string;
  /** Every label the place goes by here (English, local, default), for matching listings. */
  names: string[];
  lat: number;
  lng: number;
  sitelinks: number;
  category: PlaceCategory;
  website: string | null;
};

/** SPARQL for the Wikidata items around a point with at least `minLinks` Wikipedia articles. */
export function famousQuery(
  centre: { lat: number; lng: number },
  radiusKm: number,
  countryCode: string,
  minLinks = 3,
  limit = 3000,
): string {
  const num = (v: number) => {
    if (!Number.isFinite(v)) throw new Error("bad coordinate");
    return v.toFixed(6);
  };
  const lang = COUNTRY_LANGUAGE[countryCode.trim().toUpperCase()] ?? "en";
  return `SELECT ?item ?links ?loc (GROUP_CONCAT(DISTINCT ?type; separator=" ") AS ?types)
  (SAMPLE(?en) AS ?enLabel) (SAMPLE(?local) AS ?localLabel) (SAMPLE(?mul) AS ?mulLabel) (SAMPLE(?site) AS ?website)
WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${num(centre.lng)} ${num(centre.lat)})"^^geo:wktLiteral ; wikibase:radius "${num(radiusKm)}" . }
  ?item wikibase:sitelinks ?links . FILTER(?links >= ${Math.max(1, Math.round(minLinks))})
  ?item wdt:P31 ?t . BIND(STRAFTER(STR(?t), "entity/") AS ?type)
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  FILTER NOT EXISTS { ?item wdt:P3999 [] }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?local FILTER(LANG(?local) = "${lang}") }
  OPTIONAL { ?item rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
  OPTIONAL { ?item wdt:P856 ?site }
}
GROUP BY ?item ?links ?loc
ORDER BY DESC(?links)
LIMIT ${Math.max(1, Math.round(limit))}`;
}

type Binding = Record<string, { value: string } | undefined>;

/** Wikidata's answer → famous places: classified, one per item, without unnamed ones. */
export function parseFamous(bindings: Binding[]): FamousPlace[] {
  const out: FamousPlace[] = [];
  const seen = new Set<string>();
  for (const b of bindings) {
    const qid = b.item?.value.split("/").pop();
    if (!qid || !/^Q\d+$/.test(qid) || seen.has(qid)) continue;
    const m = b.loc?.value.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
    if (!m) continue;
    const sitelinks = Number(b.links?.value) || 0;
    const category = classifyWikidataItem((b.types?.value ?? "").split(" "), sitelinks);
    if (!category) continue;
    const labels = [b.enLabel?.value, b.localLabel?.value, b.mulLabel?.value]
      .map((l) => l?.trim())
      .filter((l): l is string => Boolean(l) && !/^Q\d+$/.test(l!));
    if (!labels.length) continue;
    seen.add(qid);
    const website = b.website?.value ?? null;
    out.push({
      qid,
      name: labels[0],
      names: Array.from(new Set(labels)),
      lng: Number(m[1]),
      lat: Number(m[2]),
      sitelinks,
      category,
      website: website && /^https?:\/\//i.test(website) ? website : null,
    });
  }
  return out;
}

/**
 * The famous places within `radiusM` of a city centre. Throws when Wikidata can't answer (the
 * caller decides what a build without them is worth); retries once, the second time with a
 * higher bar, which makes the query lighter for the biggest cities.
 */
export async function fetchFamousPlaces(
  centre: { lat: number; lng: number },
  radiusM: number,
  countryCode: string,
  {
    fetchImpl = fetch,
    userAgent = process.env.IMPORT_USER_AGENT ??
      "RateDestinations/1.0 (+https://www.ratedestinations.com)",
    timeoutMs = 55_000,
  }: { fetchImpl?: typeof fetch; userAgent?: string; timeoutMs?: number } = {},
): Promise<FamousPlace[]> {
  let lastError: unknown = null;
  for (const minLinks of [3, 6]) {
    try {
      const res = await fetchImpl(WIKIDATA_SPARQL, {
        method: "POST",
        headers: {
          accept: "application/sparql-results+json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": userAgent,
        },
        body: new URLSearchParams({
          query: famousQuery(centre, radiusM / 1000, countryCode, minLinks),
          format: "json",
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
      const json = (await res.json()) as { results: { bindings: Binding[] } };
      return parseFamous(json.results.bindings);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Words that don't make a listing a different place: "The High Line", "Central Park NYC",
 * "Brooklyn Museum Main Entrance". Not type words like park, bridge or tower: "Brooklyn Bridge
 * Park" is not the Brooklyn Bridge, nor "Times Square Tower" Times Square.
 */
const GENERIC_WORDS = new Set(
  "the a an of at in on and nyc ny usa official main entrance entry visitor visitors center centre info information".split(
    " ",
  ),
);

/** The words for a category's own type, which a listing may add or leave out ("Cadman Plaza Park"). */
const TYPE_WORDS: Partial<Record<PlaceCategory, string[]>> = {
  park: ["park", "parque", "parc", "garden", "gardens", "jardim", "jardin", "jardines"],
  museum: ["museum", "museu", "museo", "musee"],
  beach: ["beach", "praia", "playa", "plage"],
  market: ["market", "mercado", "marche", "markt"],
};

/**
 * How well a listing's name matches a famous place's names: 3 the same, 2 the same but for
 * generic words, the city's name or the place's type word, 0 not the same. Strict on purpose: a
 * famous place with no listing of the same name is added from Wikidata, and listings containing
 * its name are dropped as duplicates (isFamousVariant), so a loose match only does harm.
 */
export function famousNameScore(
  listing: string,
  names: string[],
  cityName = "",
  category?: PlaceCategory,
): number {
  const n = normalizeName(listing);
  if (!n) return 0;
  // The city's words ("new york" for New York City), not "city" itself: Battery Park City is not
  // The Battery.
  const cityWords = new Set(
    normalizeName(cityName)
      .split(" ")
      .filter((w) => w && w !== "city"),
  );
  const typeWords = new Set(category ? (TYPE_WORDS[category] ?? []) : []);
  const ignorable = (w: string) => GENERIC_WORDS.has(w) || cityWords.has(w) || typeWords.has(w);
  const core = (s: string) =>
    s
      .split(" ")
      .filter((w) => w && !ignorable(w))
      .join(" ");
  let best = 0;
  for (const label of names) {
    const l = normalizeName(label);
    if (!l) continue;
    if (n === l) return 3;
    const nCore = core(n);
    if (nCore.replace(/ /g, "").length >= 4 && nCore === core(l)) best = 2;
  }
  return best;
}

/**
 * A listing that is a famous place's check-in variant ("New York Central Park", "Central Park -
 * Wagner Cove", "Central Park Tower"): its name contains the famous name, and it is nearby.
 */
export function isFamousVariant(
  listing: { name: string; lat: number; lng: number },
  famous: FamousPlace,
): boolean {
  if (distanceM(listing, famous) > FAME_MATCH_M[famous.category] * 1.5) return false;
  const n = ` ${normalizeName(listing.name)} `;
  return famous.names.some((label) => {
    const l = normalizeName(label);
    return l.length >= 6 && n.includes(` ${l} `);
  });
}
