/**
 * Refresh src/data/wikidata-place-types.json: for each Wikidata class the famous-places lookup
 * uses (src/lib/import/famous.ts FAME_ROOTS), every class below it ("urban park" and "pocket park"
 * are kinds of park). Saved in the repository so city builds don't spend minutes asking Wikidata
 * for these, and still work when its query service is slow. Classes change rarely: run it now and
 * then, by hand:
 *
 *   pnpm tsx scripts/sync-wikidata-place-types.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FAME_ROOTS } from "../src/lib/import/famous";

const SPARQL = "https://query.wikidata.org/sparql";
const UA =
  process.env.IMPORT_USER_AGENT ?? "RateDestinations/1.0 (+https://www.ratedestinations.com)";

async function subclasses(root: string): Promise<string[]> {
  const query = `SELECT ?t WHERE { ?t wdt:P279* wd:${root} }`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(SPARQL, {
        method: "POST",
        headers: {
          accept: "application/sparql-results+json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": UA,
        },
        body: new URLSearchParams({ query, format: "json" }),
        signal: AbortSignal.timeout(70_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { results: { bindings: { t: { value: string } }[] } };
      return json.results.bindings.map((b) => b.t.value.split("/").pop()!).filter(Boolean);
    } catch (err) {
      console.error(`${root}: ${(err as Error).message} (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, attempt * 5_000));
    }
  }
  throw new Error(`could not read the subclasses of ${root}`);
}

async function main() {
  const out: Record<string, string[]> = {};
  for (const { qid, label } of FAME_ROOTS) {
    const list = (await subclasses(qid)).sort();
    // A class with tens of thousands of subclasses is a catalogue of single works, not a kind
    // of place; refuse rather than bloat the file.
    if (list.length > 20_000) throw new Error(`${qid} (${label}) has ${list.length} subclasses`);
    out[qid] = list;
    console.log(`${qid} ${label}: ${list.length}`);
  }
  const file = join(__dirname, "../src/data/wikidata-place-types.json");
  writeFileSync(file, `${JSON.stringify(out)}\n`);
  console.log(`wrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
