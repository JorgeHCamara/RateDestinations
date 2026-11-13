import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import robots, { BLOCKED_BOTS } from "@/app/robots";
import { AUTH_COOKIE, hasAuthCookie, SESSION_MARKER } from "@/lib/auth/session-cookie";
import { config } from "@/proxy";

const matches = (url: string, cookies?: Record<string, string>) =>
  unstable_doesMiddlewareMatch({ config, url, cookies });

describe("proxy matcher", () => {
  it("runs on the session pages", () => {
    for (const url of ["/me", "/login", "/welcome", "/auth/callback", "/auth/confirm", "/search"])
      expect(matches(url), url).toBe(true);
  });

  it("skips public pages for crawlers and signed-out visitors", () => {
    for (const url of [
      "/",
      "/cities",
      "/city/pt/lisbon",
      "/city/pt/lisbon/park",
      "/place/123",
      "/country/pt",
      "/privacy",
      "/terms",
    ])
      expect(matches(url), url).toBe(false);
  });

  it("runs on public pages for signed-in visitors (session marker), to refresh their session", () => {
    for (const url of ["/", "/city/pt/lisbon", "/place/123", "/country/pt"])
      expect(matches(url, { [SESSION_MARKER]: "1" }), url).toBe(true);
  });

  it("never runs on static files, the sitemap, robots.txt or the API", () => {
    for (const cookies of [undefined, { [SESSION_MARKER]: "1" }])
      for (const url of [
        "/sitemap.xml",
        "/robots.txt",
        "/favicon.ico",
        "/icon.svg",
        "/email/logo.png",
        "/_next/static/chunks/app.js",
        "/api/search?q=lis",
        "/api/places/1/preview",
        "/api/cron/refresh",
      ])
        expect(matches(url, cookies), url).toBe(false);
  });
});

describe("Supabase session cookies", () => {
  it("recognises the session cookie, chunked or not", () => {
    expect(hasAuthCookie(["sb-qiqydrxhdvoruavgpmus-auth-token"])).toBe(true);
    expect(hasAuthCookie(["theme", "sb-abc123-auth-token.0"])).toBe(true);
    expect(hasAuthCookie(["sb-abc123-auth-token-code-verifier"])).toBe(false);
    expect(hasAuthCookie([SESSION_MARKER, "_ga"])).toBe(false);
    expect(AUTH_COOKIE.test("sb-abc-auth-token.12")).toBe(true);
  });
});

describe("robots.txt", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  it("lets search engines in and keeps AI-training scrapers out", () => {
    expect(rules[0]).toMatchObject({ userAgent: "*", allow: "/" });
    const blocked = rules.find((x) => x.userAgent !== "*")!;
    expect(blocked.disallow).toBe("/");
    for (const bot of ["GPTBot", "CCBot", "Bytespider", "ClaudeBot", "Amazonbot"])
      expect(BLOCKED_BOTS).toContain(bot);
    for (const engine of ["Googlebot", "Bingbot", "DuckDuckBot"])
      expect(BLOCKED_BOTS).not.toContain(engine);
  });
});
