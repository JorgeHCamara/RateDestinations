import { NextResponse } from "next/server";
import { claimAndImport } from "@/lib/import/import-city";
import { isAuthorizedCronRequest } from "@/lib/import/auth";

export const maxDuration = 300;

/** POST /api/cities/:id/import — (re)import a city's places from OpenStreetMap. Protected by CRON_SECRET. */
export async function POST(request: Request, ctx: RouteContext<"/api/cities/[id]/import">) {
  if (!isAuthorizedCronRequest(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const cityId = Number(id);
  if (!Number.isInteger(cityId) || cityId <= 0)
    return NextResponse.json({ error: "invalid city id" }, { status: 400 });
  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    const result = await claimAndImport(cityId, force ? 0 : 90);
    if (!result)
      return NextResponse.json({ skipped: true, reason: "already imported or in progress" });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
