import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/import/auth";
import { REVALIDATE_TAG } from "@/lib/import/revalidate";

/**
 * POST /api/revalidate — `{ "tags": ["city:123", "city-directory", …] }`. For jobs that change
 * cities or places outside Next (scripts/import-overture.ts): cached pages last days, so they
 * say what changed. Protected by CRON_SECRET; only our own tag shapes are accepted.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags : null;
  if (!tags || tags.length === 0 || tags.length > 2000)
    return NextResponse.json({ error: "tags: 1 to 2000 tags" }, { status: 400 });
  const valid = [
    ...new Set(tags.filter((t): t is string => typeof t === "string" && REVALIDATE_TAG.test(t))),
  ];
  for (const tag of valid) revalidateTag(tag, "max");
  return NextResponse.json({ revalidated: valid.length, ignored: tags.length - valid.length });
}
