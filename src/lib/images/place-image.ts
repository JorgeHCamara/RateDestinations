/**
 * One photo per place, looked up once and kept in places.image_* (see migration 0005).
 *
 * Order: the place's own Wikidata photo; then, for sights, a Wikidata item with a photo named like
 * the place within 300 m, a Wikimedia Commons photo taken within 150 m whose file name carries the
 * place's name, and finally the place's website (its share image, the photos it names for search
 * engines, or a big photo on the page). Restaurants, cafés, bars and shops try their website first,
 * since Wikimedia rarely has them.
 */
import { query, queryOne } from "@/lib/db";
import { isAdultPhotoName } from "@/lib/import/filters";
import type { PlaceCategory } from "@/lib/import/categories";
import {
  commonsImage,
  namesMatch,
  nearbyCommonsFile,
  nearbyWikidataImageFile,
  wikidataImageFile,
} from "./commons";
import { websiteImage } from "./website-image";

export type PlaceImage = {
  url: string;
  source: "commons" | "website";
  credit: string;
  page: string;
};

type Candidate = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  website: string | null;
  wikidata_id: string | null;
  category: PlaceCategory;
};

const WEBSITE_FIRST = new Set<PlaceCategory>([
  "restaurant",
  "cafe",
  "bar",
  "shopping",
  "nightlife",
]);
/** How long a lookup result is kept before looking again. */
export const IMAGE_TTL_DAYS = 30;

export type ResolveOptions = { fetchImpl?: typeof fetch };

/** Find a photo for a place. Never throws for network problems; returns null instead. */
export async function findPlaceImage(
  place: Candidate,
  { fetchImpl = fetch }: ResolveOptions = {},
): Promise<LookupResult> {
  let adult = false;
  let hijacked = false;
  // Wikimedia throttling or timing out is temporary: remember it, so the place is tried again soon.
  let retry = false;
  const failed = () => {
    retry = true;
    return null;
  };
  const fromCommons = async (file: string | null): Promise<PlaceImage | null> => {
    if (!file || isAdultPhotoName(file)) return null;
    const img = await commonsImage(file, { fetchImpl }).catch(failed);
    return img && { ...img, source: "commons" };
  };
  const ownWikidata = async () =>
    place.wikidata_id
      ? fromCommons(await wikidataImageFile(place.wikidata_id, fetchImpl).catch(failed))
      : null;
  const nearbyWikidata = async () =>
    fromCommons(await nearbyWikidataImageFile(place, { fetchImpl }).catch(failed));
  const website = async (): Promise<PlaceImage | null> => {
    if (!place.website) return null;
    // A plain bot user agent: the import contact address isn't for every restaurant's server.
    const found = await websiteImage(place.website, {
      fetchImpl,
      nightlife: place.category === "nightlife" || place.category === "bar",
    }).catch(() => null);
    if (found?.adult) adult = true;
    if (found?.hijacked) hijacked = true;
    return found?.image ? { ...found.image, source: "website" } : null;
  };

  const nearbyCommons = async () =>
    fromCommons(await nearbyCommonsFile(place, { fetchImpl }).catch(failed));

  const steps = WEBSITE_FIRST.has(place.category)
    ? [ownWikidata, website, nearbyWikidata, nearbyCommons]
    : [ownWikidata, nearbyWikidata, nearbyCommons, website];
  for (const step of steps) {
    const image = await step();
    if (adult) return { image: null, adult, retry: false };
    if (image) return { image, adult, retry: false, hijacked };
  }
  return { image: null, adult, retry, hijacked };
}

export type LookupResult = {
  image: PlaceImage | null;
  adult: boolean;
  retry?: boolean;
  /** The place's website is now gambling spam: its link is hidden (places.website_hijacked). */
  hijacked?: boolean;
};

type StoredImage = {
  image_url: string | null;
  image_source: "commons" | "website" | null;
  image_credit: string | null;
  image_page: string | null;
};

export function toPlaceImage(row: StoredImage): PlaceImage | null {
  return row.image_url && row.image_source
    ? {
        url: row.image_url,
        source: row.image_source,
        credit: row.image_credit ?? "",
        page: row.image_page ?? "",
      }
    : null;
}

/**
 * The place's photo, looking it up first if it never was (or the last look is over 30 days old).
 * Only one caller looks a place up at a time; the others get what is stored.
 */
export async function ensurePlaceImage(
  placeId: number,
  opts: ResolveOptions = {},
): Promise<{ image: PlaceImage | null; lookedUp: boolean; adult: boolean; hijacked: boolean }> {
  const claimed = await queryOne<Candidate>(
    `update places set image_checked_at = now()
     where id = $1 and not adult and not hidden
       and (image_checked_at is null or image_checked_at < now() - make_interval(days => $2))
     returning id, name, lat, lng, case when website_hijacked then null else website end as website,
               wikidata_id, category::text as category`,
    [placeId, IMAGE_TTL_DAYS],
  );
  if (!claimed) {
    const row = await queryOne<StoredImage>(
      "select image_url, image_source, image_credit, image_page from places where id = $1",
      [placeId],
    );
    return {
      image: row ? toPlaceImage(row) : null,
      lookedUp: false,
      adult: false,
      hijacked: false,
    };
  }
  const found = await findPlaceImage(claimed, opts);
  return {
    image: await savePlaceImage(claimed, found),
    lookedUp: true,
    adult: found.adult,
    hijacked: Boolean(found.hijacked),
  };
}

/**
 * Store a lookup result. A website image already used by a differently named place is a generic
 * banner (a city portal's share image on every park): it is dropped from all of them.
 */
export async function savePlaceImage(
  place: { id: number; name: string },
  { image, adult, retry, hijacked }: LookupResult,
): Promise<PlaceImage | null> {
  if (hijacked) await query("update places set website_hijacked = true where id = $1", [place.id]);
  if (adult) {
    // Its own website says it is an adult venue: flag it, which takes it off the site.
    await query(
      `update places set adult = true, image_url = null, image_source = null, image_credit = null,
              image_page = null, image_checked_at = now()
       where id = $1`,
      [place.id],
    );
    return null;
  }
  if (image?.source === "website") {
    const others = await query<{ id: number; name: string }>(
      "select id, name from places where image_url = $1 and id <> $2",
      [image.url, place.id],
    );
    if (others.some((o) => !namesMatch(o.name, place.name))) {
      await query(
        `update places set image_url = null, image_source = null, image_credit = null, image_page = null
         where image_url = $1`,
        [image.url],
      );
      image = null;
    }
  }
  await query(
    `update places set image_url = $2, image_source = $3, image_credit = $4, image_page = $5,
            -- a lookup cut short by throttling counts as a day-old check, so it runs again tomorrow
            image_checked_at = case when $6 then now() - make_interval(days => $7 - 1) else now() end
     where id = $1`,
    [
      place.id,
      image?.url ?? null,
      image?.source ?? null,
      image?.credit.slice(0, 200) ?? null,
      image?.page.slice(0, 1000) ?? null,
      !image && Boolean(retry),
      IMAGE_TTL_DAYS,
    ],
  );
  return image;
}
