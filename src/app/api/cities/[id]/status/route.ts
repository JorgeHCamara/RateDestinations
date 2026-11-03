import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export async function GET(_request: Request, ctx: RouteContext<"/api/cities/[id]/status">) {
  const { id } = await ctx.params;
  const cityId = Number(id);
  if (!Number.isInteger(cityId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const row = await queryOne<{ import_status: string; imported_at: string | null }>(
    "select import_status, imported_at::text from cities where id = $1",
    [cityId],
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(
    { status: row.import_status, importedAt: row.imported_at },
    { headers: { "cache-control": "no-store" } },
  );
}
