-- RateDestinations — initial schema
-- Target: Supabase Postgres (PostGIS, pg_trgm, unaccent available).
-- Also runs on a plain Postgres 16 + PostGIS for local development (see scripts/local-auth-shim.sql).

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type import_status as enum ('none', 'pending', 'done', 'failed');
create type place_source as enum ('osm', 'google');
create type place_category as enum (
  'restaurant', 'cafe', 'bar', 'nightlife', 'park', 'attraction',
  'museum', 'viewpoint', 'beach', 'market', 'shopping'
);
create type city_dimension as enum (
  'safety', 'cleanliness', 'food', 'sights', 'nature',
  'nightlife', 'transport', 'value', 'friendliness'
);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table countries (
  code       char(2) primary key,
  name       text not null,
  continent  text
);

create table cities (
  id             bigint generated always as identity primary key,
  geonames_id    integer not null unique,
  name           text not null,
  ascii_name     text not null,
  search_name    text not null,                 -- lower(ascii_name), indexed for trigram search
  alt_names      text[] not null default '{}',
  country_code   char(2) not null references countries(code),
  admin1         text,
  population     integer not null default 0,
  lat            double precision not null,
  lng            double precision not null,
  location       geography(point, 4326) generated always as
                   (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  slug           text not null,
  timezone       text,
  import_status  import_status not null default 'none',
  imported_at    timestamptz,
  import_error   text,
  created_at     timestamptz not null default now(),
  unique (country_code, slug)
);
create index cities_search_name_trgm_idx on cities using gin (search_name gin_trgm_ops);
create index cities_alt_names_idx on cities using gin (alt_names);
create index cities_population_idx on cities (population desc);
create index cities_location_idx on cities using gist (location);

-- ---------------------------------------------------------------------------
-- Places
-- ---------------------------------------------------------------------------
create table places (
  id                     bigint generated always as identity primary key,
  city_id                bigint not null references cities(id) on delete cascade,
  source                 place_source not null,
  source_id              text not null,
  name                   text not null,
  category               place_category not null,
  subcategory            text,
  lat                    double precision not null,
  lng                    double precision not null,
  location               geography(point, 4326) generated always as
                           (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  address                text,
  website                text,
  phone                  text,
  opening_hours          text,
  wikidata_id            text,
  wikipedia              text,
  prominence             integer not null default 0,     -- 0..100, see lib/import
  external_rating        numeric(3, 2),                   -- e.g. Google rating 1.00..5.00
  external_rating_count  integer,
  external_fetched_at    timestamptz,
  tags                   jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (source, source_id)
);
create index places_city_category_idx on places (city_id, category);
create index places_location_idx on places using gist (location);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Ratings
-- ---------------------------------------------------------------------------
create table place_ratings (
  id          bigint generated always as identity primary key,
  place_id    bigint not null references places(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  tags        text[] not null default '{}',
  comment     text check (comment is null or char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (place_id, user_id)
);
create index place_ratings_user_idx on place_ratings (user_id, created_at desc);

create table city_ratings (
  id          bigint generated always as identity primary key,
  city_id     bigint not null references cities(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  dimension   city_dimension not null,
  stars       smallint not null check (stars between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (city_id, user_id, dimension)
);
create index city_ratings_user_idx on city_ratings (user_id, created_at desc);

-- Allowed tags on a place rating. Warning tags feed the "Watch out" section.
create table rating_tags (
  tag         text primary key,
  label       text not null,
  is_warning  boolean not null default false
);
insert into rating_tags (tag, label, is_warning) values
  ('must_see',    'Must see',          false),
  ('great_value', 'Great value',       false),
  ('family',      'Family friendly',   false),
  ('local_gem',   'Local gem',         false),
  ('overpriced',  'Overpriced',        true),
  ('dirty',       'Dirty',             true),
  ('unsafe',      'Felt unsafe',       true),
  ('scam',        'Scam / tourist trap', true),
  ('crowded',     'Too crowded',       true),
  ('closed',      'Closed / gone',     true);

-- ---------------------------------------------------------------------------
-- Scoring (mirrors src/lib/scoring.ts — keep in sync)
-- ---------------------------------------------------------------------------
-- Bayesian blend: user weight grows with the number of ratings.
--   w = n / (n + K); score = w * user_avg + (1 - w) * prior
create or replace function blend_score(user_avg numeric, user_count integer, prior numeric)
returns numeric language sql immutable as $$
  select case
    when coalesce(user_count, 0) = 0 or user_avg is null then prior
    else round(((user_count::numeric / (user_count + 10)) * user_avg
              + (10::numeric / (user_count + 10)) * prior), 2)
  end
$$;

-- Prior for a place without platform ratings: the external rating if we have one,
-- otherwise 3.5 nudged up to 4.0 by prominence (0..100).
create or replace function place_prior(external_rating numeric, prominence integer)
returns numeric language sql immutable as $$
  select coalesce(external_rating, round(3.5 + least(greatest(prominence, 0), 100) / 200.0, 2))
$$;

-- ---------------------------------------------------------------------------
-- Stats tables (maintained by triggers)
-- ---------------------------------------------------------------------------
create table place_stats (
  place_id       bigint primary key references places(id) on delete cascade,
  user_avg       numeric(3, 2),
  user_count     integer not null default 0,
  warning_count  integer not null default 0,
  tag_counts     jsonb not null default '{}'::jsonb,
  blended_score  numeric(4, 2) not null,
  updated_at     timestamptz not null default now()
);
create index place_stats_score_idx on place_stats (blended_score desc);

create table city_stats (
  city_id       bigint primary key references cities(id) on delete cascade,
  dimensions    jsonb not null default '{}'::jsonb,  -- {dimension: {avg, count, score}}
  overall       numeric(4, 2),                        -- null until at least one rating
  rating_count  integer not null default 0,
  rater_count   integer not null default 0,
  updated_at    timestamptz not null default now()
);

create or replace function refresh_place_stats(p_place_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_avg numeric; v_count integer; v_warn integer; v_tags jsonb;
  v_ext numeric; v_prom integer;
begin
  select avg(stars), count(*) into v_avg, v_count from place_ratings where place_id = p_place_id;
  select count(*) into v_warn
    from place_ratings r
    where r.place_id = p_place_id
      and (r.stars <= 2 or exists (select 1 from unnest(r.tags) t join rating_tags rt on rt.tag = t where rt.is_warning));
  select coalesce(jsonb_object_agg(t, n), '{}'::jsonb) into v_tags
    from (select t, count(*) n from place_ratings r, unnest(r.tags) t where r.place_id = p_place_id group by t) s;
  select external_rating, prominence into v_ext, v_prom from places where id = p_place_id;

  insert into place_stats (place_id, user_avg, user_count, warning_count, tag_counts, blended_score, updated_at)
  values (p_place_id, round(v_avg, 2), coalesce(v_count, 0), coalesce(v_warn, 0), v_tags,
          blend_score(v_avg, v_count, place_prior(v_ext, v_prom)), now())
  on conflict (place_id) do update set
    user_avg = excluded.user_avg,
    user_count = excluded.user_count,
    warning_count = excluded.warning_count,
    tag_counts = excluded.tag_counts,
    blended_score = excluded.blended_score,
    updated_at = now();
end $$;

-- Dimension weights for the city "overall": the bad stuff weighs more, it's the product's edge.
create or replace function city_dimension_weight(d city_dimension)
returns numeric language sql immutable as $$
  select case d when 'safety' then 1.5 when 'cleanliness' then 1.5 else 1.0 end
$$;

create or replace function refresh_city_stats(p_city_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dims jsonb; v_overall numeric; v_count integer; v_raters integer;
begin
  with per_dim as (
    select dimension, round(avg(stars), 2) as avg, count(*) as n,
           blend_score(avg(stars), count(*)::integer, 3.5) as score
    from city_ratings where city_id = p_city_id group by dimension
  )
  select coalesce(jsonb_object_agg(dimension, jsonb_build_object('avg', avg, 'count', n, 'score', score)), '{}'::jsonb),
         case when count(*) = 0 then null
              else round(sum(score * city_dimension_weight(dimension)) / sum(city_dimension_weight(dimension)), 2) end
    into v_dims, v_overall
  from per_dim;

  select count(*), count(distinct user_id) into v_count, v_raters from city_ratings where city_id = p_city_id;

  insert into city_stats (city_id, dimensions, overall, rating_count, rater_count, updated_at)
  values (p_city_id, v_dims, v_overall, coalesce(v_count, 0), coalesce(v_raters, 0), now())
  on conflict (city_id) do update set
    dimensions = excluded.dimensions,
    overall = excluded.overall,
    rating_count = excluded.rating_count,
    rater_count = excluded.rater_count,
    updated_at = now();
end $$;

create or replace function place_ratings_changed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform refresh_place_stats(old.place_id); return old; end if;
  perform refresh_place_stats(new.place_id);
  return new;
end $$;
create trigger place_ratings_stats after insert or update or delete on place_ratings
  for each row execute function place_ratings_changed();

create or replace function city_ratings_changed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform refresh_city_stats(old.city_id); return old; end if;
  perform refresh_city_stats(new.city_id);
  return new;
end $$;
create trigger city_ratings_stats after insert or update or delete on city_ratings
  for each row execute function city_ratings_changed();

-- A new place (or a changed external rating / prominence) gets a stats row immediately
-- so ranking queries can always join place_stats.
create or replace function places_changed()
returns trigger language plpgsql as $$
begin
  perform refresh_place_stats(new.id);
  return new;
end $$;
create trigger places_stats after insert or update of external_rating, prominence on places
  for each row execute function places_changed();

-- updated_at bookkeeping
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger places_updated_at before update on places for each row execute function set_updated_at();
create trigger place_ratings_updated_at before update on place_ratings for each row execute function set_updated_at();
create trigger city_ratings_updated_at before update on city_ratings for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Abuse limits: max 30 new ratings per user per 24h, valid tags only
-- ---------------------------------------------------------------------------
create or replace function enforce_rating_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recent integer;
begin
  select (select count(*) from place_ratings where user_id = new.user_id and created_at > now() - interval '24 hours')
       + (select count(*) from city_ratings  where user_id = new.user_id and created_at > now() - interval '24 hours')
    into v_recent;
  if v_recent >= 30 then
    raise exception 'rating limit reached: max 30 ratings per 24 hours' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger place_ratings_limit before insert on place_ratings for each row execute function enforce_rating_limits();
create trigger city_ratings_limit before insert on city_ratings for each row execute function enforce_rating_limits();

create or replace function validate_rating_tags()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from unnest(new.tags) t where not exists (select 1 from rating_tags where tag = t)) then
    raise exception 'unknown rating tag' using errcode = '23514';
  end if;
  if array_length(new.tags, 1) > 5 then
    raise exception 'at most 5 tags per rating' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger place_ratings_tags before insert or update on place_ratings for each row execute function validate_rating_tags();

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
create or replace function search_cities(q text, max_results integer default 8)
returns table (
  id bigint, name text, country_code char(2), country_name text, admin1 text,
  population integer, slug text, score real
)
language plpgsql stable as $$
declare
  uq text := lower(unaccent(trim(q)));   -- computed once so the planner can use the indexes
begin
  if length(uq) < 2 then return; end if;
  return query
  select c.id, c.name, c.country_code, co.name as country_name, c.admin1, c.population, c.slug,
         (
           greatest(similarity(c.search_name, uq), word_similarity(uq, c.search_name))
           + case when c.search_name = uq then 1.0
                  when c.search_name like uq || '%' then 0.5
                  when c.alt_names @> array[uq] then 0.6
                  else 0 end
           + ln(greatest(c.population, 1000)) / 30.0
         )::real as score
  from cities c
  join countries co on co.code = c.country_code
  where c.search_name like uq || '%'
     or uq <% c.search_name
     or c.alt_names @> array[uq]
  order by score desc, c.population desc
  limit greatest(1, least(max_results, 25));
end $$;

-- ---------------------------------------------------------------------------
-- Guide queries
-- ---------------------------------------------------------------------------
-- Top N places per category for a city, ranked by blended score then prominence.
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
           row_number() over (partition by p.category order by s.blended_score desc, p.prominence desc, p.name)::integer as rank
    from places p
    join place_stats s on s.place_id = p.id
    where p.city_id = p_city_id
  ) ranked
  where rank <= greatest(1, least(per_category, 50))
  order by category, rank;
$$;

-- Places people warned about: low ratings or warning tags.
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
    and s.user_count > 0
    and (s.warning_count > 0 or s.user_avg <= 2.5)
  order by s.warning_count desc, s.user_avg asc, s.user_count desc
  limit greatest(1, least(max_results, 50));
$$;

-- Atomically claim a city for import. Returns true if the caller should run the import.
create or replace function claim_city_import(p_city_id bigint, stale_after interval default interval '90 days')
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed integer;
begin
  -- imported_at doubles as the claim time while pending, so a stuck claim expires after 15 minutes
  update cities set import_status = 'pending', import_error = null, imported_at = now()
  where id = p_city_id
    and (
      import_status in ('none', 'failed')
      or (import_status = 'done' and imported_at < now() - stale_after)
      or (import_status = 'pending' and coalesce(imported_at, created_at) < now() - interval '15 minutes')
    );
  get diagnostics claimed = row_count;
  return claimed > 0;
end $$;

-- Cities that have been visited (imported) ordered by community activity, for the home page.
create or replace function trending_cities(max_results integer default 12)
returns table (id bigint, name text, country_code char(2), country_name text, slug text, population integer,
               overall numeric, rating_count integer, place_count bigint)
language sql stable as $$
  select c.id, c.name, c.country_code, co.name, c.slug, c.population,
         cs.overall, coalesce(cs.rating_count, 0), (select count(*) from places p where p.city_id = c.id)
  from cities c
  join countries co on co.code = c.country_code
  left join city_stats cs on cs.city_id = c.id
  where c.import_status = 'done'
  order by coalesce(cs.rating_count, 0) desc, c.population desc
  limit greatest(1, least(max_results, 50));
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table countries      enable row level security;
alter table cities         enable row level security;
alter table places         enable row level security;
alter table profiles       enable row level security;
alter table place_ratings  enable row level security;
alter table city_ratings   enable row level security;
alter table rating_tags    enable row level security;
alter table place_stats    enable row level security;
alter table city_stats     enable row level security;

-- Everything is publicly readable. Writes to catalog tables happen with the service role only.
create policy "public read" on countries     for select using (true);
create policy "public read" on cities        for select using (true);
create policy "public read" on places        for select using (true);
create policy "public read" on profiles      for select using (true);
create policy "public read" on rating_tags   for select using (true);
create policy "public read" on place_stats   for select using (true);
create policy "public read" on city_stats    for select using (true);
create policy "public read" on place_ratings for select using (true);
create policy "public read" on city_ratings  for select using (true);

create policy "own profile update" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "own place rating insert" on place_ratings for insert with check (auth.uid() = user_id);
create policy "own place rating update" on place_ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own place rating delete" on place_ratings for delete using (auth.uid() = user_id);

create policy "own city rating insert" on city_ratings for insert with check (auth.uid() = user_id);
create policy "own city rating update" on city_ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own city rating delete" on city_ratings for delete using (auth.uid() = user_id);

-- Keep the triggers' security-definer functions out of reach of the API surface.
revoke execute on function refresh_place_stats(bigint) from public, anon, authenticated;
revoke execute on function refresh_city_stats(bigint) from public, anon, authenticated;
revoke execute on function claim_city_import(bigint, interval) from public, anon, authenticated;
