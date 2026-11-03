/**
 * The site's public address, without a trailing slash: "https://www.ratedestinations.com".
 * NEXT_PUBLIC_SITE_URL may be saved with one ("https://www.ratedestinations.com/"), which used to
 * turn every sitemap link into "…com//city/…".
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "");

/** An absolute URL for a path on this site ("/city/pt/lisbon"). */
export function absoluteUrl(path = "/"): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
