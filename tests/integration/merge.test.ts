/** Merging Overture places into a city that already has OpenStreetMap places (local database). */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, query, queryOne } from "@/lib/db";
import { mergePlaces } from "@/lib/import/merge";
import type { PlaceInput } from "@/lib/import/overpass";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const base: Omit<PlaceInput, "source" | "source_id" | "name"> = {
  category: "museum",
  subcategory: null,
  lat: 38.7339,
  lng: -9.1459,
  address: null,
  website: null,
  phone: null,
  opening_hours: null,
  wikidata_id: null,
  wikipedia: null,
  prominence: 20,
  tags: {},
};

run("mergePlaces (database)", () => {
  let cityId: number;
  beforeAll(async () => {
    cityId = (await queryOne<{ id: number }>(
      "select id from cities where import_status = 'none' order by population asc offset 1 limit 1",
    ))!.id;
    await mergePlaces(cityId, [
      { ...base, source: "osm", source_id: "node/9100001", name: "Museu Medeiros e Almeida" },
    ]);
  });
  afterAll(async () => {
    await query("delete from places where city_id = $1", [cityId]);
    await getPool().end();
  });

  it("enriches the existing place instead of duplicating it, and adds new ones", async () => {
    const result = await mergePlaces(cityId, [
      {
        ...base,
        source: "overture",
        source_id: "ov-1",
        name: "Medeiros & Almeida Museum",
        lat: base.lat + 0.00003,
        website: "https://www.casa-museumedeirosealmeida.pt/",
        prominence: 60,
      },
      {
        ...base,
        source: "overture",
        source_id: "ov-2",
        name: "Gulbenkian Museum",
        lat: base.lat + 0.01,
      },
    ]);
    expect(result).toEqual({ added: 1, enriched: 1 });
    const rows = await query<{
      name: string;
      source: string;
      website: string | null;
      prominence: number;
      tags: Record<string, string>;
    }>(
      "select name, source::text as source, website, prominence, tags from places where city_id = $1 order by name",
      [cityId],
    );
    expect(rows).toHaveLength(2);
    const museum = rows.find((r) => r.name === "Museu Medeiros e Almeida")!;
    expect(museum).toMatchObject({
      source: "osm",
      website: "https://www.casa-museumedeirosealmeida.pt/",
      prominence: 60,
    });
    expect(museum.tags.overture_id).toBe("ov-1");
  });

  it("is idempotent: merging the same batch again adds nothing", async () => {
    const again = await mergePlaces(cityId, [
      {
        ...base,
        source: "overture",
        source_id: "ov-2",
        name: "Gulbenkian Museum",
        lat: base.lat + 0.01,
      },
    ]);
    expect(again.enriched).toBe(0);
    const n = await queryOne<{ n: number }>(
      "select count(*)::int n from places where city_id = $1",
      [cityId],
    );
    expect(n?.n).toBe(2);
  });
});
