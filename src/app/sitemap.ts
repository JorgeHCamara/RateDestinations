import type { MetadataRoute } from "next";
import { query } from "@/lib/db";

const PER_SITEMAP = 5000;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateSitemaps() {
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from cities");
  return Array.from({ length: Math.max(1, Math.ceil(n / PER_SITEMAP)) }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string> | string;
}): Promise<MetadataRoute.Sitemap> {
  const page = Number(await id);
  const rows = await query<{
    country_code: string;
    slug: string;
    imported_at: string | null;
    population: number;
  }>(
    `select country_code, slug, imported_at::text, population from cities
     order by population desc, id limit $1 offset $2`,
    [PER_SITEMAP, page * PER_SITEMAP],
  );
  const entries: MetadataRoute.Sitemap = rows.map((r) => ({
    url: `${siteUrl}/city/${r.country_code.toLowerCase()}/${r.slug}`,
    lastModified: r.imported_at ? new Date(r.imported_at) : undefined,
    changeFrequency: "weekly",
    priority: r.population > 1_000_000 ? 0.8 : 0.5,
  }));
  if (page === 0) entries.unshift({ url: siteUrl, changeFrequency: "daily", priority: 1 });
  return entries;
}
