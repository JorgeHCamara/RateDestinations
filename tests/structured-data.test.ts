import { describe, expect, it } from "vitest";
import {
  breadcrumbJsonLd,
  categoryDescription,
  categoryTitle,
  cityDescription,
  cityTitle,
  clip,
  placeDescription,
  placeJsonLd,
} from "@/lib/structured-data";

const lisbon = { name: "Lisbon", country_name: "Portugal" };
const place = {
  id: 42,
  name: "Polvo Dourado",
  category: "restaurant" as const,
  subcategory: null,
  city_name: "Lisbon",
  country_name: "Portugal",
  user_avg: 4.5,
  user_count: 3,
  lat: 38.7,
  lng: -9.1,
  address: "Rua Augusta 1",
  website: "https://example.com",
  phone: null,
  image_url: null,
};

describe("search text", () => {
  it("names the city and country in titles", () => {
    expect(cityTitle(lisbon)).toBe("Lisbon, Portugal: best places and what to avoid");
    expect(categoryTitle("cafe", lisbon)).toBe("Best cafés & bakeries in Lisbon, Portugal");
  });

  it("describes a built guide with its size and top picks, within 160 characters", () => {
    const d = cityDescription(lisbon, {
      placeCount: 66,
      ratingCount: 0,
      topNames: ["A", "B", "C", "D"],
    });
    expect(d).toContain("66 places to eat, drink and see");
    expect(d).toContain("Top picks: A, B and C.");
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it("describes a city with no guide without numbers", () => {
    expect(cityDescription(lisbon, null)).not.toMatch(/\d/);
  });

  it("clips long text at a word", () => {
    const out = clip("word ".repeat(60).trim(), 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("gives the place's score on the site's 0–10 scale", () => {
    expect(placeDescription(place)).toMatch(/^Polvo Dourado, a restaurant in Lisbon, Portugal\./);
    expect(placeDescription({ ...place, category: "attraction" })).toContain(", an attraction in");
    expect(placeDescription(place)).toContain("Scores 9.0/10 from 3 ratings.");
    expect(placeDescription({ ...place, user_count: 0, user_avg: null })).toContain(
      "Not rated yet",
    );
  });

  it("counts category places", () => {
    expect(categoryDescription("restaurant", lisbon, 1234, ["X"])).toMatch(
      /^1,234 restaurants in Lisbon/,
    );
  });
});

describe("JSON-LD", () => {
  it("gives businesses a star rating once someone rated them", () => {
    const ld = placeJsonLd(place);
    expect(ld["@type"]).toBe("Restaurant");
    expect(ld.aggregateRating).toMatchObject({ ratingValue: "4.5", ratingCount: 3, bestRating: 5 });
  });

  it("leaves the rating out for unrated places and for non-businesses", () => {
    expect(
      placeJsonLd({ ...place, user_count: 0, user_avg: null }).aggregateRating,
    ).toBeUndefined();
    const park = placeJsonLd({ ...place, category: "park" });
    expect(park["@type"]).toBe("Park");
    expect(park.aggregateRating).toBeUndefined();
  });

  it("numbers breadcrumbs from 1 with absolute URLs", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Lisbon", path: "/city/pt/lisbon" },
    ]) as { itemListElement: { position: number; item: string }[] };
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(ld.itemListElement[1].item).toMatch(/^https?:\/\/[^/]+\/city\/pt\/lisbon$/);
  });
});
