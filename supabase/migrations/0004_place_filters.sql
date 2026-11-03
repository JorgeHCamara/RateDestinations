-- Place filters: +18 venues and junk entries are kept in the database but never listed.
--
--   adult  : strip clubs, brothels, swinger clubs, sex shops. Flagged by the importers (provider
--            category or words in the name, see src/lib/import/filters.ts) or by hand. Kept so a
--            dedicated section is possible later.
--   hidden : test and placeholder entries ("Test"), or anything removed by hand.
--
-- To flag a place by hand, run in the SQL Editor (the id is in the place's URL, /place/<id>):
--   select flag_adult_place(<id>, 'why');
--   select hide_place(<id>, 'why');
-- The flag is stored in place_overrides, so it survives every future re-import, and it also
-- covers the same place coming from another source under the same name in that city.

alter table places add column if not exists adult boolean not null default false;
alter table places add column if not exists hidden boolean not null default false;

-- Listing queries only ever read listed places.
create index if not exists places_listed_idx on places (city_id, category) where not adult and not hidden;

-- ---------------------------------------------------------------------------
-- Manual overrides, applied on every insert and update of a place
-- ---------------------------------------------------------------------------
create table if not exists place_overrides (
  id           bigint generated always as identity primary key,
  -- match one source record...
  source       place_source,
  source_id    text,
  -- ...or every place in a city (or anywhere, when city_id is null) whose lowercased name is LIKE this
  city_id      bigint references cities(id) on delete cascade,
  name_pattern text,
  adult        boolean,
  hidden       boolean,
  category     place_category,
  note         text,
  created_at   timestamptz not null default now(),
  check ((source is not null and source_id is not null) or name_pattern is not null)
);
create unique index if not exists place_overrides_source_idx on place_overrides (source, source_id)
  where source is not null and source_id is not null;

-- Not readable or writable through the public Data API: only the SQL Editor and the server.
alter table place_overrides enable row level security;
revoke all on place_overrides from anon, authenticated;

create or replace function apply_place_overrides()
returns trigger language plpgsql as $$
declare o record;
begin
  -- Name rules first, then exact source matches, so the most specific override wins.
  for o in
    select * from place_overrides
    where (source = new.source and source_id = new.source_id)
       or (name_pattern is not null
           and (city_id is null or city_id = new.city_id)
           and lower(new.name) like name_pattern)
    order by (source_id is not null), id
  loop
    if o.adult is not null then new.adult := o.adult; end if;
    if o.hidden is not null then new.hidden := o.hidden; end if;
    if o.category is not null then new.category := o.category; end if;
  end loop;
  return new;
end $$;

drop trigger if exists places_apply_overrides on places;
create trigger places_apply_overrides before insert or update on places
  for each row execute function apply_place_overrides();

-- A new or changed override applies to the places already stored (the update fires the trigger).
create or replace function reapply_place_overrides()
returns trigger language plpgsql as $$
begin
  update places p set updated_at = now()
  where (p.source = new.source and p.source_id = new.source_id)
     or (new.name_pattern is not null
         and (new.city_id is null or p.city_id = new.city_id)
         and lower(p.name) like new.name_pattern);
  return null;
end $$;

drop trigger if exists place_overrides_reapply on place_overrides;
create trigger place_overrides_reapply after insert or update on place_overrides
  for each row execute function reapply_place_overrides();

-- Helpers for the SQL Editor. Flag this record, and the same name in the same city from any source.
create or replace function flag_adult_place(p_place_id bigint, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare pl places%rowtype; n integer;
begin
  select * into pl from places where id = p_place_id;
  if not found then raise exception 'place % not found', p_place_id; end if;
  insert into place_overrides (source, source_id, adult, note)
  values (pl.source, pl.source_id, true, p_note)
  on conflict (source, source_id) where source is not null and source_id is not null
  do update set adult = true, note = coalesce(excluded.note, place_overrides.note);
  insert into place_overrides (city_id, name_pattern, adult, note)
  values (pl.city_id, replace(replace(lower(pl.name), '%', '\%'), '_', '\_'), true, p_note);
  select count(*) into n from places where city_id = pl.city_id and adult;
  return n;
end $$;

create or replace function hide_place(p_place_id bigint, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare pl places%rowtype; n integer;
begin
  select * into pl from places where id = p_place_id;
  if not found then raise exception 'place % not found', p_place_id; end if;
  insert into place_overrides (source, source_id, hidden, note)
  values (pl.source, pl.source_id, true, p_note)
  on conflict (source, source_id) where source is not null and source_id is not null
  do update set hidden = true, note = coalesce(excluded.note, place_overrides.note);
  select count(*) into n from places where city_id = pl.city_id and hidden;
  return n;
end $$;

-- Supabase exposes public functions over its Data API: these are for the SQL Editor only.
revoke all on function flag_adult_place(bigint, text) from public, anon, authenticated;
revoke all on function hide_place(bigint, text) from public, anon, authenticated;
revoke all on function apply_place_overrides() from public, anon, authenticated;
revoke all on function reapply_place_overrides() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Known cases
-- ---------------------------------------------------------------------------
-- Dama da Noite Club, São Paulo: a strip club that Overture files as a dance club.
insert into place_overrides (source, source_id, adult, note) values
  ('overture', 'e0404532-6f7b-4f2a-8593-ebfe219909fa', true, 'Dama da Noite Club, São Paulo: strip club'),
  ('overture', '1017029d-2491-49ca-8fb6-cfcea4abd29f', true, 'Dama da Noite, São Paulo: same venue name, nightlife'),
  ('overture', '6b8ab9bd-2678-40b3-9c71-efaf2796a295', true, 'Dama da Noite, São Paulo: same venue name, nightlife')
on conflict (source, source_id) where source is not null and source_id is not null do nothing;

insert into place_overrides (city_id, name_pattern, adult, note)
select c.id, '%dama da noite%', true, 'Dama da Noite Club, São Paulo, from any source'
from cities c
where c.geonames_id = 3448439 -- São Paulo
  and not exists (select 1 from place_overrides o where o.city_id = c.id and o.name_pattern = '%dama da noite%');

-- ---------------------------------------------------------------------------
-- Backfill places imported before this migration (the importers flag new ones themselves)
-- ---------------------------------------------------------------------------
-- +18 by the provider's category (Overture taxonomy kept in tags by newer builds, OSM tags)...
update places set adult = true
where not adult and (
  tags->>'overture_category' ~ '(adult_entertainment_venue|strip_club|erotic_massage_venue|adult_store)'
  or tags->>'amenity' in ('stripclub', 'brothel', 'swingerclub')
  or tags->>'shop' in ('erotic', 'sex')
  or subcategory ~* '(adult entertainment|strip club|erotic|adult store)'
);
-- ...or by words in the name (the same list as src/lib/import/filters.ts, abridged).
update places set adult = true
where not adult and (
  lower(unaccent(name)) ~ '(strip ?club|strip ?tease|strip show|club strip|gentlem[ae]n.?s club|lap ?dance|table dance|go ?go bar|peep show|sex ?shop|sex store|adult (store|shop|club|entertainment)|\merotic|\merotik|brothel|bordel|burdel|prostibulo|puticlub|swinger|casa de swing|clube de swing|glory ?hole|hostess club)'
  or (category in ('nightlife', 'bar') and lower(unaccent(name)) ~ '(\mtermas\M|\mprive\M|show ?girls)')
);

-- Test and placeholder names.
update places set hidden = true
where not hidden and (
  lower(trim(name)) ~ '^(test|tests|testing|teste|testes|prueba|essai|asdf|asd|qwerty|xxx|xx)( ?[0-9]+)?$'
  or lower(trim(name)) in ('test test', 'test place', 'test location', 'test business', 'test store',
                           'test shop', 'n/a', 'none', 'null', 'undefined', 'unknown', 'untitled',
                           'unnamed', 'no name', 'noname', 'sem nome', 'sin nombre', 'placeholder',
                           'sample', 'example', 'demo', 'dummy', 'fake', 'delete', 'deleted', 'closed',
                           'permanently closed', 'my business', 'my store', 'my shop', 'new business',
                           'business', 'store', 'shop', 'restaurant', 'bar', 'cafe', 'park')
  or name ~ '^[[:punct:][:space:]]*$' -- punctuation only (digits alone are real names: "1881")
);

-- ---------------------------------------------------------------------------
-- Listing functions skip adult and hidden places
-- ---------------------------------------------------------------------------
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
    where p.city_id = p_city_id and not p.adult and not p.hidden
  ) ranked
  where rank <= greatest(1, least(per_category, 50))
  order by category, rank;
$$;

create or replace function city_watch_out(p_city_id bigint, max_results integer default 12)
returns table (
  id bigint, name text, category place_category, lat double precision, lng double precision,
  blended_score numeric, user_avg numeric, user_count integer, warning_count integer, tag_counts jsonb
)
language sql stable as $$
  select p.id, p.name, p.category, p.lat, p.lng,
         s.blended_score, s.user_avg, s.user_count, s.warning_count, s.tag_counts
  from places p
  join place_stats s on s.place_id = p.id
  where p.city_id = p_city_id
    and not p.adult and not p.hidden
    and s.user_count > 0
    and (s.warning_count > 0 or s.user_avg <= 2.5)
  order by s.warning_count desc, s.user_avg asc, s.user_count desc
  limit greatest(1, least(max_results, 50));
$$;

create or replace function trending_cities(max_results integer default 12)
returns table (id bigint, name text, country_code char(2), country_name text, slug text, population integer,
               overall numeric, rating_count integer, place_count bigint)
language sql stable as $$
  select c.id, c.name, c.country_code, co.name, c.slug, c.population,
         cs.overall, coalesce(cs.rating_count, 0),
         (select count(*) from places p where p.city_id = c.id and not p.adult and not p.hidden)
  from cities c
  join countries co on co.code = c.country_code
  left join city_stats cs on cs.city_id = c.id
  where c.import_status = 'done'
  order by coalesce(cs.rating_count, 0) desc, c.population desc
  limit greatest(1, least(max_results, 50));
$$;

-- The public Data API doesn't serve them either.
drop policy if exists "public read" on places;
create policy "public read" on places for select using (not adult and not hidden);

-- Every city is rebuilt from Overture with the new rules on the next scheduled runs (the job
-- compares cities.overture_release with "<release>+p2"; nothing to do here).
