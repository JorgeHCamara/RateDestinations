/**
 * Seeds countries + cities from GeoNames (CC BY 4.0, https://www.geonames.org/).
 *
 *   DATABASE_URL=postgres://... pnpm db:seed:cities
 *
 * Downloads cities15000.zip, countryInfo.txt and admin1CodesASCII.txt into ./data (git-ignored)
 * unless they are already there, then upserts ~30k populated places with population >= 15,000.
 * Safe to re-run: existing rows are updated by geonames_id; import status is preserved.
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { Client } from "pg";
import { slugify, stripDiacritics } from "../src/lib/slug";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, "data");
const BASE = "https://download.geonames.org/export/dump/";

// Populated-place feature codes we keep. Sections of cities (PPLX), abandoned, historical and
// capital-of-division duplicates are skipped so each city appears once.
const KEEP_FEATURE_CODES = new Set([
  "PPL",
  "PPLA",
  "PPLA2",
  "PPLA3",
  "PPLA4",
  "PPLA5",
  "PPLC",
  "PPLG",
  "PPLL",
  "PPLS",
  "PPLF",
  "PPLR",
]);

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(name: string) {
  const target = path.join(dataDir, name);
  if (await exists(target)) return target;
  console.log(`downloading ${name}`);
  const res = await fetch(BASE + name, {
    headers: { "user-agent": process.env.IMPORT_USER_AGENT ?? "RateDestinations" },
  });
  if (!res.ok || !res.body) throw new Error(`download failed for ${name}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target));
  return target;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await mkdir(dataDir, { recursive: true });

  const zip = await download("cities15000.zip");
  const txt = path.join(dataDir, "cities15000.txt");
  if (!(await exists(txt))) await execFileAsync("unzip", ["-o", "-q", zip, "-d", dataDir]);
  const countryInfo = await readFile(await download("countryInfo.txt"), "utf8");
  const admin1 = await readFile(await download("admin1CodesASCII.txt"), "utf8");
  const cities = await readFile(txt, "utf8");

  // --- countries ---
  const countries: { code: string; name: string; continent: string }[] = [];
  for (const line of countryInfo.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const c = line.split("\t");
    if (c[0]?.length === 2) countries.push({ code: c[0], name: c[4], continent: c[8] });
  }

  // --- admin1 names, keyed "CC.CODE" ---
  const admin1Names = new Map<string, string>();
  for (const line of admin1.split("\n")) {
    const c = line.split("\t");
    if (c[0]) admin1Names.set(c[0], c[1]);
  }

  // --- cities ---
  type Row = {
    geonames_id: number;
    name: string;
    ascii_name: string;
    search_name: string;
    alt_names: string[];
    country_code: string;
    admin1: string | null;
    population: number;
    lat: number;
    lng: number;
    slug: string;
    timezone: string | null;
  };
  const rows: Row[] = [];
  const countryCodes = new Set(countries.map((c) => c.code));
  for (const line of cities.split("\n")) {
    if (!line) continue;
    const c = line.split("\t");
    if (c[6] !== "P" || !KEEP_FEATURE_CODES.has(c[7])) continue;
    const countryCode = c[8];
    if (!countryCodes.has(countryCode)) continue;
    const asciiName = c[2] || stripDiacritics(c[1]);
    const alt = c[3]
      ? Array.from(
          new Set(
            c[3]
              .split(",")
              .map((a) => stripDiacritics(a).toLowerCase().trim())
              .filter((a) => a.length >= 2 && a.length <= 60),
          ),
        ).slice(0, 40)
      : [];
    rows.push({
      geonames_id: Number(c[0]),
      name: c[1],
      ascii_name: asciiName,
      search_name: asciiName.toLowerCase(),
      alt_names: alt,
      country_code: countryCode,
      admin1: admin1Names.get(`${countryCode}.${c[10]}`) ?? null,
      population: Number(c[14]) || 0,
      lat: Number(c[4]),
      lng: Number(c[5]),
      slug: slugify(asciiName) || `city-${c[0]}`,
      timezone: c[17] || null,
    });
  }

  // Unique (country, slug): bigger city keeps the plain slug, others get a suffix.
  rows.sort((a, b) => b.population - a.population);
  const taken = new Set<string>();
  for (const r of rows) {
    let slug = r.slug;
    if (taken.has(`${r.country_code}/${slug}`)) {
      const withAdmin = r.admin1 ? `${r.slug}-${slugify(r.admin1)}` : "";
      slug =
        withAdmin && !taken.has(`${r.country_code}/${withAdmin}`)
          ? withAdmin
          : `${r.slug}-${r.geonames_id}`;
    }
    r.slug = slug;
    taken.add(`${r.country_code}/${slug}`);
  }
  console.log(`parsed ${countries.length} countries, ${rows.length} cities`);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    for (const c of countries) {
      await client.query(
        `insert into countries (code, name, continent) values ($1, $2, $3)
         on conflict (code) do update set name = excluded.name, continent = excluded.continent`,
        [c.code, c.name, c.continent],
      );
    }
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values: unknown[] = [];
      const tuples = batch.map((r, j) => {
        const b = j * 12;
        values.push(
          r.geonames_id,
          r.name,
          r.ascii_name,
          r.search_name,
          r.alt_names,
          r.country_code,
          r.admin1,
          r.population,
          r.lat,
          r.lng,
          r.slug,
          r.timezone,
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`;
      });
      await client.query(
        `insert into cities (geonames_id, name, ascii_name, search_name, alt_names, country_code, admin1, population, lat, lng, slug, timezone)
         values ${tuples.join(",")}
         on conflict (geonames_id) do update set
           name = excluded.name, ascii_name = excluded.ascii_name, search_name = excluded.search_name,
           alt_names = excluded.alt_names, country_code = excluded.country_code, admin1 = excluded.admin1,
           population = excluded.population, lat = excluded.lat, lng = excluded.lng, timezone = excluded.timezone`,
        values,
      );
      process.stdout.write(`\rinserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    }
    await client.query("commit");
    console.log("\ndone");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
