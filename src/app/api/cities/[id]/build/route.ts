import { NextResponse } from "next/server";
import { after } from "next/server";
import { query, queryOne } from "@/lib/db";
import { importCity } from "@/lib/import/import-city";

export const maxDuration = 300;

/**
 * POST /api/cities/:id/build — called by the city page on first visit when the guide
 * hasn't been built, and by its "Try again" button. Claims the city (so concurrent visitors and
 * repeat calls are no-ops) and runs the OpenStreetMap import after the response is sent. Builds and prerenders never trigger imports; only a real visit does.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/cities/[id]/build">) {
  const { id } = await ctx.params;
  const cityId = Number(id);
  if (!Number.isInteger(cityId) || cityId <= 0)
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const city = await queryOne<{ import_status: string }>(
    "select import_status from cities where id = $1",
    [cityId],
  );
  if (!city) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (city.import_status === "done") return NextResponse.json({ status: "done", started: false });
  // Pending or failed: the claim only succeeds when the earlier attempt is stale (cut off after
  // 6 minutes, or failed more than 2 minutes ago), so "Try again" can't start parallel imports.
  const claimed = await queryOne<{ claim_city_import: boolean }>(
    "select claim_city_import($1, make_interval(days => 90))",
    [cityId],
  );
  if (!claimed?.claim_city_import) return NextResponse.json({ status: "pending", started: false });
  after(async () => {
    try {
      await claimAndImportAlreadyClaimed(cityId);
    } catch (err) {
      console.error(`[import] city ${cityId} failed:`, (err as Error).message);
    }
  });
  return NextResponse.json({ status: "pending", started: true });
}

// The claim happened above (so the response can say so); run the import itself.
async function claimAndImportAlreadyClaimed(cityId: number) {
  try {
    await importCity(cityId);
  } catch (err) {
    await query(
      "update cities set import_status = 'failed', import_error = $2, imported_at = now() where id = $1",
      [cityId, String((err as Error).message).slice(0, 1000)],
    );
    throw err;
  }
}
