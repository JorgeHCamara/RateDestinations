import { describe, expect, it } from "vitest";
import { websiteImage } from "@/lib/images/website-image";
import { isGamblingSpam } from "@/lib/import/filters";

const publicLookup = async () => ["93.184.216.34"];

describe("gambling spam on a hijacked website", () => {
  it("knows spam titles and photo names", () => {
    for (const spam of [
      "COY99 # Hasil RTP Slot Gacor Hari Ini & Bocoran RTP Live PG Soft Terbaru",
      "rtp-slot-coy99.webp",
      "tips-main-togel-macau-735x400.jpg",
      "glory-casino-official-website-in-pakistan.png",
      "indosat-nenekslot.jpg",
      "slot88resmi-image.webp",
      "Situs Judi Online Terpercaya",
      "Best Online Casino Bonuses 2026",
    ])
      expect(isGamblingSpam(spam), spam).toBe(true);
  });

  it("leaves real places alone", () => {
    for (const ok of [
      "Chun Yang Tea | Bubble tea in New York",
      "Casino Barrière Abidjan — jeux, restaurant, spectacles",
      "Judi's Kitchen",
      "Lambeth Walk Café",
      "The Slot Machine Bar & Grill",
      "Royal Casino Hotel",
      "Pizzaria Gaúcha",
    ])
      expect(isGamblingSpam(ok), ok).toBe(false);
  });

  it("marks a website that now redirects to a slot-gambling page as hijacked, with no photo", async () => {
    const fetchImpl = (async (url: URL) => {
      if (url.hostname === "www.chunyangtea.com")
        return new Response(null, {
          status: 301,
          headers: { location: "https://www.comfortcleanco.com/faq" },
        });
      if (url.hostname === "www.comfortcleanco.com")
        return new Response(
          `<html lang="id"><head><title>COY99 # Hasil RTP Slot Gacor Hari Ini</title>
           <meta property="og:image" content="https://domeladio.com/img/rtp-slot-coy99.webp"></head></html>`,
          { headers: { "content-type": "text/html" } },
        );
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
    const result = await websiteImage("http://www.chunyangtea.com/", {
      fetchImpl,
      lookup: publicLookup,
    });
    expect(result).toEqual({ image: null, adult: false, hijacked: true });
  });

  it("catches spam that only shows in the photo names", async () => {
    const fetchImpl = (async () =>
      new Response(
        `<html><head><title>Doveton Cafe</title>
         <meta property="og:image" content="https://dovetoncafe.com/img/indosat-nenekslot.jpg"></head></html>`,
        { headers: { "content-type": "text/html" } },
      )) as unknown as typeof fetch;
    const result = await websiteImage("https://dovetoncafe.com/", {
      fetchImpl,
      lookup: publicLookup,
    });
    expect(result.hijacked).toBe(true);
    expect(result.image).toBeNull();
  });
});
