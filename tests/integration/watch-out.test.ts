/**
 * Watch out (migration 0008): a place is listed once at least 2 people warned about it (1-2 stars
 * or a warning tag) and they are at least a third of its ratings. Needs DATABASE_URL; rolled back.
 */
import "dotenv/config";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isWatchOut } from "@/lib/watch-out";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

describe("watch-out rule", () => {
  it("needs 2 warnings that are at least a third of the ratings", () => {
    expect(isWatchOut(1, 1)).toBe(false);
    expect(isWatchOut(2, 2)).toBe(true);
    expect(isWatchOut(2, 6)).toBe(true);
    expect(isWatchOut(2, 7)).toBe(false);
    expect(isWatchOut(5, 50)).toBe(false);
  });
});

run("watch-out list (database)", () => {
  const client = new Client({ connectionString: url });
  const users = Array.from(
    { length: 10 },
    (_, i) => `6${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`,
  );
  let cityId: number;
  let placeId: number;
  const listed = async () =>
    (await client.query("select id from city_watch_out($1, 50)", [cityId])).rows.some(
      (r) => String(r.id) === String(placeId), // bigint ids come back as text here
    );
  const rate = (user: string, stars: number, tags: string[] = []) =>
    client.query(
      "insert into place_ratings (place_id, user_id, stars, tags) values ($1, $2, $3, $4)",
      [placeId, user, stars, tags],
    );

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    for (const [i, id] of users.entries())
      await client.query("insert into auth.users (id, email) values ($1, $2)", [
        id,
        `w${i}@example.com`,
      ]);
    cityId = (
      await client.query<{ id: number }>("select id from cities order by population desc limit 1")
    ).rows[0].id;
    placeId = (
      await client.query<{ id: number }>(
        `insert into places (city_id, source, source_id, name, category, lat, lng)
         select id, 'osm', 'node/watch-out-test', 'Watch Out Diner', 'restaurant', lat, lng from cities where id = $1
         returning id`,
        [cityId],
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("does not list a place after one warning", async () => {
    await rate(users[0], 1, ["dirty"]);
    expect(await listed()).toBe(false);
  });

  it("lists it once a second person warns", async () => {
    await rate(users[1], 4, ["overpriced"]); // good stars but a warning tag still counts
    expect(await listed()).toBe(true);
  });

  it("drops it again when most people are happy", async () => {
    for (const u of users.slice(2, 7)) await rate(u, 5); // 2 warnings of 7 ratings: under a third
    expect(await listed()).toBe(false);
  });
});
