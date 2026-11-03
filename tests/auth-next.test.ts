import { describe, expect, it } from "vitest";
import { nextFromRedirectTo, safeNext } from "@/lib/auth-next";

const origin = "https://www.ratedestinations.com";

describe("where sign-in lands", () => {
  it("keeps paths on this site only", () => {
    expect(safeNext("/city/pt/lisbon")).toBe("/city/pt/lisbon");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
  it("unwraps Supabase's RedirectTo, raw or percent-encoded", () => {
    expect(nextFromRedirectTo(`${origin}/auth/callback?next=%2Fcity%2Fpt%2Flisbon`, origin)).toBe(
      "/city/pt/lisbon",
    );
    expect(nextFromRedirectTo(`${origin}/auth/callback?next=/place/12`, origin)).toBe("/place/12");
    expect(nextFromRedirectTo(`${origin}/auth/callback`, origin)).toBe("/");
    expect(nextFromRedirectTo(`${origin}/me`, origin)).toBe("/me");
    expect(nextFromRedirectTo("/city/ca/toronto", origin)).toBe("/city/ca/toronto");
  });
  it("never leaves the site", () => {
    expect(nextFromRedirectTo("https://evil.example/auth/callback?next=/x", origin)).toBe("/");
    expect(nextFromRedirectTo(`${origin}/auth/callback?next=//evil.example`, origin)).toBe("/");
    expect(nextFromRedirectTo("javascript:alert(1)", origin)).toBe("/");
    expect(nextFromRedirectTo("not a url", origin)).toBe("/");
    expect(nextFromRedirectTo(null, origin)).toBe("/");
  });
  it("reads the link the email actually contains", () => {
    // what the template produces: .../auth/confirm?token_hash=…&type=email&next=<RedirectTo>
    const link = new URL(
      `${origin}/auth/confirm?token_hash=abc&type=email&next=${origin}/auth/callback?next=%2Fcity%2Fbr%2Fsao-paulo`,
    );
    expect(link.searchParams.get("token_hash")).toBe("abc");
    expect(link.searchParams.get("type")).toBe("email");
    expect(nextFromRedirectTo(link.searchParams.get("next"), origin)).toBe("/city/br/sao-paulo");
  });
});
