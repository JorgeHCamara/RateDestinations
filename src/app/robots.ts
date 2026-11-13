import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * Crawlers that train AI models or scrape in bulk, and send no visitors back. Each request costs a
 * server render; well-behaved ones honour this, the rest need the firewall. Search engines, and the
 * AI assistants' search and user-requested fetchers (OAI-SearchBot, ChatGPT-User), stay allowed:
 * they send visitors.
 */
export const BLOCKED_BOTS = [
  "GPTBot",
  "CCBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "PerplexityBot",
  "meta-externalagent",
  "FacebookBot",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "cohere-ai",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "DataForSeoBot",
  "PetalBot",
];

const PRIVATE = ["/api/", "/me", "/auth/", "/welcome", "/search"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Search engines (Googlebot, Bingbot, DuckDuckBot…) and everyone not listed below.
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
