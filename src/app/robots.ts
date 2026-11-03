import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/me", "/auth/"] }],
    sitemap: Array.from({ length: 7 }, (_, i) => `${siteUrl}/sitemap/${i}.xml`),
  };
}
