import { describe, expect, it } from "vitest";
import {
  classifyWikidataItem,
  famousNameScore,
  famousProminence,
  famousQuery,
  isFamousVariant,
  parseFamous,
  type FamousPlace,
} from "@/lib/import/famous";
import { selectOverturePlaces, type OvertureRow } from "@/lib/import/overture";

describe("Wikidata classes → categories", () => {
  it("knows museums, parks, sights and viewpoints, through subclasses", () => {
    expect(classifyWikidataItem(["Q207694"], 89)).toBe("museum"); // art museum (the Met)
    expect(classifyWikidataItem(["Q22746"], 87)).toBe("park"); // urban park (Central Park)
    expect(classifyWikidataItem(["Q6017969"], 4)).toBe("viewpoint"); // scenic viewpoint
    expect(classifyWikidataItem(["Q40080"], 5)).toBe("beach");
  });

  it("puts specific kinds before generic ones", () => {
    // The Statue of Liberty is a statue and an observation tower: a sight
    expect(classifyWikidataItem(["Q43113623", "Q1779653", "Q1440300", "Q179700"], 159)).toBe(
      "attraction",
    );
    // a zoo is filed under gardens, but is a sight
    expect(classifyWikidataItem(["Q43501"], 23)).toBe("attraction");
    // a viewpoint that is also a "tourist attraction" stays a viewpoint
    expect(classifyWikidataItem(["Q6017969", "Q570116"], 6)).toBe("viewpoint");
  });

  it("asks more of churches and office towers before they count as sights", () => {
    expect(classifyWikidataItem(["Q11303"], 47)).toBeNull(); // a skyscraper (Trump Tower)
    expect(classifyWikidataItem(["Q11303"], 125)).toBe("attraction"); // the Empire State Building
    expect(classifyWikidataItem(["Q16970"], 4)).toBeNull(); // a parish church
    expect(classifyWikidataItem(["Q16970"], 42)).toBe("attraction"); // St. Patrick's
  });

  it("is not fooled by stock markets, former settlements or unknown classes", () => {
    expect(classifyWikidataItem(["Q11691"], 88)).toBeNull(); // stock exchange
    expect(classifyWikidataItem(["Q22674925", "Q677678"], 45)).toBeNull(); // New Amsterdam
    expect(classifyWikidataItem(["Q4830453"], 100)).toBeNull(); // a business
  });

  it("ranks fame above any listing (75) and by Wikipedia articles", () => {
    expect(famousProminence(3)).toBeGreaterThan(75);
    expect(famousProminence(10)).toBeGreaterThan(famousProminence(3));
    expect(famousProminence(87)).toBeGreaterThan(famousProminence(30));
    expect(famousProminence(1000)).toBe(100);
  });
});

describe("Wikidata answers", () => {
  it("builds a query for the city's language and radius", () => {
    const q = famousQuery({ lat: 38.72, lng: -9.14 }, 8, "PT");
    expect(q).toContain("Point(-9.140000 38.720000)");
    expect(q).toContain('LANG(?local) = "pt"');
    expect(q).toContain("FILTER NOT EXISTS { ?item wdt:P576 [] }");
  });

  it("keeps one entry per item, classified, with every label", () => {
    const b = (item: string, types: string, en?: string, local?: string) => ({
      item: { value: `http://www.wikidata.org/entity/${item}` },
      links: { value: "40" },
      loc: { value: "Point(-9.2160 38.6916)" },
      types: { value: types },
      ...(en ? { enLabel: { value: en } } : {}),
      ...(local ? { localLabel: { value: local } } : {}),
    });
    const out = parseFamous([
      b("Q213357", "Q2977 Q16970", "Belém Tower", "Torre de Belém"),
      b("Q213357", "Q2977", "Belém Tower"), // a second coordinate
      b("Q1", "Q4830453", "Some company"), // not a place to visit
      b("Q2", "Q33506"), // no label
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      qid: "Q213357",
      name: "Belém Tower",
      names: ["Belém Tower", "Torre de Belém"],
      category: "attraction",
      lat: 38.6916,
      lng: -9.216,
    });
  });
});

describe("matching listings to famous places", () => {
  it("accepts the same name, give or take generic words, the city and the type word", () => {
    expect(famousNameScore("Central Park", ["Central Park"], "New York City", "park")).toBe(3);
    expect(famousNameScore("Central Park NYC", ["Central Park"], "New York City", "park")).toBe(2);
    expect(famousNameScore("The High Line", ["High Line"], "New York City", "park")).toBe(2);
    expect(famousNameScore("Cadman Plaza Park", ["Cadman Plaza"], "New York City", "park")).toBe(2);
    expect(
      famousNameScore("Neue Galerie New York", ["Neue Galerie"], "New York City", "museum"),
    ).toBe(2);
  });

  it("refuses a different place that shares words", () => {
    const nyc = "New York City";
    expect(famousNameScore("Central Park Zoo", ["Central Park"], nyc, "park")).toBe(0);
    expect(famousNameScore("Brooklyn Bridge Park", ["Brooklyn Bridge"], nyc, "attraction")).toBe(0);
    expect(famousNameScore("Times Square Tower", ["Times Square"], nyc, "attraction")).toBe(0);
    expect(famousNameScore("Battery Park City", ["The Battery"], nyc, "park")).toBe(0);
    expect(famousNameScore("Washington Market Park", ["Washington Square Park"], nyc, "park")).toBe(
      0,
    );
    expect(
      famousNameScore("One Union Square South Luxury Apartments", ["Union Square"], nyc, "park"),
    ).toBe(0);
    expect(famousNameScore("New York", ["New York Public Library"], nyc, "attraction")).toBe(0);
  });

  it("spots check-in variants of a famous place nearby", () => {
    const cp: FamousPlace = {
      qid: "Q160409",
      name: "Central Park",
      names: ["Central Park"],
      lat: 40.7825,
      lng: -73.9658,
      sitelinks: 87,
      category: "park",
      website: null,
    };
    expect(
      isFamousVariant({ name: "Central Park - Wagner Cove", lat: 40.7747, lng: -73.9732 }, cp),
    ).toBe(true);
    expect(
      isFamousVariant({ name: "New York Central Park", lat: 40.7655, lng: -73.9735 }, cp),
    ).toBe(true);
    // far away: a different Central Park
    expect(isFamousVariant({ name: "Central Park", lat: 40.6, lng: -74.2 }, cp)).toBe(false);
    // a word that only starts the same
    expect(isFamousVariant({ name: "Central Parkway Diner", lat: 40.78, lng: -73.966 }, cp)).toBe(
      false,
    );
  });
});

const row = (over: Partial<OvertureRow>): OvertureRow => ({
  id: "x",
  name: "Place",
  hierarchy: ["sports_and_recreation", "park"],
  confidence: 0.9,
  websites: ["https://example.com"],
  socials: ["https://facebook.com/x"],
  phones: ["+1"],
  brand: null,
  address: null,
  locality: null,
  lat: 40.7143,
  lng: -74.006,
  operating_status: "open",
  source_count: 3,
  ...over,
});

describe("famous places in a city's selection", () => {
  const centre = { lat: 40.71427, lng: -74.00597 };
  const famous: FamousPlace[] = [
    {
      qid: "Q160409",
      name: "Central Park",
      names: ["Central Park"],
      lat: 40.7825,
      lng: -73.9658,
      sitelinks: 87,
      category: "park",
      website: "https://www.centralparknyc.org",
    },
    {
      qid: "Q9188",
      name: "Empire State Building",
      names: ["Empire State Building"],
      lat: 40.7484,
      lng: -73.9857,
      sitelinks: 125,
      category: "attraction",
      website: null,
    },
  ];
  // Pocket parks with complete listings right at the centre, and Central Park 8 km away with a
  // slightly lower confidence: before, the pocket parks filled the list.
  const pockets = Array.from({ length: 60 }, (_, i) =>
    row({ id: `pocket-${i}`, name: `Pocket Park ${i}`, lat: 40.7143 + i * 0.0001 }),
  );
  const rows = [
    ...pockets,
    row({
      id: "cp",
      name: "Central Park",
      confidence: 0.96,
      phones: null,
      lat: 40.7826,
      lng: -73.9656,
    }),
    row({ id: "cp-variant", name: "Central Park - Wagner Cove", lat: 40.7747, lng: -73.9732 }),
    row({
      id: "condo",
      name: "140 Franklin Condominium",
      hierarchy: ["cultural_and_historic", "historic_site"],
    }),
    row({
      id: "condo2",
      name: "49 Chambers",
      hierarchy: ["cultural_and_historic", "historic_site"],
    }),
    row({
      id: "memorial",
      name: "Irish Hunger Memorial",
      hierarchy: ["cultural_and_historic", "memorial_site"],
    }),
    row({
      id: "fake-beach",
      name: "Eagle Beach, Aruba",
      hierarchy: ["geographic_entities", "land_feature", "beach"],
    }),
    row({
      id: "not-beach",
      name: "Maui, Hawaii",
      hierarchy: ["geographic_entities", "land_feature", "beach"],
    }),
    row({
      id: "beach",
      name: "Pier 4 Beach",
      hierarchy: ["geographic_entities", "land_feature", "beach"],
    }),
  ];
  const out = selectOverturePlaces(rows, centre, {
    perCategory: 50,
    famous,
    cityName: "New York City",
  });
  const parks = out.filter((p) => p.category === "park");

  it("puts the famous park first, under its Overture listing", () => {
    expect(parks).toHaveLength(50);
    expect(parks[0]).toMatchObject({
      source: "overture",
      source_id: "cp",
      name: "Central Park",
      wikidata_id: "Q160409",
    });
    expect(parks[0].prominence).toBeGreaterThan(75);
  });

  it("adds a famous place no listing names, from Wikidata", () => {
    expect(out.find((p) => p.wikidata_id === "Q9188")).toMatchObject({
      source: "wikidata",
      source_id: "Q9188",
      name: "Empire State Building",
      category: "attraction",
    });
  });

  it("drops check-in variants, condos and misplaced beaches", () => {
    const ids = out.map((p) => p.source_id);
    expect(ids).not.toContain("cp-variant");
    expect(ids).not.toContain("condo");
    expect(ids).not.toContain("condo2");
    expect(ids).not.toContain("fake-beach");
    expect(ids).not.toContain("not-beach");
    expect(ids).toContain("memorial");
    expect(ids).toContain("beach");
  });

  it("ranks commercial galleries below museums", () => {
    const sel = selectOverturePlaces(
      [
        row({
          id: "gal",
          name: "Chelsea Gallery",
          hierarchy: ["arts_and_entertainment", "arts_and_crafts_space", "art_gallery"],
        }),
        row({ id: "mus", name: "City Museum", hierarchy: ["arts_and_entertainment", "museum"] }),
      ],
      centre,
    );
    expect(sel.map((p) => p.source_id)).toEqual(["mus", "gal"]);
  });
});
