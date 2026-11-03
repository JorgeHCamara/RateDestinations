/**
 * Build city guides from Overture Maps, offline. Run by .github/workflows/overture-import.yml on a
 * schedule, or by hand:
 *
 *   DATABASE_URL=... pnpm tsx scripts/import-overture.ts                 # requested + backfill
 *   DATABASE_URL=... pnpm tsx scripts/import-overture.ts --city ca/vaughan
 *
 * Each run: (1) cities visitors opened whose guide isn't built from the current release yet,
 * newest request first; (2) then the most populous cities not built yet, up to --top. Stops after
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
  overtureQuery,
  selectOverturePlaces,
  type OvertureRow,
} from "../src/lib/import/overture";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

type CityRow = {
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
  const perCategory = Number(process.env.OVERTURE_PER_CATEGORY ?? 40);
  const deadline = Date.now() + maxMinutes * 60_000;

  const release = arg("release") ?? (await latestOvertureRelease());
  console.log(`Overture release ${release}`);

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
       where requested_at is not null and overture_release is distinct from $1
       order by requested_at desc limit $2`,
      [release, requestedLimit],
    );
    const backfill = await query<CityRow>(
      `select id, name, country_code, slug, lat, lng, population from (
         select * from cities order by population desc limit $2
       ) top where overture_release is distinct from $1
       order by population desc limit $3`,
      [release, top, backfillLimit],
    );
    const seen = new Set<number>();
    cities = [...requested, ...backfill].filter((c) => !seen.has(c.id) && seen.add(c.id));
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

  let built = 0;
  for (const city of cities) {
    if (Date.now() > deadline) {
      console.log("time limit reached; the next run continues");
      break;
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
      // imported_at doubles as the guide's cache version: bumping it shows the new places.
      await query(
        `update cities set overture_release = $2, overture_imported_at = now(), imported_at = now(),
                import_status = case when $3 > 0 or import_status = 'done' then 'done'::import_status else import_status end,
                import_error = case when $3 > 0 then null else import_error end
         where id = $1`,
        [city.id, release, places.length],
      );
      built++;
      console.log(
        `${city.country_code.toLowerCase()}/${city.slug}: ${rows.length} candidates, ${places.length} kept (${added} added, ${enriched} merged) in ${Date.now() - started}ms`,
      );
    } catch (err) {
      console.error(
        `${city.country_code.toLowerCase()}/${city.slug} failed: ${(err as Error).message}`,
      );
    }
  }
  console.log(`built ${built} of ${cities.length}`);
}

main()
  .then(() => getPool().end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
