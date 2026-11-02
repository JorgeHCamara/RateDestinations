/**
 * Import one city's places from OpenStreetMap, from the command line.
 *   pnpm tsx scripts/import-city.ts pt/lisbon
 *   pnpm tsx scripts/import-city.ts --id 2267057
 */
import "dotenv/config";
import { query, queryOne } from "../src/lib/db";
import { claimAndImport } from "../src/lib/import/import-city";

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("usage: import-city.ts <cc>/<slug> | --id <cityId>");
  let id: number;
  if (arg === "--id") id = Number(process.argv[3]);
  else {
    const [cc, slug] = arg.split("/");
    const row = await queryOne<{ id: number }>(
      "select id from cities where country_code = upper($1) and slug = $2",
      [cc, slug],
    );
    if (!row) throw new Error(`city ${arg} not found`);
    id = row.id;
  }
  if (process.argv.includes("--force"))
    await query("update cities set import_status = 'none' where id = $1", [id]);
  const result = await claimAndImport(id);
  if (!result) {
    console.log("city already imported recently (use --force to re-import)");
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  const counts = await query<{ category: string; n: string }>(
    "select category, count(*) n from places where city_id = $1 group by 1 order by 2 desc",
    [id],
  );
  console.table(counts);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
