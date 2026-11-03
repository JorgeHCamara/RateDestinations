import { describe, expect, it } from "vitest";
import { commonsImage, labelNamesPlace } from "@/lib/images/commons";
import { assertPublicUrl, isPrivateAddress, safeFetch } from "@/lib/images/safe-fetch";
import {
  colourStats,
  findShareImage,
  isSkippedWebsite,
  jsonLdImages,
  largePageImages,
  looksLikeGraphic,
  looksLikePhoto,
  pageText,
} from "@/lib/images/website-image";
import { hasAdultName } from "@/lib/import/filters";

const publicLookup = async () => ["93.184.216.34"];

describe("safe fetch", () => {
  it("knows private addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("refuses URLs that point inside", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("https://example.com:8443/")).rejects.toThrow();
    await expect(assertPublicUrl("https://evil.test/", async () => ["10.0.0.5"])).rejects.toThrow();
    await expect(assertPublicUrl("https://example.com/", publicLookup)).resolves.toBeInstanceOf(
      URL,
    );
  });
  it("checks every redirect", async () => {
    const fetchImpl = (async (url: URL) =>
      url.hostname === "example.com"
        ? new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } })
        : new Response("secret")) as unknown as typeof fetch;
    await expect(
      safeFetch("https://example.com/", { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow(/private/);
  });
  it("cuts long bodies off", async () => {
    const fetchImpl = (async () => new Response("x".repeat(10_000))) as unknown as typeof fetch;
    const res = await safeFetch("https://example.com/", {
      fetchImpl,
      lookup: publicLookup,
      maxBytes: 100,
    });
    expect(res.body.length).toBe(100);
  });
});

describe("website share images", () => {
  it("finds the share image and makes it absolute https", () => {
    const html = `<head><meta property="og:image" content="/img/room.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"></head>`;
    expect(findShareImage(html, "http://bar.example/home")).toEqual({
      url: "https://bar.example/img/room.jpg",
      width: 1200,
      height: 630,
    });
    expect(
      findShareImage(
        `<meta name="twitter:image" content='//cdn.example/a.jpg?x=1&amp;y=2'>`,
        "https://a.example/",
      ),
    ).toMatchObject({ url: "https://cdn.example/a.jpg?x=1&y=2" });
    expect(
      findShareImage(`<meta property="og:image" content="{{ image() }}">`, "https://a.example/"),
    ).toBeNull();
    expect(findShareImage(`<title>x</title>`, "https://a.example/")).toBeNull();
  });
  it("skips social profiles and Wikipedia", () => {
    expect(isSkippedWebsite("https://www.instagram.com/barx")).toBe(true);
    expect(isSkippedWebsite("https://pt.wikipedia.org/wiki/Costa_da_Caparica")).toBe(true);
    expect(isSkippedWebsite("https://www.barbrahma.com.br/")).toBe(false);
  });
  it("tells photos from logos by size, shape and colours", () => {
    expect(looksLikePhoto({ width: 1200, height: 630 })).toBe(true);
    expect(looksLikePhoto({ width: 200, height: 200 })).toBe(false);
    expect(looksLikePhoto({ width: 1500, height: 300 })).toBe(false);
    const flat = new Uint8Array(48 * 27 * 3).fill(255); // a white logo background
    expect(looksLikeGraphic(colourStats(flat))).toBe(true);
    let seed = 42;
    const noisy = new Uint8Array(48 * 27 * 3).map(() => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31; // photo-like variety: pseudo-random pixels
      return seed >> 23;
    });
    expect(looksLikeGraphic(colourStats(noisy))).toBe(false);
  });
  it("reads what a website says about itself, to catch adult venues", () => {
    const html = `<title>Body Club</title><meta name="description" content="Lisbon Gentleman's Strip Club">`;
    expect(hasAdultName(pageText(html), true)).toBe(true);
    expect(hasAdultName(pageText(`<title>Bar Brahma — samba desde 1948</title>`), true)).toBe(
      false,
    );
  });
});

describe("Wikidata matches", () => {
  it("needs the item's label to carry the place's whole name", () => {
    expect(labelNamesPlace("Parque Eduardo VII", "Parque Eduardo VII")).toBe(true);
    expect(labelNamesPlace("Estufa Fria", "Estufa Fria de Lisboa")).toBe(true);
    expect(labelNamesPlace("Museu Medeiros e Almeida", "Casa-Museu Medeiros e Almeida")).toBe(true);
    expect(labelNamesPlace("Frigideira Grill São Bento", "São Bento")).toBe(false);
    expect(labelNamesPlace("Cama & Café São Paulo", "São Paulo")).toBe(false);
    expect(labelNamesPlace("Bar Guanabara", "Guanabara")).toBe(false);
  });
  it("uses scaled thumbnails, never originals", async () => {
    const calls: string[] = [];
    const page = (thumburl: string) => ({
      query: {
        pages: {
          "1": {
            imageinfo: [
              {
                thumburl,
                width: 800,
                mime: "image/jpeg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:A.jpg",
                extmetadata: {
                  Artist: { value: "<a href='x'>Ana</a>" },
                  LicenseShortName: { value: "CC BY-SA 4.0" },
                },
              },
            ],
          },
        },
      },
    });
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return Response.json(
        url.includes("iiurlwidth=960")
          ? page("https://upload.wikimedia.org/wikipedia/commons/a/aa/A.jpg?utm_source=x")
          : page(
              "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/A.jpg/500px-A.jpg?utm_source=x",
            ),
      );
    }) as unknown as typeof fetch;
    expect(await commonsImage("A.jpg", { fetchImpl })).toEqual({
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/A.jpg/500px-A.jpg",
      page: "https://commons.wikimedia.org/wiki/File:A.jpg",
      credit: "Ana, CC BY-SA 4.0",
    });
    expect(calls).toHaveLength(2);
  });
});

describe("more website photo candidates", () => {
  it("skips government and city-hall portals", () => {
    for (const site of [
      "https://www.cm-lisboa.pt/equipamentos/mercado",
      "https://www.jf-benfica.pt/",
      "https://prefeitura.sp.gov.br/parque",
      "https://www.toronto.ca/parks/june-rowlands",
      "https://www.vaughan.ca/",
      "https://www.city.shinjuku.lg.jp/",
      "https://www.nps.gov/",
    ])
      expect(isSkippedWebsite(site), site).toBe(true);
    for (const site of [
      "https://www.barbrahmacentro.com/",
      "https://dote.pt/",
      "https://www.govinda.pt/",
    ])
      expect(isSkippedWebsite(site), site).toBe(false);
  });
  it("reads the photos a page names for search engines", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Restaurant","name":"X","logo":"https://x.pt/logo.png","image":["/img/sala.jpg",{"@type":"ImageObject","url":"https://cdn.x.pt/terraco.webp"}]}]}</script><script type="application/ld+json">{ broken</script>`;
    expect(jsonLdImages(html, "https://x.pt/")).toEqual([
      "https://x.pt/img/sala.jpg",
      "https://cdn.x.pt/terraco.webp",
    ]);
  });
  it("finds big photos on the page and ignores logos and small images", () => {
    const html = `<img src="/logo.png" class="site-logo" width="900">
      <img src="/thumb.jpg" width="120">
      <img srcset="/hero-480.jpg 480w, /hero-1600.jpg 1600w" src="/hero-480.jpg">
      <img data-src="/gallery/1.jpg" width="1200" height="800">`;
    expect(largePageImages(html, "http://x.pt/")).toEqual([
      "https://x.pt/hero-1600.jpg",
      "https://x.pt/gallery/1.jpg",
    ]);
  });
});
