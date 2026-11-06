import { query } from "@/lib/db";
import { upsertPlaces } from "./import-city";
import type { PlaceInput } from "./overpass";

export { diceSimilarity, distanceM, nameTokens, normalizeName } from "./names";
import { diceSimilarity, distanceM, nameTokens, normalizeName } from "./names";

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
 * phone and address are filled, prominence takes the higher value, the other source's id is
 * kept in tags, and a +18 flag from either source sticks. Ratings stay on the existing row. Everything else is inserted.
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
         wikidata_id = coalesce(wikidata_id, $9),
         tags = tags || jsonb_build_object($6::text, $7::text),
         adult = adult or $8
       where id = $1`,
      [
        match.id,
        p.website,
        p.phone,
        p.address,
        p.prominence,
        `${p.source}_id`,
        p.source_id,
        p.adult ?? false,
        p.wikidata_id,
      ],
    );
  }
  await upsertPlaces(cityId, toInsert);
  return { added: toInsert.length, enriched };
}
