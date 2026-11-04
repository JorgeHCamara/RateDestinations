/**
 * Build city guides from Overture Maps, offline. Run by .github/workflows/overture-import.yml on a
 * schedule, or by hand:
 *
 *   DATABASE_URL=... pnpm tsx scripts/import-overture.ts                 # requested + backfill
 *   DATABASE_URL=... pnpm tsx scripts/import-overture.ts --city ca/vaughan
 *   DATABASE_URL=... pnpm tsx scripts/import-overture.ts --continent EU --min-population 200000 --backfill 1000
 *   DATABASE_URL=... pnpm tsx scripts/import-overture.ts --countries US,CA,AU --min-population 200000 --backfill 1000
 *
 * --continent (AF, AS, EU, NA, OC, SA) and --countries (ISO codes) pick which cities the backfill
 * builds, biggest first, down to --min-population; without them it is the world's --top biggest.
 *
 * Safety stop: before each new guide the database size is checked, and the backfill stops at
 * --max-db-mb (default 400; the free Supabase plan allows 500 MB, and a full database turns
 * read-only, which would stop people saving ratings). Rebuilding guides that exist, and cities
 * visitors opened, always go ahead: they replace places rather than add many.
 *
 * Each run: (1) cities visitors opened (queued by the build route, or imported live at any point)
 * whose guide isn't built from the current release yet, newest first; (2) then the most populous cities not built yet, up to --top. Stops after
 * --max-minutes so scheduled runs never overlap.
 */
import "dotenv/config";
import { DuckDBInstance } from "@duckdb/node-api";
import { getPool, query, queryOne } from "../src/lib/db";
import { mergePlaces } from "../src/lib/import/merge";
import { radiusForPopulation } from "../src/lib/import/overpass";
import {
  bboxAround,
  latestOvertureRelease,
  OVERTURE_PIPELINE,
  overtureQuery,
  selectOverturePlaces,
  type OvertureRow,
} from "../src/lib/import/overture";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value && !value.startsWith("--") ? value : fallback;
}

/** "EU" or "us, ca,AU" → ["EU"] / ["US", "CA", "AU"]; null when not given. */
function listArg(name: string): string[] | null {
  const list = (arg(name) ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length ? list : null;
}

async function databaseMb(): Promise<number> {
  const row = await queryOne<{ bytes: string }>(
    "select pg_database_size(current_database())::text as bytes",
  );
  return Number(row?.bytes ?? 0) / 1024 / 1024;
}

type CityRow = {
  /** A new guide from the backfill (counts against --max-db-mb), not a rebuild or a request. */
  isNew?: boolean;
  id: number;
  name: string;
  country_code: string;
  slug: string;
  lat: number;
  lng: number;
  population: number;
};

async function main() {
  const top = Number(arg("top", process.env.OVERTURE_TOP_CITIES ?? "300"));
  const requestedLimit = Number(arg("requested", "40"));
  const backfillLimit = Number(arg("backfill", "25"));
  const maxMinutes = Number(arg("max-minutes", "20"));
  const perCategory = Number(process.env.OVERTURE_PER_CATEGORY ?? 50);
  const maxDbMb = Number(arg("max-db-mb", process.env.OVERTURE_MAX_DB_MB ?? "400"));
  const continents = listArg("continent");
  const countries = listArg("countries");
  const minPopulation = Number(arg("min-population", "0"));
  const filtered = Boolean(continents || countries || minPopulation > 0);
  const deadline = Date.now() + maxMinutes * 60_000;

  const release = arg("release") ?? (await latestOvertureRelease());
  // What a city's guide was built from: the data release plus the version of our selection rules.
  const build = `${release}+${OVERTURE_PIPELINE}`;
  console.log(`Overture release ${release}, pipeline ${OVERTURE_PIPELINE}`);

  let cities: CityRow[];
  const one = arg("city");
  if (one) {
    const [cc, slug] = one.split("/");
    const row = await queryOne<CityRow>(
      "select id, name, country_code, slug, lat, lng, population from cities where country_code = upper($1) and slug = $2",
      [cc, slug],
    );
    if (!row) throw new Error(`city ${one} not found`);
    cities = [row];
  } else {
    const requested = await query<CityRow>(
      `select id, name, country_code, slug, lat, lng, population from cities
       where (requested_at is not null or imported_at is not null)
         and overture_release is distinct from $1
       order by coalesce(requested_at, imported_at) desc limit $2`,
      [build, requestedLimit],
    );
    const backfill = filtered
      ? await query<CityRow>(
          `select c.id, c.name, c.country_code, c.slug, c.lat, c.lng, c.population
           from cities c join countries co on co.code = c.country_code
           where ($2::text[] is null or co.continent = any($2))
             and ($3::text[] is null or trim(c.country_code) = any($3))
             and c.population >= $4
             and c.overture_release is distinct from $1
           order by c.population desc limit $5`,
          [build, continents, countries, minPopulation, backfillLimit],
        )
      : await query<CityRow>(
          `select id, name, country_code, slug, lat, lng, population from (
             select * from cities order by population desc limit $2
           ) top where overture_release is distinct from $1
           order by population desc limit $3`,
          [build, top, backfillLimit],
        );
    if (filtered)
      console.log(
        `backfill: ${continents?.join(",") ?? "any continent"}, ${countries?.join(",") ?? "any country"}, population ${minPopulation.toLocaleString("en-US")}+`,
      );
    const seen = new Set<number>();
    cities = [...requested, ...backfill.map((c) => ({ ...c, isNew: true }))].filter(
      (c) => !seen.has(c.id) && seen.add(c.id),
    );
  }
  console.log(`${cities.length} cities to build`);
  if (!cities.length) return;

  const db = await DuckDBInstance.create(":memory:");
  const duck = await db.connect();
  await duck.run("INSTALL httpfs; LOAD httpfs;");
  // Overture's bucket is public: ask anonymously, ignoring any AWS credentials in the environment.
  await duck.run(
    "CREATE OR REPLACE SECRET overture (TYPE s3, PROVIDER config, KEY_ID '', SECRET '', REGION 'us-west-2')",
  );

  console.log(`database ${(await databaseMb()).toFixed(1)} MB, safety stop at ${maxDbMb} MB`);
  let built = 0;
  let stoppedForSize = false;
  for (const city of cities) {
    if (Date.now() > deadline) {
      console.log("time limit reached; the next run continues");
      break;
    }
    if (city.isNew && (stoppedForSize || (await databaseMb()) >= maxDbMb)) {
      if (!stoppedForSize)
        console.log(
          `SAFETY STOP: database is ${(await databaseMb()).toFixed(1)} MB (limit ${maxDbMb} MB); no new guides added`,
        );
      stoppedForSize = true;
      continue; // rebuilds and visitors' cities later in the list still go ahead
    }
    const started = Date.now();
    try {
      const radius = radiusForPopulation(city.population);
      const reader = await duck.runAndReadAll(
        overtureQuery(release, bboxAround(city.lat, city.lng, radius)),
      );
      const rows = reader.getRowObjectsJS() as unknown as OvertureRow[];
      const places = selectOverturePlaces(rows, city, { perCategory });
      const { added, enriched } = await mergePlaces(city.id, places);
      // Overture places this build no longer selects (filtered out, or below the cap) go, unless
      // someone has rated them.
      const pruned = await query(
        `delete from places p where p.city_id = $1 and p.source = 'overture'
           and p.source_id <> all($2::text[])
           and not exists (select 1 from place_ratings r where r.place_id = p.id)
         returning p.id`,
        [city.id, places.map((p) => p.source_id)],
      );
      // imported_at doubles as the guide's cache version: bumping it shows the new places.
      await query(
        `update cities set overture_release = $2, overture_imported_at = now(), imported_at = now(),
                import_status = case when $3 > 0 or import_status = 'done' then 'done'::import_status else import_status end,
                import_error = case when $3 > 0 then null else import_error end
         where id = $1`,
        [city.id, build, places.length],
      );
      built++;
      console.log(
        `${city.country_code.toLowerCase()}/${city.slug}: ${rows.length} candidates, ${places.length} kept (${added} added, ${enriched} merged, ${pruned.length} dropped) in ${Date.now() - started}ms`,
      );
    } catch (err) {
      console.error(
        `${city.country_code.toLowerCase()}/${city.slug} failed: ${(err as Error).message}`,
      );
    }
  }
  console.log(`built ${built} of ${cities.length}; database ${(await databaseMb()).toFixed(1)} MB`);
}

main()
  .then(() => getPool().end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
