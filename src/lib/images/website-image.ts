/**
 * The share image a place's website publishes (og:image / twitter:image), the one chat apps show
 * in link previews. Often a real photo of the place; sometimes a logo or a banner, which the
 * filters here try to leave out: by name, by file type, and by size and shape.
 */
import { hasAdultName } from "@/lib/import/filters";
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

export function isSkippedWebsite(website: string): boolean {
  try {
    return SKIP_HOSTS.test(new URL(website).hostname);
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

/**
 * The website's share image, if it is a photo, and whether the website describes an adult venue
 * (a strip club listed as a bar: its own title says so).
 */
export async function websiteImage(
  website: string,
  opts: SafeFetchOptions & { userAgent?: string; nightlife?: boolean } = {},
): Promise<{ image: WebsiteImage | null; adult: boolean }> {
  if (isSkippedWebsite(website)) return { image: null, adult: false };
  const userAgent =
    opts.userAgent ??
    `Mozilla/5.0 (compatible; RateDestinationsBot/1.0; +${process.env.NEXT_PUBLIC_SITE_URL ?? "https://ratedestinations.vercel.app"})`;
  const page = await safeFetch(website, {
    ...opts,
    headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
    maxBytes: 400_000,
  });
  if (page.status >= 400 || !/html/i.test(page.contentType || "text/html"))
    return { image: null, adult: false };
  const html = new TextDecoder().decode(page.body);
  const adult = hasAdultName(pageText(html), opts.nightlife ?? false);
  if (adult) return { image: null, adult };
  const meta = findShareImage(html, page.url);
  if (!meta || NOT_A_PHOTO.test(new URL(meta.url).pathname)) return { image: null, adult };
  if (meta.width && meta.height && !looksLikePhoto({ width: meta.width, height: meta.height }))
    return { image: null, adult };
  if (!(await isPhoto(meta.url, opts, userAgent))) return { image: null, adult };
  const host = new URL(page.url).hostname.replace(/^www\./, "");
  return { image: { url: meta.url, page: website, credit: host }, adult };
}
