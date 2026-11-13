import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCityBySlug } from "@/lib/queries/cities";

export async function GET(_request: Request, ctx: RouteContext<"/api/cities/[id]/status">) {
  const { id } = await ctx.params;
  const cityId = Number(id);
  if (!Number.isInteger(cityId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const row = await queryOne<{
    import_status: string;
    imported_at: string | null;
    country_code: string;
    slug: string;
  }>("select import_status, imported_at::text, country_code, slug from cities where id = $1", [
    cityId,
  ]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  // The city page reads a cached copy of this row. When the guide has moved on (built, failed,
  // rebuilt), drop that copy so the page's refresh shows it. Only when it differs, so polling
  // this route can't be used to churn the cache.
  const cached = await getCityBySlug(row.country_code.trim(), row.slug);
  if (
    cached &&
    (cached.import_status !== row.import_status || cached.imported_at !== row.imported_at)
  )
    revalidateTag(`city:${cityId}`, { expire: 0 });
  return NextResponse.json(
    { status: row.import_status, importedAt: row.imported_at },
    { headers: { "cache-control": "no-store" } },
  );
}
