/**
 * Load places for a city from a recorded Overpass JSON response (no network).
 * Used for local development and CI end-to-end tests.
 *   pnpm tsx scripts/import-fixture.ts pt/lisbon tests/fixtures/overpass-lisbon.json
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { query, queryOne } from "../src/lib/db";
import { parseElements, type OverpassElement } from "../src/lib/import/overpass";
import { upsertPlaces } from "../src/lib/import/import-city";

async function main() {
  const [target, file] = process.argv.slice(2);
  if (!target || !file) throw new Error("usage: import-fixture.ts <cc>/<slug> <overpass.json>");
  const [cc, slug] = target.split("/");
  const city = await queryOne<{ id: number }>(
    "select id from cities where country_code = upper($1) and slug = $2",
    [cc, slug],
  );
  if (!city) throw new Error(`city ${target} not found`);
  const json = JSON.parse(await readFile(file, "utf8")) as { elements: OverpassElement[] };
  const places = parseElements(json.elements);
  await upsertPlaces(city.id, places);
  await query(
    "update cities set import_status = 'done', imported_at = now(), import_error = null where id = $1",
    [city.id],
  );
  console.log(`loaded ${places.length} places into ${target}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
