/**
 * Look up photos for the places guides show first (the top six per category), so the first
 * visitor to hover them doesn't wait. Run by .github/workflows/overture-import.yml after the
 * Overture build, or by hand:
 *
 *   DATABASE_URL=... pnpm tsx scripts/resolve-images.ts --max-minutes 5
 *   DATABASE_URL=... pnpm tsx scripts/resolve-images.ts --city ca/vaughan
 *
 * Cities visitors opened most recently go first, then the most populous. Places already looked up
 * in the last 30 days are skipped.
 */
import "dotenv/config";
import { getPool, query } from "../src/lib/db";
import { findPlaceImage, IMAGE_TTL_DAYS, savePlaceImage } from "../src/lib/images/place-image";
import type { PlaceCategory } from "../src/lib/import/categories";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

type Row = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  website: string | null;
  wikidata_id: string | null;
  category: PlaceCategory;
  city: string;
};

async function main() {
  const maxMinutes = Number(arg("max-minutes", "5"));
  const perCity = Number(arg("per-category", "6"));
  const limit = Number(arg("limit", "2000"));
  // Wikidata's query service throttles bursts; four at a time stays under it.
  const concurrency = Number(arg("concurrency", "4"));
  const deadline = Date.now() + maxMinutes * 60_000;
  const one = arg("city");

  const places = await query<Row>(
    `select p.id, p.name, p.lat, p.lng, p.website, p.wikidata_id, p.category::text as category,
            c.country_code || '/' || c.slug as city
     from (select * from cities
           where import_status = 'done'
             and ($4::text is null or lower(country_code) || '/' || slug = lower($4))
           order by requested_at desc nulls last, population desc
           limit 400) c
     cross join lateral city_top_places(c.id, $1) t
     join places p on p.id = t.id
     where p.image_checked_at is null or p.image_checked_at < now() - make_interval(days => $2)
     order by c.requested_at desc nulls last, c.population desc, t.rank
     limit $3`,
    [perCity, IMAGE_TTL_DAYS, limit, one ?? null],
  );
  console.log(`${places.length} places to look up`);

  let found = 0;
  let done = 0;
  const queue = [...places];
  const worker = async () => {
    for (let p = queue.shift(); p && Date.now() < deadline; p = queue.shift()) {
      try {
        // Claim it, so the site doesn't look the same place up at the same time.
        await query("update places set image_checked_at = now() where id = $1", [p.id]);
        const result = await findPlaceImage(p);
        const image = await savePlaceImage(p, result);
        if (image) found++;
        if (result.adult) console.log(`${p.city} #${p.id} ${p.name}: flagged adult by its website`);
        done++;
        if (done % 50 === 0) console.log(`${done} looked up, ${found} photos`);
      } catch (err) {
        console.error(`${p.city} #${p.id} ${p.name}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`looked up ${done} of ${places.length} places, found ${found} photos`);
}

main()
  .then(() => getPool().end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
