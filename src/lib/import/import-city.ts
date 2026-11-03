import { getPool, query, queryOne } from "@/lib/db";
import {
  QUERY_GROUPS,
  buildGroupQuery,
  fetchOverpass,
  parseElements,
  radiusForPopulation,
  type PlaceInput,
} from "./overpass";
import { fetchSitelinkCounts, sitelinkBonus } from "./wikidata";

export type ImportResult = {
  cityId: number;
  places: number;
  groups: { key: string; ok: boolean; elements: number; error?: string }[];
  durationMs: number;
};

type CityRow = { id: number; name: string; lat: number; lng: number; population: number };

/**
 * Import (or refresh) a city's places from OpenStreetMap.
 * Caller must have claimed the city with claim_city_import() first (see claimAndImport).
 */
export async function importCity(cityId: number): Promise<ImportResult> {
  const started = Date.now();
  const city = await queryOne<CityRow>(
    "select id, name, lat, lng, population from cities where id = $1",
    [cityId],
  );
  if (!city) throw new Error(`city ${cityId} not found`);
  const radius = radiusForPopulation(city.population);

  const groups: ImportResult["groups"] = [];
  const collected: PlaceInput[] = [];
  // Public Overpass instances allow very few concurrent requests per IP; run groups in
  // small batches (1 by default) so we are a polite client.
  const concurrency = Math.max(1, Number(process.env.OVERPASS_CONCURRENCY ?? 1));
  for (let i = 0; i < QUERY_GROUPS.length; i += concurrency) {
    const batch = QUERY_GROUPS.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (group) => {
        try {
          const elements = await fetchOverpass(buildGroupQuery(group, city.lat, city.lng, radius));
          return {
            key: group.key,
            ok: true,
            elements: elements.length,
            places: parseElements(elements),
          };
        } catch (err) {
          return {
            key: group.key,
            ok: false,
            elements: 0,
            error: (err as Error).message,
            places: [] as PlaceInput[],
          };
        }
      }),
    );
    for (const r of results) {
      groups.push({ key: r.key, ok: r.ok, elements: r.elements, error: r.error });
      collected.push(...r.places);
    }
  }

  if (groups.every((g) => !g.ok)) {
    await query(
      "update cities set import_status = 'failed', import_error = $2, imported_at = now() where id = $1",
      [
        cityId,
        groups
          .map((g) => g.error)
          .join(" | ")
          .slice(0, 1000),
      ],
    );
    throw new Error(`import failed for city ${cityId}: ${groups[0]?.error}`);
  }

  // Dedupe across groups (a brewery can match two selectors).
  const byId = new Map<string, PlaceInput>();
  for (const p of collected) if (!byId.has(p.source_id)) byId.set(p.source_id, p);
  const places = Array.from(byId.values());

  const sitelinks = await fetchSitelinkCounts(
    places.map((p) => p.wikidata_id).filter((x): x is string => Boolean(x)),
  );
  for (const p of places) {
    const n = p.wikidata_id ? sitelinks.get(p.wikidata_id) : undefined;
    if (n) p.prominence = Math.min(100, p.prominence + sitelinkBonus(n));
  }

  await upsertPlaces(cityId, places);
  const partial = groups.some((g) => !g.ok);
  await query(
    `update cities set import_status = 'done', imported_at = now(), import_error = $2 where id = $1`,
    [
      cityId,
      partial
        ? groups
            .filter((g) => !g.ok)
            .map((g) => `${g.key}: ${g.error}`)
            .join(" | ")
            .slice(0, 1000)
        : null,
    ],
  );
  return { cityId, places: places.length, groups, durationMs: Date.now() - started };
}

export async function upsertPlaces(cityId: number, places: PlaceInput[]) {
  if (places.length === 0) return;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const BATCH = 200;
    for (let i = 0; i < places.length; i += BATCH) {
      const batch = places.slice(i, i + BATCH);
      const values: unknown[] = [];
      const tuples = batch.map((p, j) => {
        const b = j * 16;
        values.push(
          cityId,
          p.source,
          p.source_id,
          p.name,
          p.category,
          p.subcategory,
          p.lat,
          p.lng,
          p.address,
          p.website,
          p.phone,
          p.opening_hours,
          p.wikidata_id,
          p.wikipedia,
          p.prominence,
          JSON.stringify(p.tags),
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16})`;
      });
      await client.query(
        `insert into places (city_id, source, source_id, name, category, subcategory, lat, lng, address, website, phone,
                             opening_hours, wikidata_id, wikipedia, prominence, tags)
         values ${tuples.join(",")}
         on conflict (source, source_id) do update set
           city_id = excluded.city_id, name = excluded.name, category = excluded.category, subcategory = excluded.subcategory,
           lat = excluded.lat, lng = excluded.lng, address = excluded.address, website = excluded.website,
           phone = excluded.phone, opening_hours = excluded.opening_hours, wikidata_id = excluded.wikidata_id,
           wikipedia = excluded.wikipedia, prominence = excluded.prominence, tags = excluded.tags`,
        values,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Claim + import in one call. Returns null when another worker already holds the claim. */
export async function claimAndImport(
  cityId: number,
  staleAfterDays = 90,
): Promise<ImportResult | null> {
  const row = await queryOne<{ claim_city_import: boolean }>(
    "select claim_city_import($1, make_interval(days => $2))",
    [cityId, staleAfterDays],
  );
  if (!row?.claim_city_import) return null;
  try {
    return await importCity(cityId);
  } catch (err) {
    await query(
      "update cities set import_status = 'failed', import_error = $2, imported_at = now() where id = $1",
      [cityId, String((err as Error).message).slice(0, 1000)],
    );
    throw err;
  }
}
