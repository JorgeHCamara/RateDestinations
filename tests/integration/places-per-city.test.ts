/**
 * Overlapping cities each keep their own copy of a place (migration 0014): building Manhattan
 * must not take Central Park out of New York's guide. A new copy takes the photo and the +18 /
 * hijacked flags a neighbouring city's copy already has. Local database; cleaned up after.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, query } from "@/lib/db";
import { upsertPlaces } from "@/lib/import/import-city";
import type { PlaceInput } from "@/lib/import/overpass";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const park: PlaceInput = {
  source: "overture",
  source_id: "test-central-park",
  name: "Central Park",
  category: "park",
  subcategory: null,
  lat: 40.7826,
  lng: -73.9656,
  address: null,
  website: "https://www.centralparknyc.org",
  phone: null,
  opening_hours: null,
  wikidata_id: "Q160409",
  wikipedia: null,
  prominence: 97,
  tags: {},
};

run("places per city (database)", () => {
  let cityA: number;
  let cityB: number;
  beforeAll(async () => {
    const rows = await query<{ id: number }>(
      "select id from cities where import_status = 'none' order by population asc offset 3 limit 2",
    );
    [cityA, cityB] = rows.map((r) => r.id);
  });
  afterAll(async () => {
    await query("delete from places where source_id like 'test-%' or source_id = 'Q999999999'");
    await getPool().end();
  });

  it("keeps the place in both cities instead of moving it", async () => {
    await upsertPlaces(cityA, [park]);
    await query(
      `update places set image_url = 'https://upload.example/cp.jpg', image_source = 'commons',
              image_checked_at = now(), website_hijacked = true
       where city_id = $1 and source_id = $2`,
      [cityA, park.source_id],
    );
    await upsertPlaces(cityB, [park]);
    const rows = await query<{
      city_id: number;
      image_url: string | null;
      website_hijacked: boolean;
    }>(
      "select city_id, image_url, website_hijacked from places where source_id = $1 order by city_id",
      [park.source_id],
    );
    expect(rows.map((r) => Number(r.city_id)).sort()).toEqual([cityA, cityB].sort());
    // the second city's copy borrowed the first's photo and flag
    expect(rows.every((r) => r.image_url === "https://upload.example/cp.jpg")).toBe(true);
    expect(rows.every((r) => r.website_hijacked)).toBe(true);
  });

  it("stores famous places that only Wikidata has", async () => {
    await upsertPlaces(cityA, [
      { ...park, source: "wikidata", source_id: "Q999999999", name: "Test Famous Place" },
    ]);
    const rows = await query(
      "select 1 from places where source = 'wikidata' and source_id = 'Q999999999'",
    );
    expect(rows).toHaveLength(1);
  });

  it("leaves an unchanged place untouched when a city is rebuilt", async () => {
    const before = await query<{ xmin: string }>(
      "select xmin::text from places where city_id = $1 and source_id = $2",
      [cityA, park.source_id],
    );
    await upsertPlaces(cityA, [park]);
    const after = await query<{ xmin: string }>(
      "select xmin::text from places where city_id = $1 and source_id = $2",
      [cityA, park.source_id],
    );
    expect(after[0].xmin).toBe(before[0].xmin);
  });
});
