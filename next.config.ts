import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  /**
   * Cache profiles for public pages. Next's built-in profiles all keep `stale` at 5 minutes, and a
   * page's x-nextjs-stale-time is the shortest `stale` of the caches it uses; these hold pages for
   * an hour in the browser.
   *
   * `guide` (places, city guides, category lists, city lookups, trending) is kept for days: its
   * freshness comes from tags, not time. Ratings and name changes call updateTag (place:<id>,
   * city:<id>, trending in actions/ratings.ts and actions/profile.ts); imports call revalidateTag
   * (city:<id>, city-directory, sitemap in the import, build, cron and status routes, and
   * /api/revalidate for the offline Overture job). Rewriting every page hourly was the biggest
   * cost (ISR writes). `directory` (the /cities list, country lists, sitemap) is refreshed daily.
   */
  cacheLife: {
    guide: { stale: 3600, revalidate: 604_800, expire: 2_592_000 }, // 7 days / 30 days
    directory: { stale: 3600, revalidate: 86_400, expire: 604_800 }, // 1 day / 7 days
    reference: { stale: 3600, revalidate: 86_400, expire: 604_800 }, // was "days"
    stable: { stale: 3600, revalidate: 2_592_000, expire: 31_536_000 }, // was "max"
  },
  serverExternalPackages: ["pg"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
