import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGeoapifyCategory,
  GEOAPIFY_CATEGORIES,
  parseGeoapify,
  searchRadii,
} from "@/lib/import/geoapify";
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
      { deadline: Date.now() + 60_000, fetchImpl: ok },
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
        deadline: Date.now() + 60_000,
        fetchImpl: denied,
      }),
    ).rejects.toThrow(/401: Invalid apiKey \*\*\*/);
  });

  it("narrows the circle when a wide search times out, as New York's did", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "k");
    expect(searchRadii(8_804_190)).toEqual([14_000, 7_000, 3_500]);
    expect(searchRadii(17_000)).toEqual([4_000, 2_000]);
    const radii: number[] = [];
    // A server that is too slow over 10 km or more, and fast below that.
    const slowWhenWide: typeof fetch = async (url) => {
      const r = Number(new URL(String(url)).searchParams.get("filter")!.split(",")[2]);
      radii.push(r);
      if (r >= 10_000) throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      return Response.json({ features: [withRaw] });
    };
    const places = await fetchGeoapifyCategory(
      { lat: 40.71, lng: -74.0, population: 8_804_190 },
      "restaurant",
      {
        deadline: Date.now() + 60_000,
        fetchImpl: slowWhenWide,
      },
    );
    expect(places).toHaveLength(1);
    expect(radii).toEqual([14_000, 7_000]);
  });

  it("gives up with every attempt listed when all circles time out, without passing the deadline", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "k");
    let calls = 0;
    const neverAnswers: typeof fetch = async () => {
      calls++;
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    };
    await expect(
      fetchGeoapifyCategory({ lat: 40.71, lng: -74.0, population: 8_804_190 }, "cafe", {
        deadline: Date.now() + 60_000,
        fetchImpl: neverAnswers,
      }),
    ).rejects.toThrow(/14 km: no answer.*7 km: no answer.*4 km: no answer/);
    expect(calls).toBe(3);
  });

  it("retries the same circle once after a rate limit, and stops on a quota or key error", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "k");
    const statuses = [429, 200];
    const urls: string[] = [];
    const limited: typeof fetch = async (url) => {
      urls.push(String(url));
      const status = statuses.shift()!;
      return status === 200
        ? Response.json({ features: [withRaw] })
        : new Response("slow down", { status });
    };
    await fetchGeoapifyCategory({ lat: 1, lng: 1, population: 500_000 }, "bar", {
      deadline: Date.now() + 60_000,
      fetchImpl: limited,
      sleep: async () => {},
    });
    expect(urls).toHaveLength(2);
    expect(new URL(urls[0]).searchParams.get("filter")).toBe(
      new URL(urls[1]).searchParams.get("filter"),
    );

    let quotaCalls = 0;
    const quota: typeof fetch = async () => {
      quotaCalls++;
      return new Response("Daily limit exceeded", { status: 402 });
    };
    await expect(
      fetchGeoapifyCategory({ lat: 1, lng: 1, population: 500_000 }, "bar", {
        deadline: Date.now() + 60_000,
        fetchImpl: quota,
      }),
    ).rejects.toThrow(/HTTP 402/);
    expect(quotaCalls).toBe(1);
  });
});
