/**
 * Locals and visitors (migration 0006): city_stats counts each group and scores the city from
 * each group alone, the same way as the overall score. Needs DATABASE_URL; rolled back.
 */
import "dotenv/config";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("locals and visitors (database)", () => {
  const client = new Client({ connectionString: url });
  const local1 = "31111111-1111-4111-8111-111111111111";
  const local2 = "32222222-2222-4222-8222-222222222222";
  const visitor = "33333333-3333-4333-8333-333333333333";
  let cityId: number;
  const stats = async () =>
    (
      await client.query(
        `select rater_count, local_count, visitor_count, overall::float, local_overall::float,
                visitor_overall::float
         from city_stats where city_id = $1`,
        [cityId],
      )
    ).rows[0];
  const rate = async (user: string, role: "local" | "visitor" | null, stars: number) => {
    if (role)
      await client.query(
        `insert into city_raters (city_id, user_id, role) values ($1, $2, $3)
         on conflict (city_id, user_id) do update set role = excluded.role`,
        [cityId, user, role],
      );
    for (const d of ["safety", "food"])
      await client.query(
        `insert into city_ratings (city_id, user_id, dimension, stars) values ($1, $2, $3, $4)
         on conflict (city_id, user_id, dimension) do update set stars = excluded.stars`,
        [cityId, user, d, stars],
      );
  };

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      "insert into auth.users (id, email) values ($1, 'l1@example.com'), ($2, 'l2@example.com'), ($3, 'v@example.com')",
      [local1, local2, visitor],
    );
    // A city nobody has rated, so the numbers below are only ours.
    cityId = (
      await client.query<{ id: number }>(
        "select c.id from cities c left join city_stats s on s.city_id = c.id where coalesce(s.rating_count, 0) = 0 order by c.population desc limit 1",
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("counts locals and visitors and scores the city from each group", async () => {
    await rate(local1, "local", 5);
    await rate(local2, "local", 5);
    await rate(visitor, "visitor", 2);
    const s = await stats();
    expect(s).toMatchObject({ rater_count: 3, local_count: 2, visitor_count: 1 });
    expect(s.local_overall).toBeGreaterThan(s.overall);
    expect(s.visitor_overall).toBeLessThan(s.overall);
  });

  it("follows a change of answer", async () => {
    await client.query(
      "update city_raters set role = 'visitor' where city_id = $1 and user_id = $2",
      [cityId, local2],
    );
    expect(await stats()).toMatchObject({ local_count: 1, visitor_count: 2 });
  });

  it("stops counting someone whose ratings are deleted", async () => {
    await client.query("delete from city_ratings where city_id = $1 and user_id = $2", [
      cityId,
      local1,
    ]);
    const s = await stats();
    expect(s).toMatchObject({ rater_count: 2, local_count: 0, visitor_count: 2 });
    expect(s.local_overall).toBeNull();
  });
});
