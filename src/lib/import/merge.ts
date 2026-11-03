import { query } from "@/lib/db";
import { stripDiacritics } from "@/lib/slug";
import { upsertPlaces } from "./import-city";
import type { PlaceInput } from "./overpass";

/** Lowercase, no accents or punctuation: "Café A Brasileira" → "cafe a brasileira", "K.O.B" → "kob". */
export function normalizeName(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/(\w)\.(?=\w)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Words that don't tell two places apart: articles, legal suffixes and the place type in several
 * languages ("Museu Medeiros e Almeida" and "Medeiros & Almeida Museum" are the same museum).
 */
const FILLER = new Set(
  (
    "a an and the of by at e y et und o os as de da do das dos del della di du le la les el los " +
    "lda ltd llc inc sa srl gmbh co dr doutor " +
    "museum museu museo musee museo galeria gallery galerie cafe caffe coffee bar pub restaurant restaurante " +
    "ristorante trattoria tasca cervejaria park parque parc jardim garden jardin market mercado marche shop store " +
    "viewpoint miradouro mirador belvedere aussichtspunkt lookout"
  ).split(" "),
);

export function nameTokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t.length > 1 && !FILLER.has(t));
}

/** Sørensen–Dice similarity of character bigrams, 0..1 ("forno d oro" vs "forno d ouro" ≈ 0.9). */
export function diceSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const m = new Map<string, number>();
    const t = s.replace(/ /g, "");
    for (let i = 0; i < t.length - 1; i++)
      m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of ga) {
    overlap += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

/** Metres between two points (equirectangular; accurate at city scale). */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const x = (((b.lng - a.lng) * Math.PI) / 180) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const y = ((b.lat - a.lat) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/**
 * Same place from two sources: within 80 m, and the names agree. Names agree when they are equal,
 * when one contains the other, when their spelling is very close, or (within 40 m) when every
 * meaningful word of the shorter name appears in the longer one.
 */
export function isSamePlace(
  a: { name: string; lat: number; lng: number },
  b: { name: string; lat: number; lng: number },
): boolean {
  const d = distanceM(a, b);
  if (d > 80) return false;
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 5 && long.includes(short)) return true;
  if (diceSimilarity(na, nb) >= 0.75) return true;
  const ta = nameTokens(a.name);
  const tb = nameTokens(b.name);
  if (!ta.length || !tb.length) return false;
  const [few, many] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  const covered = few.every(
    (t) => many.has(t) || [...many].some((m) => diceSimilarity(t, m) >= 0.8),
  );
  return covered && d <= 40 && few.join("").length >= 3;
}

type Existing = {
  id: number;
  source: string;
  source_id: string;
  name: string;
  lat: number;
  lng: number;
};

/**
 * Add places from one source to a city without duplicating what other sources already gave.
 * A place matching an existing one (by name and distance) enriches that row: missing website,
 * phone and address are filled, prominence takes the higher value, and the other source's id is
 * kept in tags. Ratings stay on the existing row. Everything else is inserted.
 */
export async function mergePlaces(
  cityId: number,
  incoming: PlaceInput[],
): Promise<{ added: number; enriched: number }> {
  const existing = await query<Existing>(
    "select id, source::text as source, source_id, name, lat, lng from places where city_id = $1",
    [cityId],
  );
  const toInsert: PlaceInput[] = [];
  let enriched = 0;
  for (const p of incoming) {
    const same = existing.find((e) => e.source === p.source && e.source_id === p.source_id);
    if (same) {
      toInsert.push(p); // same source, same id: a plain upsert refreshes it
      continue;
    }
    const match = existing.find((e) => e.source !== p.source && isSamePlace(e, p));
    if (!match) {
      toInsert.push(p);
      continue;
    }
    enriched++;
    await query(
      `update places set
         website = coalesce(website, $2), phone = coalesce(phone, $3), address = coalesce(address, $4),
         prominence = greatest(prominence, $5),
         tags = tags || jsonb_build_object($6::text, $7::text)
       where id = $1`,
      [match.id, p.website, p.phone, p.address, p.prominence, `${p.source}_id`, p.source_id],
    );
  }
  await upsertPlaces(cityId, toInsert);
  return { added: toInsert.length, enriched };
}
