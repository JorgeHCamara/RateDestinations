import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load(value: string) {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
  vi.resetModules();
  return import("@/lib/site-url");
}

describe("SITE_URL", () => {
  it("drops a trailing slash so links never get a double slash", async () => {
    const { SITE_URL, absoluteUrl } = await load("https://www.ratedestinations.com/");
    expect(SITE_URL).toBe("https://www.ratedestinations.com");
    expect(absoluteUrl("/city/pt/lisbon")).toBe("https://www.ratedestinations.com/city/pt/lisbon");
    expect(absoluteUrl("/")).toBe("https://www.ratedestinations.com/");
  });

  it("keeps a clean value as is", async () => {
    const { SITE_URL } = await load(" https://example.com ");
    expect(SITE_URL).toBe("https://example.com");
  });
});
