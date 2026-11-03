import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "@/lib/db-url";

const clean = "postgresql://postgres.ref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

describe("normalizeDatabaseUrl", () => {
  it("accepts a clean Supabase URL and turns SSL on", () => {
    expect(normalizeDatabaseUrl(clean)).toEqual({ url: clean, ssl: true });
  });
  it("strips quotes, a DATABASE_URL= prefix and whitespace", () => {
    expect(normalizeDatabaseUrl(`"${clean}"`).url).toBe(clean);
    expect(normalizeDatabaseUrl(`  DATABASE_URL='${clean}'\n`).url).toBe(clean);
  });
  it("drops sslmode so it cannot force certificate verification", () => {
    const r = normalizeDatabaseUrl(`${clean}?sslmode=require`);
    expect(r.url).toBe(clean);
    expect(r.ssl).toBe(true);
  });
  it("leaves local databases without SSL", () => {
    expect(normalizeDatabaseUrl("postgresql://postgres@127.0.0.1:54322/postgres").ssl).toBe(false);
  });
  it("rejects values that are not postgres URLs without echoing them", () => {
    expect(() => normalizeDatabaseUrl("https://ref.supabase.co")).toThrow(/postgresql:\/\//);
    expect(() => normalizeDatabaseUrl("postgresql://u:p#w@host/db")).toThrow(
      /not a valid URL|postgresql/,
    );
  });
});
