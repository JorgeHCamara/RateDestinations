-- Expire cached pages only when a guide really changed (see src/lib/import/revalidate.ts).
--
-- Guide pages are cached for days and refreshed by tags. Imports used to expire them, and the
-- site-wide /cities list and sitemap, on every rebuild, even when nothing changed; the Overture job
-- rebuilds hundreds of cities a run.

-- What a city's guide shows, as one hash: compared before and after an import.
create or replace function city_guide_hash(p_city_id bigint)
returns text language sql stable as $$
  select md5(coalesce(string_agg(
    concat_ws('|', source, source_id, name, category, subcategory, address, website,
              round(lat::numeric, 6), round(lng::numeric, 6), prominence, wikidata_id,
              image_url, image_source, image_checked_at is not null),
    E'\n' order by source, source_id), ''))
  from places
  where city_id = p_city_id and not adult and not hidden
$$;

alter table cities add column if not exists guide_hash text;
-- When the Overture job last tried this city: a build without Wikidata's famous places
-- ("~no-famous") is retried at most once a day, not every run.
alter table cities add column if not exists overture_attempted_at timestamptz;

-- Small key/value state for the import jobs: when city-directory and sitemap were last expired,
-- and whether a change is waiting (they are expired at most once a day).
create table if not exists site_state (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table site_state enable row level security;
revoke all on site_state from anon, authenticated;
revoke all on function city_guide_hash(bigint) from public, anon, authenticated;
