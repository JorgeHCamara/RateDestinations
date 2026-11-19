/**
 * Has a city's guide really changed? Shared by the import routes (via lib/import/revalidate.ts)
 * and the offline Overture job (scripts/import-overture.ts). Database only, no Next APIs.
 */
import { query, queryOne } from "@/lib/db";

/** "Can't tell": compares as changed, so the city's pages are expired as before. */
export const UNKNOWN_GUIDE = "unknown";

/**
 * Hash of what a city's guide shows (migration 0015); EMPTY_GUIDE means no listed places. Never
 * throws: without the migration it says UNKNOWN_GUIDE, so an import still runs.
 */
export async function guideHash(cityId: number): Promise<string> {
  try {
    const row = await queryOne<{ h: string }>("select city_guide_hash($1) as h", [cityId]);
    return row?.h ?? UNKNOWN_GUIDE;
  } catch {
    return UNKNOWN_GUIDE;
  }
}

/** md5 of the empty string: a city with no listed places. */
export const EMPTY_GUIDE = "d41d8cd98f00b204e9800998ecf8427e";

export type GuideChange = {
  /** Its city and category pages should show the new guide (city:<id>). */
  changed: boolean;
  /** It gained or lost its guide, so /cities and the sitemap list it differently. */
  directoryChanged: boolean;
};

export function compareGuides(before: string, after: string): GuideChange {
  if (before === UNKNOWN_GUIDE || after === UNKNOWN_GUIDE)
    return { changed: true, directoryChanged: false };
  const had = before !== "" && before !== EMPTY_GUIDE;
  const has = after !== "" && after !== EMPTY_GUIDE;
  return { changed: before !== after, directoryChanged: had !== has };
}

/** At most this often for the site-wide lists (city-directory, sitemap). */
export const DIRECTORY_INTERVAL_HOURS = 24;

/**
 * Record a directory change (if any) and say whether city-directory and sitemap are due: a change
 * is waiting and they weren't expired in the last 24 hours. A change made inside the window waits
 * for the next import after it. Atomic, so concurrent imports expire them once.
 */
export async function directoryTagsDue(directoryChanged: boolean): Promise<boolean> {
  try {
    return await claimDirectoryTags(directoryChanged);
  } catch {
    return false; // no site_state table yet (migration 0015): the lists refresh daily anyway
  }
}

async function claimDirectoryTags(directoryChanged: boolean): Promise<boolean> {
  if (directoryChanged)
    await queryOne(
      `insert into site_state (key, value, updated_at) values ('directory_dirty', 'true', now())
       on conflict (key) do update set value = 'true', updated_at = now()`,
    );
  const due = await queryOne<{ ok: boolean }>(
    `with dirty as (
       select 1 from site_state where key = 'directory_dirty' and value = 'true'
     ), claim as (
       insert into site_state (key, value, updated_at)
       select 'directory_revalidated_at', now()::text, now() from dirty
       on conflict (key) do update set value = excluded.value, updated_at = now()
         where site_state.updated_at < now() - make_interval(hours => $1)
       returning 1
     )
     select exists (select 1 from claim) as ok`,
    [DIRECTORY_INTERVAL_HOURS],
  );
  if (!due?.ok) return false;
  await queryOne(
    "update site_state set value = 'false', updated_at = now() where key = 'directory_dirty'",
  );
  return true;
}

/**
 * What each of a city's place pages shows that an import can change, one hash per place (adult and
 * hidden places included: hiding one changes its page). Null when it can't be read: then no
 * place page is expired and they refresh with their cache lifetime.
 */
export type PlaceHashes = Map<number, string>;

export async function placeHashes(cityId: number): Promise<PlaceHashes | null> {
  try {
    const rows = await query<{ id: number; h: string }>(
      `select id, md5(concat_ws('|', source, source_id, name, category, subcategory, address, website,
                phone, opening_hours, round(lat::numeric, 6), round(lng::numeric, 6), wikidata_id,
                wikipedia, tags::text, adult, hidden, website_hijacked, image_url, image_source,
                image_credit, image_page, image_checked_at is not null)) as h
       from places where city_id = $1`,
      [cityId],
    );
    return new Map(rows.map((r) => [Number(r.id), r.h]));
  } catch {
    return null;
  }
}

/**
 * Places whose page shows something different after an import: changed or removed (a removed
 * place's page must 404). New places have no cached page yet. Null when either side is unknown.
 */
export function changedPlaceIds(
  before: PlaceHashes | null,
  after: PlaceHashes | null,
): number[] | null {
  if (!before || !after) return null;
  const ids: number[] = [];
  for (const [id, h] of before) if (after.get(id) !== h) ids.push(id);
  return ids;
}
