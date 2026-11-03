import { describe, expect, it, vi } from "vitest";
import { cleanPublicName, publicNameProblem } from "@/lib/public-name";

vi.mock("server-only", () => ({}));
const { isThrowawayEmail } = await import("@/lib/blocked-email");

describe("public names", () => {
  it.each(["Ana", "Maria Silva", "TokyoLocal", "O'Brien", "太郎", "Jo", "João Pedro"])(
    "%s is fine",
    (name) => expect(publicNameProblem(name)).toBeNull(),
  );
  it.each([
    ["J", /at least/],
    ["x".repeat(41), /at most/],
    ["12345", /letter/],
    ["jorge@hotmail.com", /email/],
    ["www.mybar.pt", /web address/],
    ["visit mybar.com", /web address/],
    ["Call 912 345 678", /phone/],
    ["Admin", /reserved/],
    ["RateDestinations team", /reserved/],
  ])("%s is refused", (name, why) => expect(publicNameProblem(name)).toMatch(why));
  it("tidies spaces", () => expect(cleanPublicName("  Ana   Maria ")).toBe("Ana Maria"));
});

describe("throwaway email addresses", () => {
  it("knows the throwaway services, subdomains included", () => {
    expect(isThrowawayEmail("someone@mailinator.com")).toBe(true);
    expect(isThrowawayEmail("SOMEONE@YOPmail.com ")).toBe(true);
    expect(isThrowawayEmail("a@inbox.mailinator.com")).toBe(true);
  });
  it("lets real providers through", () => {
    for (const email of [
      "a@gmail.com",
      "a@hotmail.com",
      "a@outlook.com",
      "a@icloud.com",
      "a@uol.com.br",
      "a@sapo.pt",
      "a@company.co.uk",
    ])
      expect(isThrowawayEmail(email), email).toBe(false);
  });
});
