import { afterEach, describe, expect, it, vi } from "vitest";
import { getRatingProvider } from "@/lib/providers/ratings";
import { googleProvider } from "@/lib/providers/ratings/google";

describe("rating providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("defaults to the free provider", () => {
    vi.stubEnv("GOOGLE_PLACES_ENABLED", "false");
    expect(getRatingProvider().name).toBe("none");
  });

  it("switches to Google only when enabled and keyed", () => {
    vi.stubEnv("GOOGLE_PLACES_ENABLED", "true");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect(getRatingProvider().name).toBe("none");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    expect(getRatingProvider().name).toBe("google");
    expect(googleProvider.maxCacheDays).toBe(30);
  });

  it("asks Google for only the rating fields and maps the first hit", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ places: [{ id: "ChIJ123", rating: 4.4, userRatingCount: 812 }] });
    });
    const hit = await googleProvider.lookup({
      id: 1,
      name: "Cervejaria Ramiro",
      lat: 38.72,
      lng: -9.13,
      category: "restaurant",
    });
    expect(hit).toEqual({ sourceId: "ChIJ123", rating: 4.4, ratingCount: 812 });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toBe(
      "places.id,places.rating,places.userRatingCount,places.displayName",
    );
    expect(JSON.parse(String(calls[0].init.body)).locationBias.circle.center.latitude).toBe(38.72);
  });
});
