/**
 * The share image a place's website publishes (og:image / twitter:image), the one chat apps show
 * in link previews. Often a real photo of the place; sometimes a logo or a banner, which the
 * filters here try to leave out: by name, by file type, and by size and shape.
 */
import { SITE_URL } from "@/lib/site-url";
import { hasAdultName, isAdultPhotoName, isGamblingSpam } from "@/lib/import/filters";
import { safeFetch, type SafeFetchOptions } from "./safe-fetch";

/**
 * Websites whose share image is never a photo of one place: social profiles, link pages, review
 * sites, and Wikipedia (a place's "website" pointing at an article is often the wrong article).
 */
const SKIP_HOSTS =
  /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|twitter\.com|x\.com|tiktok\.com|linktr\.ee|wa\.me|whatsapp\.com|google\.[a-z.]+|goo\.gl|youtube\.com|ifood\.com\.br|ubereats\.com|doordash\.com|tripadvisor\.[a-z.]+|yelp\.[a-z.]+|wikipedia\.org|wikimedia\.org|wikivoyage\.org)$/i;

/** File names that are logos, icons or placeholders rather than photos. */
const NOT_A_PHOTO =
  /logo|favicon|icon|avatar|placeholder|default[-_]?(image|img|og|share)|no[-_]?image|blank|spacer|sprite|brand[-_]?mark|watermark|share[-_]?(image|img|default)?[-_]?\d*\.(png|svg)|\.svg(\?|$)|\.ico(\?|$)|\.gif(\?|$)/i;

/**
 * Government and city-hall portals: many parks, markets and squares list their municipality's or
 * parish's site, whose share image is a campaign banner, not the place. (Their photos come from
 * Wikimedia instead.) Portuguese câmaras and juntas (cm-*.pt, jf-*.pt), .gov / .gob / .gouv
 * domains, Brazilian prefeituras, Japanese local governments (.lg.jp), and city domains such as
 * toronto.ca or vaughan.ca.
 */
const GOVERNMENT_HOSTS =
  /(^|\.)((cm|jf|uf)-[a-z0-9-]+\.pt|[a-z0-9-]+\.(gov|gob|gouv)(\.[a-z]{2})?|gov\.[a-z]{2}|prefeitura\.[a-z.]+|[a-z0-9-]+\.lg\.jp|city\.[a-z0-9-]+\.[a-z.]+|(toronto|vaughan|mississauga|ottawa|montreal|vancouver|calgary)\.ca|lisboa\.pt|porto\.pt)$/i;

export function isSkippedWebsite(website: string): boolean {
  try {
    const host = new URL(website).hostname;
    return SKIP_HOSTS.test(host) || GOVERNMENT_HOSTS.test(host);
  } catch {
    return true;
  }
}

/** Decode the few HTML entities that show up in URLs. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export type MetaImage = { url: string; width: number | null; height: number | null };

/** The page's share image, absolute and https, with its declared size if the page gives one. */
export function findShareImage(html: string, pageUrl: string): MetaImage | null {
  const head = html.slice(0, 200_000);
  const metas = Array.from(head.matchAll(/<meta\b[^>]*>/gi)).map((m) => m[0]);
  const attr = (tag: string, name: string) =>
    tag
      .match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
      ?.slice(1)
      .find(Boolean) ?? null;
  const byKey = new Map<string, string>();
  for (const tag of metas) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !byKey.has(key)) byKey.set(key, decodeEntities(content.trim()));
  }
  const raw =
    byKey.get("og:image:secure_url") ??
    byKey.get("og:image") ??
    byKey.get("og:image:url") ??
    byKey.get("twitter:image") ??
    byKey.get("twitter:image:src");
  if (!raw || /[{}<>\s]/.test(raw)) return null; // missing, or an unrendered template like "{{ image() }}"
  let url: URL;
  try {
    url = new URL(raw, pageUrl);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "https:"; // never mixed content; a broken one falls back
  if (url.protocol !== "https:") return null;
  const num = (k: string) => {
    const n = Number(byKey.get(k));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    url: url.toString().slice(0, 1000),
    width: num("og:image:width"),
    height: num("og:image:height"),
  };
}

function absoluteHttps(raw: string | null | undefined, pageUrl: string): string | null {
  if (!raw) return null;
  const value = decodeEntities(raw.trim());
  if (!value || value.startsWith("data:") || /[{}<>\s]/.test(value)) return null;
  try {
    const url = new URL(value, pageUrl);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Images the page names in its structured data for search engines (schema.org JSON-LD: the
 * "image" or "photo" of the business), as a URL, a list, or an ImageObject ({ url | contentUrl }).
 * Logos are not taken.
 */
export function jsonLdImages(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  const add = (value: unknown): void => {
    if (out.length >= 6 || !value) return;
    if (typeof value === "string") {
      const url = absoluteHttps(value, pageUrl);
      if (url && !out.includes(url)) out.push(url);
    } else if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "object") {
      const o = value as Record<string, unknown>;
      add(o.url ?? o.contentUrl);
    }
  };
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "image" || key === "photo") add(value);
      else if (key !== "logo" && typeof value === "object") walk(value); // e.g. @graph
    }
  };
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of scripts) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      // malformed JSON-LD is common; skip it
    }
  }
  return out;
}

/**
 * Large pictures in the page itself (hero and gallery photos): an <img> whose srcset offers
 * 800 px or more, or whose width attribute is at least 600. Lazy-loading attributes count.
 */
export function largePageImages(html: string, pageUrl: string, max = 4): string[] {
  const out: string[] = [];
  const attr = (tag: string, name: string) =>
    tag
      .match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))
      ?.slice(1)
      .find(Boolean) ?? null;
  for (const m of html.slice(0, 400_000).matchAll(/<img\b[^>]*>/gi)) {
    if (out.length >= max) break;
    const tag = m[0];
    if (/\b(logo|icon|avatar|sprite|badge|flag|payment|award)\b/i.test(tag)) continue;
    const srcset = attr(tag, "srcset") ?? attr(tag, "data-srcset");
    let best: string | null = null;
    let bestW = 0;
    for (const part of (srcset ?? "").split(",")) {
      const [u, w] = part.trim().split(/\s+/);
      const width = Number((w ?? "").replace(/w$/, ""));
      if (u && Number.isFinite(width) && width > bestW) {
        best = u;
        bestW = width;
      }
    }
    const declared = Number(attr(tag, "width"));
    const src = best ?? attr(tag, "data-src") ?? attr(tag, "data-lazy-src") ?? attr(tag, "src");
    if (bestW < 800 && !(declared >= 600)) continue;
    const url = absoluteHttps(src, pageUrl);
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

/** Big enough and photo-shaped: logos are small or square-ish, banners very wide. */
export function looksLikePhoto(size: { width: number; height: number }): boolean {
  const { width, height } = size;
  if (width < 400 || height < 220) return false;
  const ratio = width / height;
  return ratio >= 0.75 && ratio <= 2.6;
}

/**
 * Colour statistics of a small copy of the image. Logos and text graphics are a few flat colours
 * (one fills a large share of the picture); photos have hundreds of colours, none dominant.
 * Measured on 43 real share images: this keeps 17 of 22 photos and drops 19 of 21 logos.
 */
export function colourStats(rgb: Uint8Array): { dominant: number; top3: number; colours: number } {
  const counts = new Map<number, number>();
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const key = ((rgb[i] >> 4) << 8) | ((rgb[i + 1] >> 4) << 4) | (rgb[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = Math.max(1, Math.floor(rgb.length / 3));
  const sorted = [...counts.values()].sort((a, b) => b - a);
  return {
    dominant: (sorted[0] ?? 0) / total,
    top3: ((sorted[0] ?? 0) + (sorted[1] ?? 0) + (sorted[2] ?? 0)) / total,
    colours: counts.size,
  };
}

export function looksLikeGraphic(stats: ReturnType<typeof colourStats>): boolean {
  return stats.dominant >= 0.25 || stats.top3 >= 0.4 || stats.colours < 100;
}

/** Download the image and check it is a photo: size, shape and colours. */
async function isPhoto(url: string, opts: SafeFetchOptions, userAgent: string): Promise<boolean> {
  const img = await safeFetch(url, {
    ...opts,
    headers: { "user-agent": userAgent, accept: "image/avif,image/webp,image/jpeg,image/png" },
    maxBytes: 6 * 1024 * 1024,
  }).catch(() => null);
  if (!img || img.status >= 400 || /svg|gif|icon/i.test(img.contentType)) return false;
  try {
    const { default: sharp } = await import("sharp");
    const image = sharp(img.body, { limitInputPixels: 50_000_000 });
    const { width, height } = await image.metadata();
    if (!width || !height || !looksLikePhoto({ width, height })) return false;
    const { data } = await image
      .resize(48, 27, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return !looksLikeGraphic(colourStats(data));
  } catch {
    return false; // truncated or not an image we can read
  }
}

/** The page's own words about itself: title, share title, description, keywords. */
export function pageText(html: string): string {
  const head = html.slice(0, 200_000);
  const title = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  const metas = Array.from(
    head.matchAll(
      /<meta\b[^>]*(?:name|property)\s*=\s*["'](?:og:title|og:description|description|keywords|twitter:title|twitter:description)["'][^>]*>/gi,
    ),
  )
    .map(
      (m) =>
        m[0]
          .match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
          ?.slice(1)
          .find(Boolean) ?? "",
    )
    .join(" ");
  return `${title} ${metas}`.slice(0, 4000);
}

export type WebsiteImage = { url: string; page: string; credit: string };

export type WebsiteImageResult = {
  image: WebsiteImage | null;
  /** The website describes an adult venue (a strip club listed as a bar: its own title says so). */
  adult: boolean;
  /** The website is now gambling spam (a lapsed domain bought by spammers): not the place's. */
  hijacked?: boolean;
};

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The host without "www.": "chunyangtea.com". */
function bareHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

/** The website's share image, if it is a photo, and what the website says about the place. */
export async function websiteImage(
  website: string,
  opts: SafeFetchOptions & { userAgent?: string; nightlife?: boolean } = {},
): Promise<WebsiteImageResult> {
  if (isSkippedWebsite(website)) return { image: null, adult: false };
  const userAgent =
    opts.userAgent ?? `Mozilla/5.0 (compatible; RateDestinationsBot/1.0; +${SITE_URL})`;
  const page = await safeFetch(website, {
    ...opts,
    headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
    maxBytes: 400_000,
  });
  if (page.status >= 400 || !/html/i.test(page.contentType || "text/html"))
    return { image: null, adult: false };
  const html = new TextDecoder().decode(page.body);
  const text = pageText(html);
  if (isGamblingSpam(text)) return { image: null, adult: false, hijacked: true };
  const adult = hasAdultName(text, opts.nightlife ?? false);
  if (adult) return { image: null, adult };
  // Candidates, best first: the share image, the photos the page names for search engines, then
  // big photos on the page. The first that passes the photo checks wins; at most 4 are fetched.
  const meta = findShareImage(html, page.url);
  const candidates: { url: string; width?: number | null; height?: number | null }[] = [];
  let spamPhoto = false;
  const push = (c: { url: string; width?: number | null; height?: number | null }) => {
    const path = new URL(c.url).pathname;
    if (!candidates.some((x) => x.url === c.url) && !NOT_A_PHOTO.test(path)) {
      // A page that names its photos "rtp-slot-…" is spam even when its title hides it.
      const name = safeDecode(path);
      if (isGamblingSpam(name)) spamPhoto = true;
      else if (!isAdultPhotoName(name)) candidates.push(c);
    }
  };
  if (meta) push(meta);
  for (const url of jsonLdImages(html, page.url)) push({ url });
  for (const url of largePageImages(html, page.url)) push({ url });
  if (spamPhoto) return { image: null, adult: false, hijacked: true };
  let chosen: string | null = null;
  let tried = 0;
  for (const c of candidates) {
    if (tried >= 4) break;
    if (c.width && c.height && !looksLikePhoto({ width: c.width, height: c.height })) continue;
    tried++;
    if (await isPhoto(c.url, opts, userAgent)) {
      chosen = c.url;
      break;
    }
  }
  if (!chosen) return { image: null, adult };
  return { image: { url: chosen, page: website, credit: bareHost(page.url) }, adult };
}
