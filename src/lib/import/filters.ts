/**
 * Filters shared by every place source (Overture, Geoapify, Overpass).
 *
 * - Junk names: test and placeholder entries that map datasets pick up ("Test", "asdf", "123").
 *   Dropped at import, and hidden in the database by migration 0004.
 * - Adult (+18) venues: strip clubs, brothels, swinger clubs, sex shops. Kept with `adult = true`
 *   so a dedicated section is possible later, but never listed on the site. Detected from the
 *   source's own category first, then from words in the name, because categories are sometimes
 *   wrong (a strip club filed as a dance club). Anything both misses is flagged by hand in the
 *   place_overrides table.
 */
import { stripDiacritics } from "@/lib/slug";

/** Lowercase, no accents, punctuation as spaces, padded so `\b`-style checks are plain includes. */
function norm(s: string): string {
  return ` ${stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()} `;
}

const JUNK_NAMES = new Set(
  [
    "test",
    "tests",
    "testing",
    "teste",
    "testes",
    "test test",
    "test place",
    "test location",
    "test business",
    "test store",
    "test shop",
    "prueba",
    "essai",
    "asdf",
    "asd",
    "qwerty",
    "xxx",
    "xx",
    "n a",
    "none",
    "null",
    "undefined",
    "unknown",
    "untitled",
    "unnamed",
    "no name",
    "noname",
    "sem nome",
    "sin nombre",
    "placeholder",
    "sample",
    "example",
    "demo",
    "dummy",
    "fake",
    "delete",
    "deleted",
    "closed",
    "permanently closed",
    "my business",
    "my store",
    "my shop",
    "new business",
    "business",
    "store",
    "shop",
    "restaurant",
    "bar",
    "cafe",
    "park",
  ].map((n) => norm(n).trim()),
);

/**
 * True for names that are not a real place's name: test entries, placeholders, a bare category
 * word, or punctuation only.
 */
export function isJunkName(name: string | null | undefined): boolean {
  // No letters or digits at all: "...", "-". Digits alone are fine: "1881" and "709" are real places.
  if (!name || !/[\p{L}\p{N}]/u.test(name)) return true;
  const n = norm(name).trim();
  if (!n) return false; // a non-Latin script: nothing more to check
  if (n.length < 2) return true;
  if (JUNK_NAMES.has(n)) return true;
  // "Test 2", "test123" (not "Test Kitchen", which can be a real name)
  if (/^(test|teste|testing|prueba|asdf)( ?[0-9]+)?$/.test(n)) return true;
  if (/\b(do not use|dont use|ignore this|delete me)\b/.test(n)) return true;
  return false;
}

/** Words in a name that mark an adult venue in any category. */
const ADULT_NAME_WORDS = [
  "strip club",
  "stripclub",
  "striptease",
  "strip tease",
  "strip show",
  "club strip",
  "gentlemen s club",
  "gentlemens club",
  "gentleman s club",
  "gentlemans club",
  "lap dance",
  "lapdance",
  "table dance",
  "pole dance club",
  "go go bar",
  "gogo bar",
  "peep show",
  "sex shop",
  "sexshop",
  "sex store",
  "adult store",
  "adult shop",
  "adult entertainment",
  "adult club",
  "erotic",
  "erotica",
  "erotico",
  "erotique",
  "erotik",
  "brothel",
  "bordel",
  "bordello",
  "burdel",
  "prostibulo",
  "puticlub",
  "swinger",
  "swingers",
  "casa de swing",
  "clube de swing",
  "club swing",
  "casa de massagem",
  "massagem tantrica",
  "tantric massage",
  "glory hole",
  "gloryhole",
  "cabaret erotico",
  "hostess club",
  "kyabakura",
  "18+",
  "+18",
  "xxx",
];

/**
 * Words that mark an adult venue only in nightlife: in Brazil a nightclub called "termas" or "privê"
 * is a brothel, while a "privé" restaurant or a "termas" spa is not.
 */
const ADULT_NIGHTLIFE_WORDS = [
  "termas",
  "prive",
  "boate de strip",
  "show girls",
  "showgirls",
  "happy ending",
];

const ADULT_NAME_TERMS = ADULT_NAME_WORDS.map(norm);
const ADULT_NIGHTLIFE_TERMS = ADULT_NIGHTLIFE_WORDS.map(norm);

/** OSM tags that mark an adult venue. */
export function isAdultOsm(tags: Record<string, string | undefined>): boolean {
  const amenity = tags.amenity;
  if (amenity === "stripclub" || amenity === "brothel" || amenity === "swingerclub") return true;
  if (tags.shop === "erotic" || tags.shop === "sex" || tags.shop === "adult") return true;
  if (tags.nightclub === "striptease" || tags.nightclub === "strip_club") return true;
  if (tags.adult === "yes" || tags["adult:sex"] === "yes") return true;
  return false;
}

/** Overture taxonomy nodes that are adult venues. */
const ADULT_TAXONOMY = [
  "adult_entertainment_venue",
  "strip_club",
  "erotic_massage_venue",
  "adult_store",
  "sex_shop",
  "brothel",
  "swinger_club",
];

export function isAdultTaxonomy(hierarchy: readonly string[] | null | undefined): boolean {
  return Boolean(hierarchy?.some((node) => ADULT_TAXONOMY.includes(node)));
}

/** Name words that mark an adult venue. `nightlife` widens the list for clubs and bars. */
export function hasAdultName(name: string | null | undefined, nightlife = false): boolean {
  if (!name) return false;
  const n = norm(name);
  if (ADULT_NAME_TERMS.some((t) => n.includes(t))) return true;
  return nightlife && ADULT_NIGHTLIFE_TERMS.some((t) => n.includes(t));
}
