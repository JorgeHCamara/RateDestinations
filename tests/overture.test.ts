import { describe, expect, it } from "vitest";
import {
  bboxAround,
  latestOvertureRelease,
  overtureCategory,
  overtureProminence,
  overtureQuery,
  selectOverturePlaces,
  type OvertureRow,
} from "@/lib/import/overture";

const row = (over: Partial<OvertureRow>): OvertureRow => ({
  id: "x",
  name: "Place",
  hierarchy: ["food_and_drink", "restaurant", "portuguese_restaurant"],
  confidence: 0.9,
  websites: null,
  socials: null,
  phones: null,
  brand: null,
  address: null,
  locality: null,
  lat: 38.72,
  lng: -9.14,
  operating_status: null,
  ...over,
});

describe("Overture categories", () => {
  it("maps Overture's taxonomy to ours", () => {
    expect(overtureCategory(["food_and_drink", "restaurant"])).toBe("restaurant");
    expect(overtureCategory(["food_and_drink", "casual_eatery", "bakery"])).toBe("cafe");
    expect(
      overtureCategory(["food_and_drink", "casual_eatery", "dessert_shop", "ice_cream_shop"]),
    ).toBe("cafe");
    expect(overtureCategory(["food_and_drink", "casual_eatery", "fast_food_restaurant"])).toBe(
      "restaurant",
    );
    expect(
      overtureCategory(["food_and_drink", "alcoholic_beverage_venue", "bar", "wine_bar"]),
    ).toBe("bar");
    expect(overtureCategory(["arts_and_entertainment", "nightlife_venue", "dance_club"])).toBe(
      "nightlife",
    );
    expect(overtureCategory(["arts_and_entertainment", "museum"])).toBe("museum");
    expect(overtureCategory(["cultural_and_historic", "historic_site", "castle"])).toBe(
      "attraction",
    );
    expect(overtureCategory(["geographic_entities", "land_feature", "beach"])).toBe("beach");
    expect(overtureCategory(["shopping", "shopping_mall"])).toBe("shopping");
  });
  it("leaves out what a visitor's guide isn't for", () => {
    expect(overtureCategory(["services_and_business", "home_service"])).toBeNull();
    expect(overtureCategory(["sports_and_recreation", "park", "dog_park"])).toBeNull();
    expect(overtureCategory(["food_and_drink", "restaurantx"])).toBeNull();
    expect(overtureCategory(null)).toBeNull();
  });
});

describe("Overture selection", () => {
  it("scores documented places higher and chains lower", () => {
    expect(
      overtureProminence({
        confidence: 1,
        websites: ["a"],
        socials: ["b"],
        phones: ["c"],
        brand: null,
      }),
    ).toBe(70);
    expect(
      overtureProminence({
        confidence: 1,
        websites: ["a"],
        socials: null,
        phones: null,
        brand: "McDonald's",
      }),
    ).toBe(40);
  });
  it("drops closed, low-confidence and unnamed places and keeps the best per category", () => {
    const rows = [
      row({ id: "closed", operating_status: "permanently_closed" }),
      row({ id: "doubtful", confidence: 0.2 }),
      row({ id: "nameless", name: " " }),
      row({ id: "plain", confidence: 0.6 }),
      row({ id: "great", websites: ["ramiro.pt"], phones: ["+351"], confidence: 0.95 }),
      row({ id: "dentist", hierarchy: ["health_care", "dental_clinic"] }),
    ];
    const out = selectOverturePlaces(rows, { lat: 38.72, lng: -9.14 }, { perCategory: 1 });
    expect(out.map((p) => p.source_id)).toEqual(["great"]);
    expect(out[0]).toMatchObject({
      source: "overture",
      category: "restaurant",
      subcategory: "portuguese",
      website: "https://ramiro.pt/",
    });
  });
  it("builds a safe query for a city's box", () => {
    const sql = overtureQuery("2026-10-21.0", bboxAround(43.8361, -79.4983, 5500));
    expect(sql).toContain("release/2026-10-21.0/theme=places");
    expect(sql).toContain("bbox.xmin BETWEEN -79.566");
    expect(() => overtureQuery("x'; drop", bboxAround(0, 0, 1))).toThrow();
  });
  it("finds the newest release in the bucket listing", async () => {
    const listing = `<ListBucketResult><CommonPrefixes><Prefix>release/2026-09-23.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>release/2026-10-21.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>release/2026-09-23.1/</Prefix></CommonPrefixes></ListBucketResult>`;
    expect(await latestOvertureRelease(async () => new Response(listing))).toBe("2026-10-21.0");
  });
});
