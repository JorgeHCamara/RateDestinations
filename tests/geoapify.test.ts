import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGeoapifyCategory, GEOAPIFY_CATEGORIES, parseGeoapify } from "@/lib/import/geoapify";
import { PLACE_CATEGORIES } from "@/lib/import/categories";

const withRaw = {
  properties: {
    name: "Cervejaria Ramiro",
    lat: 38.72,
    lon: -9.135,
    place_id: "abc",
    categories: ["catering", "catering.restaurant", "catering.restaurant.seafood"],
    address_line2: "Avenida Almirante Reis 1, Lisbon",
    datasource: {
      sourcename: "openstreetmap",
      raw: {
        osm_id: 123,
        osm_type: "n",
        name: "Cervejaria Ramiro",
        amenity: "restaurant",
        cuisine: "seafood",
        website: "cervejariaramiro.pt",
        wikidata: "Q10272140",
      },
    },
  },
};
const withoutRaw = {
  properties: {
    name: "Jardim da Estrela",
    lat: 38.71,
    lon: -9.16,
    place_id: "def",
    categories: ["leisure", "leisure.park", "leisure.park.garden"],
    address_line2: "Lisbon",
  },
};

describe("Geoapify parsing", () => {
  it("maps every one of our categories", () => {
    for (const c of PLACE_CATEGORIES) expect(GEOAPIFY_CATEGORIES[c].length).toBeGreaterThan(0);
  });

  it("uses raw OSM tags and ids, so rows match the Overpass importer", () => {
    const [p] = parseGeoapify([withRaw], "restaurant");
    expect(p).toMatchObject({
      source_id: "node/123",
      name: "Cervejaria Ramiro",
      category: "restaurant",
      subcategory: "seafood",
      website: "https://cervejariaramiro.pt/",
      wikidata_id: "Q10272140",
    });
    expect(p.prominence).toBeGreaterThan(0);
  });

  it("falls back to Geoapify fields when raw tags are missing", () => {
    const [p] = parseGeoapify([withoutRaw, withoutRaw], "park");
    expect(p).toMatchObject({
      source_id: "geoapify/def",
      category: "park",
      subcategory: "garden",
      address: "Lisbon",
    });
    expect(parseGeoapify([withoutRaw, withoutRaw], "park")).toHaveLength(1);
  });
});

describe("Geoapify requests", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("asks for one category within the city's radius and never leaks the key in errors", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "secret-key");
    const urls: string[] = [];
    const ok: typeof fetch = async (url) => {
      urls.push(String(url));
      return Response.json({ type: "FeatureCollection", features: [withRaw] });
    };
    const places = await fetchGeoapifyCategory(
      { lat: 38.72, lng: -9.14, population: 517_802 },
      "restaurant",
      { timeoutMs: 1000, fetchImpl: ok },
    );
    expect(places).toHaveLength(1);
    const q = new URL(urls[0]).searchParams;
    expect(q.get("categories")).toBe("catering.restaurant,catering.food_court");
    expect(q.get("filter")).toBe("circle:-9.14,38.72,8000");
    expect(q.get("limit")).toBe("60");

    const denied: typeof fetch = async () =>
      new Response("Invalid apiKey secret-key", { status: 401 });
    await expect(
      fetchGeoapifyCategory({ lat: 1, lng: 1, population: 1 }, "cafe", {
        timeoutMs: 1000,
        fetchImpl: denied,
      }),
    ).rejects.toThrow(/401: Invalid apiKey \*\*\*/);
  });
});
