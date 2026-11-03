/**
 * Database integration test for the rating flow: the triggers and functions in
 * supabase/migrations keep place_stats / city_stats in step with ratings, and the
 * guide queries surface warnings. Needs DATABASE_URL (local Postgres + PostGIS with the
 * migrations applied, see README); skipped otherwise. Everything runs in one transaction
 * that is rolled back.
 */
import "dotenv/config";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blendScore, placePrior } from "@/lib/scoring";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("ratings → stats (database)", () => {
  const client = new Client({ connectionString: url });
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";
  let cityId: number;
  let placeId: number;

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@example.com', '{\"full_name\":\"Ana\"}'), ($2, 'b@example.com', '{\"full_name\":\"Bea\"}')",
      [userA, userB],
    );
    const city = await client.query<{ id: number }>(
      "select id from cities order by population desc limit 1",
    );
    cityId = city.rows[0].id;
    const place = await client.query<{ id: number }>(
      `insert into places (city_id, source, source_id, name, category, lat, lng, prominence)
       select id, 'osm', 'node/test-1', 'Test Bistro', 'restaurant', lat, lng, 40 from cities where id = $1 returning id`,
      [cityId],
    );
    placeId = place.rows[0].id;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("creates a profile for a new auth user", async () => {
    const r = await client.query("select display_name from profiles where id = $1", [userA]);
    expect(r.rows[0].display_name).toBe("Ana");
  });

  it("gives a new place a prior-based score and blends ratings like lib/scoring", async () => {
    const before = await client.query(
      "select blended_score, user_count from place_stats where place_id = $1",
      [placeId],
    );
    expect(Number(before.rows[0].blended_score)).toBe(placePrior(null, 40));

    await client.query(
      "insert into place_ratings (place_id, user_id, stars, tags) values ($1, $2, 5, '{must_see}')",
      [placeId, userA],
    );
    const one = await client.query(
      "select blended_score, user_avg, user_count from place_stats where place_id = $1",
      [placeId],
    );
    expect(Number(one.rows[0].user_count)).toBe(1);
    expect(Number(one.rows[0].blended_score)).toBe(blendScore(5, 1, placePrior(null, 40)));

    await client.query(
      "insert into place_ratings (place_id, user_id, stars, tags) values ($1, $2, 1, '{dirty,scam}')",
      [placeId, userB],
    );
    const two = await client.query(
      "select blended_score, user_avg, warning_count, tag_counts from place_stats where place_id = $1",
      [placeId],
    );
    expect(Number(two.rows[0].user_avg)).toBe(3);
    expect(Number(two.rows[0].warning_count)).toBe(1);
    expect(two.rows[0].tag_counts).toEqual({ must_see: 1, dirty: 1, scam: 1 });
    expect(Number(two.rows[0].blended_score)).toBe(blendScore(3, 2, placePrior(null, 40)));
  });

  it("keeps a place with a single warning out of the city's watch-out list", async () => {
    // one warning from one person isn't enough (migration 0008; see tests/integration/watch-out.test.ts)
    const r = await client.query("select name from city_watch_out($1, 50)", [cityId]);
    expect(r.rows.map((x) => x.name)).not.toContain("Test Bistro");
  });

  it("rejects unknown tags and enforces the daily limit", async () => {
    await client.query("savepoint s");
    await expect(
      client.query(
        "insert into place_ratings (place_id, user_id, stars, tags) values ($1, $2, 3, '{bogus}') on conflict do nothing",
        [placeId, userA],
      ),
    ).rejects.toThrow(/unknown rating tag/);
    await client.query("rollback to savepoint s");
  });

  it("aggregates city dimensions with safety weighted higher", async () => {
    await client.query(
      "insert into city_ratings (city_id, user_id, dimension, stars) values ($1, $2, 'safety', 2), ($1, $2, 'food', 5)",
      [cityId, userA],
    );
    const r = await client.query(
      "select overall, dimensions, rating_count, rater_count from city_stats where city_id = $1",
      [cityId],
    );
    const dims = r.rows[0].dimensions as Record<
      string,
      { avg: number; count: number; score: number }
    >;
    expect(dims.safety.count).toBe(1);
    expect(dims.food.avg).toBe(5);
    // overall = what people gave, weighted: (1.5 * safety + 1.0 * food) / 2.5, not pulled
    // toward a neutral default (migration 0007)
    expect(Number(r.rows[0].overall)).toBeCloseTo((1.5 * 2 + 5) / 2.5, 2);
    // the blended per-dimension score is still kept (for ordering), the average is what's shown
    expect(dims.safety.score).toBeCloseTo(blendScore(2, 1, 3.5), 2);
    expect(Number(r.rows[0].rater_count)).toBe(1);
  });

  it("claims a city import once", async () => {
    await client.query(
      "update cities set import_status = 'none', imported_at = null where id = $1",
      [cityId],
    );
    const first = await client.query("select claim_city_import($1, interval '90 days') as ok", [
      cityId,
    ]);
    const second = await client.query("select claim_city_import($1, interval '90 days') as ok", [
      cityId,
    ]);
    expect(first.rows[0].ok).toBe(true);
    expect(second.rows[0].ok).toBe(false);
  });
});
