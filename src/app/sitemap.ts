import type { MetadataRoute } from "next";
import { MIN_COUNTRY_GUIDES, countryPath, getCountriesWithGuides } from "@/lib/queries/countries";
import { getSitemapRows } from "@/lib/queries/seo";
import { SITE_URL } from "@/lib/site-url";

/**
 * /sitemap.xml: the home page, the list of all city guides, countries with 2+ guides, every
 * city with a guide, its category lists and the places people
 * have rated (see lib/queries/seo.ts for what is left out and why). Refreshed hourly, so a guide
 * built today is listed today.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ cities, categories, places }, countries] = await Promise.all([
    getSitemapRows(),
    getCountriesWithGuides(MIN_COUNTRY_GUIDES),
  ]);
  const date = (d: string | null) => (d ? new Date(d) : undefined);
  const city = (cc: string, slug: string) => `${SITE_URL}/city/${cc.toLowerCase()}/${slug}`;
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/cities`, changeFrequency: "daily", priority: 0.9 },
    ...countries.map((c) => ({
      url: `${SITE_URL}${countryPath(c.code)}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...cities.map((c) => ({
      url: city(c.country_code, c.slug),
      lastModified: date(c.updated),
      changeFrequency: "weekly" as const,
      priority: c.population > 1_000_000 ? 0.8 : 0.6,
    })),
    ...categories.map((c) => ({
      url: `${city(c.country_code, c.slug)}/${c.category}`,
      lastModified: date(c.updated),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...places.map((p) => ({
      url: `${SITE_URL}/place/${p.id}`,
      lastModified: date(p.updated),
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
