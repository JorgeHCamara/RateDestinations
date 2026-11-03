-- Overture Maps as a place source, built by a scheduled job (scripts/import-overture.ts).
alter type place_source add value if not exists 'overture';

-- requested_at: last time a visitor opened a city whose guide wasn't complete; the job builds
-- these first. overture_release: which Overture release the city was last built from, so a new
-- monthly release refreshes it.
alter table cities add column if not exists requested_at timestamptz;
alter table cities add column if not exists overture_release text;
alter table cities add column if not exists overture_imported_at timestamptz;
create index if not exists cities_requested_idx on cities (requested_at desc) where requested_at is not null;

-- Equally scored places (common before anyone has rated them) are listed nearest the city centre
-- first instead of alphabetically.
create or replace function city_top_places(p_city_id bigint, per_category integer default 6)
returns table (
  id bigint, name text, category place_category, subcategory text, lat double precision, lng double precision,
  website text, prominence integer, blended_score numeric, user_avg numeric, user_count integer,
  warning_count integer, rank integer
)
language sql stable as $$
  select * from (
    select p.id, p.name, p.category, p.subcategory, p.lat, p.lng, p.website, p.prominence,
           s.blended_score, s.user_avg, s.user_count, s.warning_count,
           row_number() over (
             partition by p.category
             order by s.blended_score desc, p.prominence desc, p.location <-> c.location, p.name
           )::integer as rank
    from places p
    join place_stats s on s.place_id = p.id
    join cities c on c.id = p.city_id
    where p.city_id = p_city_id
  ) ranked
  where rank <= greatest(1, least(per_category, 50))
  order by category, rank;
$$;
