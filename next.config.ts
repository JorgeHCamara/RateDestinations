import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  /**
   * Cache profiles for public pages. Next's built-in profiles all keep `stale` at 5 minutes, and a
   * page's x-nextjs-stale-time is the shortest `stale` of the caches it uses, so city and place
   * pages were treated as stale after 5 minutes. These keep each built-in's revalidate/expire but
   * hold pages for an hour. Ratings still show at once: their Server Actions call updateTag,
   * which clears these caches and the browser's.
   */
  cacheLife: {
    guide: { stale: 3600, revalidate: 3600, expire: 86_400 }, // was "hours"
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
