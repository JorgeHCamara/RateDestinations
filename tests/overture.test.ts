import { describe, expect, it } from "vitest";
import {
  bboxAround,
  latestOvertureRelease,
  overtureCategory,
  overtureProminence,
  overtureQuery,
  overtureRowCategory,
  OVERTURE_PIPELINE,
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
  it("scores documented places higher and fast-food chains lower", () => {
    const base = { hierarchy: ["food_and_drink", "restaurant"], source_count: 1 };
    expect(
      overtureProminence({
        ...base,
        confidence: 1,
        websites: ["a"],
        socials: ["b"],
        phones: ["c"],
        brand: null,
      }),
    ).toBe(65);
    // Listed by three providers: more likely real and known.
    expect(
      overtureProminence({
        ...base,
        source_count: 3,
        confidence: 1,
        websites: ["a"],
        socials: ["b"],
        phones: ["c"],
        brand: null,
      }),
    ).toBe(75);
    expect(
      overtureProminence({
        hierarchy: ["food_and_drink", "casual_eatery", "fast_food_restaurant"],
        confidence: 1,
        websites: ["a"],
        socials: null,
        phones: null,
        brand: "McDonald's",
      }),
    ).toBe(35);
    // A sit-down chain people go out to keeps its score.
    expect(
      overtureProminence({
        hierarchy: ["food_and_drink", "restaurant", "bar_and_grill_restaurant"],
        confidence: 1,
        websites: ["a"],
        socials: null,
        phones: null,
        brand: "Moxies",
      }),
    ).toBe(50);
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

describe("Overture filters", () => {
  const centre = { lat: 43.8361, lng: -79.4983 };
  it("lists bar-and-grills, gastropubs and bar-named restaurants with bars", () => {
    expect(
      overtureRowCategory({
        name: "Jack Astor's Bar & Grill",
        hierarchy: ["food_and_drink", "restaurant", "bar_and_grill_restaurant"],
      }),
    ).toBe("bar");
    expect(
      overtureRowCategory({
        name: "The Pint",
        hierarchy: ["food_and_drink", "casual_eatery", "gastropub"],
      }),
    ).toBe("bar");
    expect(
      overtureRowCategory({
        name: "Moxies Vaughan Colossus Restaurant & Bar",
        hierarchy: ["food_and_drink", "restaurant"],
      }),
    ).toBe("bar");
    // Known bar-and-grill chains, by brand or name, even when the name doesn't say "bar".
    expect(
      overtureRowCategory({
        name: "Moxies Vaughan Colossus Restaurant",
        brand: "Moxies",
        hierarchy: ["food_and_drink", "restaurant"],
      }),
    ).toBe("bar");
    expect(
      overtureRowCategory({ name: "Jack Astor's", hierarchy: ["food_and_drink", "restaurant"] }),
    ).toBe("bar");
    expect(
      overtureRowCategory({
        name: "Joeys Fish Shack",
        hierarchy: ["food_and_drink", "restaurant"],
      }),
    ).toBe("restaurant");
    expect(
      overtureRowCategory({ name: "Sushi Bar Ken", hierarchy: ["food_and_drink", "restaurant"] }),
    ).toBe("restaurant");
    expect(
      overtureRowCategory({ name: "Bar-B-Q Shack", hierarchy: ["food_and_drink", "restaurant"] }),
    ).toBe("restaurant");
    expect(
      overtureRowCategory({ name: "Barbecue House", hierarchy: ["food_and_drink", "restaurant"] }),
    ).toBe("restaurant");
  });
  it("drops test and placeholder entries", () => {
    const out = selectOverturePlaces(
      [
        row({ id: "test", name: "Test", hierarchy: ["shopping", "shopping_mall"] }),
        row({ id: "mall", name: "Vaughan Mills", hierarchy: ["shopping", "shopping_mall"] }),
      ],
      centre,
    );
    expect(out.map((p) => p.source_id)).toEqual(["mall"]);
  });
  it("flags adult venues and keeps them out of the listed places' cap", () => {
    const rows = [
      row({
        id: "strip",
        name: "Inner Club",
        hierarchy: [
          "arts_and_entertainment",
          "nightlife_venue",
          "adult_entertainment_venue",
          "strip_club",
        ],
      }),
      row({
        id: "named",
        name: "Zeus Bar show club strip",
        hierarchy: ["arts_and_entertainment", "nightlife_venue", "dance_club"],
      }),
      row({
        id: "shop",
        name: "Sex Shop Prazer",
        hierarchy: ["shopping", "specialty_store", "adult_store"],
      }),
      row({
        id: "club",
        name: "D-Edge",
        hierarchy: ["arts_and_entertainment", "nightlife_venue", "dance_club"],
      }),
    ];
    const out = selectOverturePlaces(rows, centre, { perCategory: 1 });
    const byId = Object.fromEntries(out.map((p) => [p.source_id, p]));
    expect(byId.club).toMatchObject({ category: "nightlife", adult: false });
    expect(byId.strip).toMatchObject({ category: "nightlife", adult: true });
    expect(byId.named).toMatchObject({ category: "nightlife", adult: true });
    expect(byId.shop).toMatchObject({ category: "shopping", adult: true });
    expect(byId.club.tags.overture_category).toBe(
      "arts_and_entertainment>nightlife_venue>dance_club",
    );
  });
  it("rebuilds cities when the selection rules change", () => {
    expect(OVERTURE_PIPELINE).toMatch(/^p\d+$/);
  });
});

describe("Overture chains", () => {
  it("lowers further locations of the same chain", () => {
    const hierarchy = ["food_and_drink", "restaurant", "bar_and_grill_restaurant"];
    const out = selectOverturePlaces(
      [
        row({ id: "a", name: "St. Louis Bar & Grill", hierarchy, websites: ["x"], lat: 38.721 }),
        row({ id: "b", name: "St. Louis Bar & Grill", hierarchy, websites: ["x"], lat: 38.722 }),
        row({ id: "c", name: "The Local Tap", hierarchy, websites: ["x"], lat: 38.73 }),
      ],
      { lat: 38.72, lng: -9.14 },
    );
    expect(out.map((p) => p.source_id)).toEqual(["a", "c", "b"]);
    expect(out[2].prominence).toBe(out[0].prominence - 10);
  });
});
