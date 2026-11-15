/**
 * Import invalidation rules (migration 0015, lib/import/guide-changes.ts): a city's guide hash
 * changes only with its content, and city-directory/sitemap are due at most once a day.
 * Local database; state restored after.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, query, queryOne } from "@/lib/db";
import { directoryTagsDue, EMPTY_GUIDE, guideHash } from "@/lib/import/guide-changes";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("guide change tracking (database)", () => {
  let cityId: number;
  let saved: { key: string; value: string | null; updated_at: string }[] = [];
  beforeAll(async () => {
    cityId = (await queryOne<{ id: number }>(
      "select id from cities c where not exists (select 1 from places p where p.city_id = c.id) order by population asc offset 7 limit 1",
    ))!.id;
    saved = await query("select key, value, updated_at::text from site_state");
    await query("delete from site_state");
  });
  afterAll(async () => {
    await query("delete from places where city_id = $1 and source_id like 'gc-test-%'", [cityId]);
    await query("delete from site_state");
    for (const s of saved)
      await query("insert into site_state (key, value, updated_at) values ($1, $2, $3)", [
        s.key,
        s.value,
        s.updated_at,
      ]);
    await getPool().end();
  });

  it("hashes what the guide shows, and only that", async () => {
    expect(await guideHash(cityId)).toBe(EMPTY_GUIDE);
    await query(
      `insert into places (city_id, source, source_id, name, category, lat, lng, prominence)
       select $1, 'overture', 'gc-test-1', 'Test Garden', 'park', lat, lng, 50 from cities where id = $1`,
      [cityId],
    );
    const one = await guideHash(cityId);
    expect(one).not.toBe(EMPTY_GUIDE);
    // something the guide doesn't show: same hash
    await query(
      "update places set updated_at = now() where source_id = 'gc-test-1' and city_id = $1",
      [cityId],
    );
    expect(await guideHash(cityId)).toBe(one);
    // a new name: a new hash
    await query(
      "update places set name = 'Test Gardens' where source_id = 'gc-test-1' and city_id = $1",
      [cityId],
    );
    expect(await guideHash(cityId)).not.toBe(one);
  });

  it("makes city-directory and sitemap due at most once a day, and keeps a change waiting", async () => {
    expect(await directoryTagsDue(false)).toBe(false); // nothing changed
    expect(await directoryTagsDue(true)).toBe(true); // first change: due
    expect(await directoryTagsDue(true)).toBe(false); // again within 24 h: waits
    expect(await directoryTagsDue(false)).toBe(false); // still within 24 h
    await query(
      "update site_state set updated_at = now() - interval '25 hours' where key = 'directory_revalidated_at'",
    );
    expect(await directoryTagsDue(false)).toBe(true); // the waiting change goes out
    await query(
      "update site_state set updated_at = now() - interval '25 hours' where key = 'directory_revalidated_at'",
    );
    expect(await directoryTagsDue(false)).toBe(false); // nothing waiting any more
  });
});
