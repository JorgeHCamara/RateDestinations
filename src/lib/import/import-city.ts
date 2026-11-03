import { getPool, query, queryOne } from "@/lib/db";
import {
  QUERY_GROUPS,
  buildGroupQuery,
  fetchOverpass,
  parseElements,
  type FetchOverpassOptions,
  radiusForPopulation,
  type PlaceInput,
} from "./overpass";
import { PLACE_CATEGORIES, type PlaceCategory } from "./categories";
import { fetchGeoapifyCategory, isGeoapifyEnabled } from "./geoapify";
import { fetchSitelinkCounts, sitelinkBonus } from "./wikidata";

export type ImportResult = {
  cityId: number;
  places: number;
  groups: { key: string; ok: boolean; elements: number; error?: string }[];
  durationMs: number;
};

type CityRow = { id: number; name: string; lat: number; lng: number; population: number };

/**
 * Total time an import may take. Vercel stops the function at maxDuration (300 s); the import
 * must have written its final status well before that, or the city looks stuck.
 */
export const IMPORT_BUDGET_MS = 240_000;
/** Geoapify gets at most this much of the budget, leaving the rest for the Overpass fallback. */
const GEOAPIFY_SHARE_MS = 110_000;

/** Which of our categories each Overpass query group covers. */
const GROUP_CATEGORIES: Record<string, PlaceCategory[]> = {
  food: ["restaurant"],
  cafe_bar: ["cafe", "bar", "nightlife"],
  sights: ["attraction", "museum", "viewpoint"],
  outdoors_shopping: ["park", "beach", "market", "shopping"],
};

export type ImportOptions = {
  budgetMs?: number;
  now?: () => number;
  fetchOptions?: Omit<FetchOverpassOptions, "deadline" | "now">;
};

/**
 * Import (or refresh) a city's places live, from OpenStreetMap data: through Geoapify when
 * GEOAPIFY_API_KEY is set, then the public Overpass servers for whatever Geoapify missed.
 * Caller must have claimed the city with claim_city_import() first (see claimAndImport).
 *
 * Saves each search's places as soon as they arrive, so a partial guide survives a slow server. Always writes a final status (done, or failed with the
 * reasons) before the budget runs out.
 */
export async function importCity(cityId: number, opts: ImportOptions = {}): Promise<ImportResult> {
  const now = opts.now ?? Date.now;
  const started = now();
  const deadline = started + (opts.budgetMs ?? IMPORT_BUDGET_MS);
  const city = await queryOne<CityRow>(
    "select id, name, lat, lng, population from cities where id = $1",
    [cityId],
  );
  if (!city) throw new Error(`city ${cityId} not found`);
  const radius = radiusForPopulation(city.population);

  const groups: ImportResult["groups"] = [];
  const saved = new Map<string, PlaceInput>();
  // Saves run one at a time so two groups never upsert the same place concurrently.
  let saving: Promise<void> = Promise.resolve();
  const save = (places: PlaceInput[]) => {
    const fresh = places.filter((p) => !saved.has(p.source_id));
    for (const p of fresh) saved.set(p.source_id, p);
    // A failed save must not poison the saves queued after it.
    saving = saving.catch(() => {}).then(() => upsertPlaces(cityId, fresh));
    return saving;
  };

  // Sources are tried as a chain, so one being down only thins a guide out:
  //  1. Geoapify (when GEOAPIFY_API_KEY is set): one request per category, three at a time,
  //     limited to the first part of the budget so there is time left for the next source.
  //  2. The public Overpass servers, only for the categories Geoapify didn't deliver.
  // Overture Maps fills in the rest offline (scripts/import-overture.ts), triggered by the visit.
  type Task = { key: string; run: () => Promise<PlaceInput[]> };
  const runTasks = async (tasks: Task[], concurrency: number) => {
    const queue = [...tasks];
    const worker = async () => {
      for (let task = queue.shift(); task; task = queue.shift()) {
        try {
          const places = await task.run();
          await save(places);
          groups.push({ key: task.key, ok: true, elements: places.length });
        } catch (err) {
          groups.push({ key: task.key, ok: false, elements: 0, error: (err as Error).message });
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    await saving;
  };

  const useGeoapify = isGeoapifyEnabled() && !opts.fetchOptions;
  let missing = new Set<string>(PLACE_CATEGORIES);
  if (useGeoapify) {
    const geoDeadline = Math.min(deadline, started + GEOAPIFY_SHARE_MS);
    await runTasks(
      PLACE_CATEGORIES.map((category) => ({
        key: `geoapify:${category}`,
        run: () => fetchGeoapifyCategory(city, category, { deadline: geoDeadline, now }),
      })),
      3,
    );
    missing = new Set(
      PLACE_CATEGORIES.filter((c) => !groups.some((g) => g.key === `geoapify:${c}` && g.ok)),
    );
  }
  const overpassGroups = QUERY_GROUPS.filter((g) =>
    GROUP_CATEGORIES[g.key]?.some((c) => missing.has(c)),
  );
  // After Geoapify, only start Overpass with time worth using; without Geoapify it is the first source.
  if (overpassGroups.length && (!useGeoapify || deadline - now() > 30_000)) {
    await runTasks(
      overpassGroups.map((group) => ({
        key: `overpass:${group.key}`,
        run: async () =>
          parseElements(
            await fetchOverpass(buildGroupQuery(group, city.lat, city.lng, radius), {
              ...opts.fetchOptions,
              deadline,
              now,
            }),
          ),
      })),
      Math.max(1, Number(process.env.OVERPASS_CONCURRENCY ?? 2)),
    );
  }

  const failures = groups
    .filter((g) => !g.ok)
    .map((g) => `${g.key}: ${g.error}`)
    .join(" | ")
    .slice(0, 1000);

  // Nothing saved means nothing to show: record it as a failure so the city can be retried,
  // rather than "done" with an empty guide (searches that answered with zero places count too).
  if (saved.size === 0) {
    const reason = failures || "every search answered with no places";
    // Another source (the Overture job) may already have built this guide: keep it visible.
    const existing = await queryOne<{ n: number }>(
      "select count(*)::int as n from places where city_id = $1",
      [cityId],
    );
    if (existing && existing.n > 0) {
      await query(
        "update cities set import_status = 'done', import_error = $2, imported_at = now() where id = $1",
        [
          cityId,
          `live sources failed, kept ${existing.n} existing places: ${reason}`.slice(0, 1000),
        ],
      );
      return { cityId, places: 0, groups, durationMs: now() - started };
    }
    await query(
      "update cities set import_status = 'failed', import_error = $2, imported_at = now() where id = $1",
      [cityId, reason],
    );
    throw new Error(`import failed for city ${cityId}: ${reason}`);
  }

  // Wikidata notability is a bonus: only with time to spare, and bounded by the same deadline.
  if (deadline - now() > 20_000) {
    const places = Array.from(saved.values());
    const sitelinks = await fetchSitelinkCounts(
      places.map((p) => p.wikidata_id).filter((x): x is string => Boolean(x)),
      fetch,
      deadline - 5_000,
    );
    const boosted = places.filter((p) => p.wikidata_id && sitelinks.get(p.wikidata_id));
    for (const p of boosted) {
      p.prominence = Math.min(100, p.prominence + sitelinkBonus(sitelinks.get(p.wikidata_id!)!));
    }
    if (boosted.length) await upsertPlaces(cityId, boosted);
  }

  await query(
    `update cities set import_status = 'done', imported_at = now(), import_error = $2 where id = $1`,
    [cityId, failures || null],
  );
  return { cityId, places: saved.size, groups, durationMs: now() - started };
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
