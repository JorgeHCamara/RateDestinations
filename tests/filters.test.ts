import { describe, expect, it } from "vitest";
import {
  hasAdultName,
  isAdultOsm,
  isAdultPhotoName,
  isAdultTaxonomy,
  isJunkName,
} from "@/lib/import/filters";
import { parseElements } from "@/lib/import/overpass";

describe("junk names", () => {
  it.each([
    "Test",
    "test",
    "TESTE",
    "Test 2",
    "test123",
    "Testing",
    "asdf",
    "N/A",
    "Unknown",
    "Untitled",
    "...",
    "-",
    "Restaurant",
    "x",
    "Test - do not use",
  ])("%s is junk", (name) => expect(isJunkName(name)).toBe(true));
  it.each([
    "Testa di Rapa",
    "The Testing Ground Brewery",
    "Vaughan Mills",
    "Bar do Zé",
    "東京タワー",
    "Café A Brasileira",
    "Jack Astor's",
    "XO",
    "1881",
    "709",
    "Restaurant Moxies",
    "Test Kitchen",
  ])("%s is a real name", (name) => expect(isJunkName(name)).toBe(false));
});

describe("adult venues", () => {
  it("by provider category", () => {
    expect(
      isAdultTaxonomy(["arts_and_entertainment", "nightlife_venue", "adult_entertainment_venue"]),
    ).toBe(true);
    expect(isAdultTaxonomy(["shopping", "specialty_store", "adult_store"])).toBe(true);
    expect(isAdultTaxonomy(["arts_and_entertainment", "nightlife_venue", "dance_club"])).toBe(
      false,
    );
    expect(isAdultOsm({ amenity: "stripclub" })).toBe(true);
    expect(isAdultOsm({ amenity: "nightclub", nightclub: "striptease" })).toBe(true);
    expect(isAdultOsm({ shop: "erotic" })).toBe(true);
    expect(isAdultOsm({ amenity: "nightclub" })).toBe(false);
  });
  it.each([
    "Zeus Bar show club strip",
    "Bahamas Strip Club",
    "Sex Shop Prazer",
    "Glory Hole Club",
    "Casa de Swing Marrakesh",
    "Erótica Sex Store",
    "Scores Gentlemen's Club",
    "The Lap Dance Lounge",
  ])("%s is +18 by name", (name) => expect(hasAdultName(name)).toBe(true));
  it.each(["Sunset Strip Bar", "Heroic Pub", "Club Social", "Dance Floor", "Cabaret Voltaire"])(
    "%s is not +18 by name",
    (name) => expect(hasAdultName(name, true)).toBe(false),
  );
  it("some words only count for nightlife", () => {
    expect(hasAdultName("Termas Monte Carlo", true)).toBe(true);
    expect(hasAdultName("Termas de Caldas", false)).toBe(false);
    expect(hasAdultName("Le Privê", true)).toBe(true);
    expect(hasAdultName("Salon Privé", false)).toBe(false);
  });
});

describe("nude and naturist places", () => {
  it("are +18 by their OSM tags", () => {
    expect(isAdultOsm({ natural: "beach", nudism: "designated" })).toBe(true);
    expect(isAdultOsm({ natural: "beach", nudism: "customary" })).toBe(true);
    expect(isAdultOsm({ leisure: "park", naturism: "yes" })).toBe(true);
    expect(isAdultOsm({ club: "naturism" })).toBe(true);
    expect(isAdultOsm({ natural: "beach", nudism: "no" })).toBe(false);
    expect(isAdultOsm({ natural: "beach" })).toBe(false);
  });

  it.each([
    "Hanlan's Point Nude Beach",
    "Praia de Nudismo do Abricó",
    "Playa Nudista de Maspalomas",
    "Plage naturiste de Montalivet",
    "FKK-Strand Wannsee",
    "Naturist Club Ontario",
    "Clothing-Optional Beach",
  ])("are +18 by name: %s", (name) => expect(hasAdultName(name)).toBe(true));

  it.each(["Tienda Naturista La Salud", "Loja Naturista", "Hanlan's Point Beach", "Nudel Haus"])(
    "leaves %s listed",
    (name) => expect(hasAdultName(name)).toBe(false),
  );

  it("never uses a photo whose file name shows nudity", () => {
    expect(isAdultPhotoName("File:Hanlans_Point_nudist.jpg")).toBe(true);
    expect(isAdultPhotoName("Topless_sunbathing_2019.jpg")).toBe(true);
    expect(isAdultPhotoName("Naked_Grape_Bar_sign.jpg")).toBe(true);
    expect(isAdultPhotoName("Hanlan's_Point_Beach_sunset.jpg")).toBe(false);
  });
});

describe("OSM parsing applies the filters", () => {
  it("drops junk names and flags adult venues", () => {
    const out = parseElements([
      { type: "node", id: 1, lat: 0, lon: 0, tags: { amenity: "bar", name: "Test" } },
      {
        type: "node",
        id: 2,
        lat: 0,
        lon: 0,
        tags: { amenity: "nightclub", name: "Gentlemen's Club Bahamas" },
      },
      { type: "node", id: 3, lat: 0, lon: 0, tags: { amenity: "nightclub", name: "Fabric" } },
    ]);
    expect(out.map((p) => [p.source_id, p.adult])).toEqual([
      ["node/2", true],
      ["node/3", false],
    ]);
  });
});
