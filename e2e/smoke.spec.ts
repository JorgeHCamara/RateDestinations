import { expect, test } from "@playwright/test";

// Runs against a built app with a seeded database (see README → Testing). Lisbon must be
// imported (`pnpm tsx scripts/import-fixture.ts pt/lisbon tests/fixtures/overpass-lisbon.json`).

test("home → search → city guide → category → place", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Know a city before you go");

  const search = page.getByRole("combobox").first();
  await search.fill("Lisbon");
  const option = page.getByRole("option", { name: /Lisbon.*Portugal/ }).first();
  await expect(option).toBeVisible();
  await option.click();

  await expect(page).toHaveURL(/\/city\/pt\/lisbon$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lisbon");
  await expect(page.getByRole("heading", { name: "What people warn about" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Restaurants/ }).first()).toBeVisible();

  await page
    .getByRole("link", { name: /^All \d+ →$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/city\/pt\/lisbon\/[a-z]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("in Lisbon");

  await page.locator("a[href^='/place/']").first().click();
  await expect(page).toHaveURL(/\/place\/\d+$/);
  await expect(page.getByText("What travellers say")).toBeVisible();
  await expect(page.getByText(/Sign in to rate|Rate this place/).first()).toBeVisible();
});

test("search API returns ranked cities", async ({ request }) => {
  const res = await request.get("/api/search?q=sao%20paulo");
  expect(res.ok()).toBeTruthy();
  const { hits } = (await res.json()) as { hits: { name: string; country_code: string }[] };
  expect(hits[0]).toMatchObject({ name: "São Paulo", country_code: "BR" });
});

// The city check runs inside the guide's Suspense boundary, so the shell streams with a 200 and
// Next renders the not-found page in place with a noindex tag (a soft 404, as documented for
// streamed routes). A hard 404 would need the existence check before streaming starts.
test("unknown city shows the not-found page and is noindexed", async ({ page }) => {
  await page.goto("/city/xx/nowhere");
  await expect(page.getByText("Off the map")).toBeVisible();
  expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBeGreaterThan(0);
});
