import { describe, expect, it } from "vitest";
import fixture from "./fixtures/overpass-sample.json";
import { baseProminence, classify, displayName } from "@/lib/import/categories";
import {
  buildGroupQuery,
  fetchOverpass,
  parseElements,
  radiusForPopulation,
  QUERY_GROUPS,
  type OverpassElement,
} from "@/lib/import/overpass";
import { sitelinkBonus } from "@/lib/import/wikidata";

describe("classify", () => {
  it("maps common OSM tags", () => {
    expect(classify({ amenity: "restaurant", cuisine: "portuguese;seafood" })).toEqual({
      category: "restaurant",
      subcategory: "portuguese",
    });
    expect(classify({ amenity: "pub" })).toEqual({ category: "bar", subcategory: "pub" });
    expect(classify({ tourism: "museum" })).toEqual({ category: "museum", subcategory: null });
    expect(classify({ leisure: "garden" })).toEqual({ category: "park", subcategory: "garden" });
    expect(classify({ historic: "archaeological_site" })).toEqual({
      category: "attraction",
      subcategory: "archaeological site",
    });
    expect(classify({ natural: "beach" })).toEqual({ category: "beach", subcategory: null });
    expect(classify({ shop: "mall" })).toEqual({ category: "shopping", subcategory: "mall" });
  });
  it("ignores things we don't list", () => {
    expect(classify({ amenity: "bank" })).toBeNull();
    expect(classify({ amenity: "place_of_worship" })).toBeNull();
    expect(classify({ amenity: "place_of_worship", wikidata: "Q1" })?.category).toBe("attraction");
  });
});

describe("prominence and names", () => {
  it("scores documentation richness, capped at 100", () => {
    expect(baseProminence({})).toBe(0);
    expect(baseProminence({ website: "x" })).toBe(15);
    expect(
      baseProminence({
        website: "x",
        opening_hours: "x",
        phone: "x",
        wikidata: "Q1",
        cuisine: "x",
        heritage: "1",
        image: "x",
      }),
    ).toBe(80);
  });
  it("prefers the English name", () => {
    expect(displayName({ name: "Sé", "name:en": "Cathedral" })).toBe("Cathedral");
    expect(displayName({ name: "Sé" })).toBe("Sé");
    expect(displayName({})).toBeNull();
  });
  it("sitelink bonus is capped", () => {
    expect(sitelinkBonus(0)).toBe(0);
    expect(sitelinkBonus(4)).toBe(10);
    expect(sitelinkBonus(100)).toBe(40);
  });
});

describe("parseElements", () => {
  const places = parseElements(fixture.elements as unknown as OverpassElement[]);
  it("keeps classified, named, located elements and dedupes", () => {
    const ids = places.map((p) => p.source_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("way/1001");
    expect(ids).toContain("relation/1002");
    expect(ids).not.toContain("node/1003"); // no name
    expect(ids).not.toContain("node/1004"); // bank
    expect(ids).not.toContain("node/1005"); // undocumented church
    expect(ids).toContain("node/1006");
    expect(ids.filter((i) => i === "node/1007")).toHaveLength(1);
    expect(ids).not.toContain("node/1008"); // no coordinates
  });
  it("uses way/relation centers and english names, normalises websites", () => {
    const museum = places.find((p) => p.source_id === "relation/1002")!;
    expect(museum.lat).toBe(38.71);
    expect(museum.name).toBe("Test Museum");
    expect(museum.tags.local_name).toBe("Museu Teste");
    expect(museum.website).toBe("https://museu.example/");
    expect(museum.category).toBe("museum");
    expect(museum.prominence).toBeGreaterThanOrEqual(50);
  });
});

describe("overpass queries", () => {
  it("scales the radius with population", () => {
    expect(radiusForPopulation(20_000)).toBe(4_000);
    expect(radiusForPopulation(500_000)).toBe(8_000);
    expect(radiusForPopulation(12_000_000)).toBe(14_000);
  });
  it("builds a two-tier query per group", () => {
    const q = buildGroupQuery(QUERY_GROUPS[0], 38.71667, -9.13333, 8000);
    expect(q).toContain("[out:json]");
    expect(q).toContain(
      '["amenity"="restaurant"]["name"]["website"](around:8000,38.71667,-9.13333)',
    );
    expect(q).toContain("out center tags 220");
    expect(q).toContain("- .rich");
  });
  it("falls back across endpoints and retries", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("bad")) return new Response("busy", { status: 503 });
      return Response.json({
        elements: [{ type: "node", id: 1, lat: 1, lon: 2, tags: { amenity: "cafe", name: "A" } }],
      });
    };
    const elements = await fetchOverpass(
      "q",
      ["https://bad/api", "https://good/api"],
      fakeFetch,
      async () => {},
    );
    expect(elements).toHaveLength(1);
    expect(calls).toEqual(["https://bad/api", "https://good/api"]);

    const alwaysBad: typeof fetch = async () => new Response("busy", { status: 504 });
    await expect(
      fetchOverpass("q", ["https://bad/api"], alwaysBad, async () => {}),
    ).rejects.toThrow(/all Overpass endpoints failed/);
  });
});
