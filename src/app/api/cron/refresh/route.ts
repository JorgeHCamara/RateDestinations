import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { claimAndImport } from "@/lib/import/import-city";
import { isAuthorizedCronRequest } from "@/lib/import/auth";

export const maxDuration = 300;

/**
 * GET /api/cron/refresh — daily maintenance (see vercel.json):
 *  - re-import a few cities whose OSM data is older than 90 days
 *  - retry recent failed imports
 *  - recompute city stats (cheap, keeps aggregates honest after any manual data fix)
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const budgetMs = 240_000;

  const candidates = await query<{ id: number; name: string }>(
    `select id, name from cities
     where (import_status = 'done' and imported_at < now() - interval '90 days')
        or (import_status = 'failed' and imported_at < now() - interval '1 day')
        or (import_status = 'pending' and coalesce(imported_at, created_at) < now() - interval '1 hour')
     order by population desc limit 5`,
  );
  const refreshed: { id: number; name: string; ok: boolean; places?: number; error?: string }[] =
    [];
  for (const c of candidates) {
    if (Date.now() - started > budgetMs) break;
    try {
      const r = await claimAndImport(c.id, 90);
      refreshed.push({ id: c.id, name: c.name, ok: true, places: r?.places });
    } catch (err) {
      refreshed.push({ id: c.id, name: c.name, ok: false, error: (err as Error).message });
    }
  }

  await query(`select refresh_city_stats(city_id) from city_stats`);
  return NextResponse.json({ refreshed, durationMs: Date.now() - started });
}
