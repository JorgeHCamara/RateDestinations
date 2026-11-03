import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { ensurePlaceImage } from "@/lib/images/place-image";

// Looking a photo up can mean fetching a website and asking Wikidata; give it room.
export const maxDuration = 30;

/** GET /api/places/:id/preview — what the hover card shows beyond the list row: photo and address. */
export async function GET(_request: Request, ctx: RouteContext<"/api/places/[id]/preview">) {
  const { id } = await ctx.params;
  const placeId = Number(id);
  if (!Number.isSafeInteger(placeId) || placeId <= 0)
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const place = await queryOne<{ city_id: number; address: string | null; website: string | null }>(
    "select city_id, address, website from places where id = $1 and not adult and not hidden",
    [placeId],
  );
  if (!place) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { image, lookedUp, adult } = await ensurePlaceImage(placeId);
  if (adult) {
    // Its website showed it is an adult venue: it was just flagged, so take it off the guide.
    revalidateTag(`city:${place.city_id}`, { expire: 0 });
    revalidateTag(`place:${placeId}`, { expire: 0 });
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // The place page shows the photo too: let it pick up the new one.
  if (lookedUp && image) revalidateTag(`place:${placeId}`, "max");

  let websiteHost: string | null = null;
  try {
    websiteHost = place.website ? new URL(place.website).hostname.replace(/^www\./, "") : null;
  } catch {}

  return NextResponse.json(
    { image, address: place.address, websiteHost },
    {
      headers: {
        // A found photo is stable for days; "no photo" is rechecked sooner at the edge.
        "cache-control": image
          ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
          : "public, max-age=600, s-maxage=3600",
      },
    },
  );
}
