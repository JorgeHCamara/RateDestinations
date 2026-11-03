/**
 * The import always ends with a final status inside its budget: partial results are saved and
 * the city marked done; when every search fails the city is marked failed. Uses the local
 * database (DATABASE_URL) and a fake Overpass; skipped without a database. Cleans up after itself.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, query, queryOne } from "@/lib/db";
import { importCity } from "@/lib/import/import-city";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("importCity (database)", () => {
  let cityId: number;

  beforeAll(async () => {
    const row = await queryOne<{ id: number }>(
      "select id from cities where import_status = 'none' order by population asc limit 1",
    );
    cityId = row!.id;
  });

  afterAll(async () => {
    await query("delete from places where city_id = $1", [cityId]);
    await query(
      "update cities set import_status = 'none', imported_at = null, import_error = null where id = $1",
      [cityId],
    );
    await getPool().end();
  });

  const cafe = {
    type: "node",
    id: 9_000_001,
    lat: 1,
    lon: 1,
    tags: { amenity: "cafe", name: "Test Café" },
  };
  const restaurant = {
    type: "node",
    id: 9_000_002,
    lat: 1,
    lon: 1,
    tags: { amenity: "restaurant", name: "Test Bistro" },
  };

  it("saves what succeeded and marks the city done with the failures noted", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const q = new URLSearchParams(String(init?.body)).get("data") ?? "";
      if (q.includes('"amenity"="restaurant"')) return Response.json({ elements: [restaurant] });
      if (q.includes('"amenity"="cafe"')) return Response.json({ elements: [cafe] });
      return new Response("busy", { status: 504 });
    };
    const started = Date.now();
    const result = await importCity(cityId, {
      budgetMs: 15_000,
      fetchOptions: { endpoints: ["https://fake/api"], fetchImpl, sleep: async () => {} },
    });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(result.places).toBe(2);
    expect(
      result.groups
        .filter((g) => g.ok)
        .map((g) => g.key)
        .sort(),
    ).toEqual(["cafe_bar", "food"]);
    const city = await queryOne<{ import_status: string; import_error: string }>(
      "select import_status, import_error from cities where id = $1",
      [cityId],
    );
    expect(city?.import_status).toBe("done");
    expect(city?.import_error).toMatch(/sights: .*504/);
    const names = await query<{ name: string }>(
      "select name from places where city_id = $1 order by name",
      [cityId],
    );
    expect(names.map((n) => n.name)).toEqual(["Test Bistro", "Test Café"]);
  });

  it("marks the city failed when every search fails", async () => {
    await query("update cities set import_status = 'pending' where id = $1", [cityId]);
    const busy: typeof fetch = async () => new Response("busy", { status: 429 });
    await expect(
      importCity(cityId, {
        budgetMs: 15_000,
        fetchOptions: { endpoints: ["https://fake/api"], fetchImpl: busy, sleep: async () => {} },
      }),
    ).rejects.toThrow(/import failed/);
    const city = await queryOne<{ import_status: string }>(
      "select import_status from cities where id = $1",
      [cityId],
    );
    expect(city?.import_status).toBe("failed");
  });
});
