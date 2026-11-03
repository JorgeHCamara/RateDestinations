/**
 * Seeds countries + cities through the Supabase Data API (HTTPS) instead of a direct
 * Postgres connection, for environments that only allow web traffic.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/seed-cities-rest.ts
 *
 * Needs the schema applied and service_role granted on the public tables (see README).
 * Idempotent: upserts countries by code and cities by geonames_id.
 */
import "dotenv/config";
import { loadGeoNames } from "./seed-cities";

const base = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
  /\/$/,
  "",
);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function upsert(table: string, conflict: string, rows: object[]) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${base}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (res.ok) return;
    const text = await res.text();
    if (attempt >= 4 || res.status < 500)
      throw new Error(`${table}: HTTP ${res.status} ${text.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

async function main() {
  if (!base || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const { countries, rows } = await loadGeoNames();
  await upsert("countries", "code", countries);
  console.log(`upserted ${countries.length} countries`);
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await upsert("cities", "geonames_id", rows.slice(i, i + BATCH));
    process.stdout.write(`\rupserted ${Math.min(i + BATCH, rows.length)}/${rows.length} cities`);
  }
  console.log("\ndone");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
