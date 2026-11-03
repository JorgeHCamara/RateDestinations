-- Locals and visitors. Whoever rates a city says whether they live there or are visiting (or
-- visited). The city page shows how the raters split, and how each group scores the city, so
-- people can see whether a city is loved more by the people who live in it or by those passing
-- through.

do $$ begin
  create type rater_role as enum ('local', 'visitor');
exception when duplicate_object then null; end $$;

-- One answer per person per city (it applies to all of that person's ratings of the city).
create table if not exists city_raters (
  city_id     bigint not null references cities(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        rater_role not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (city_id, user_id)
);
create index if not exists city_raters_user_idx on city_raters (user_id);

drop trigger if exists city_raters_updated_at on city_raters;
create trigger city_raters_updated_at before update on city_raters
  for each row execute function set_updated_at();

alter table city_raters enable row level security;
drop policy if exists "public read" on city_raters;
create policy "public read" on city_raters for select using (true);
drop policy if exists "own insert" on city_raters;
create policy "own insert" on city_raters for insert with check (auth.uid() = user_id);
drop policy if exists "own update" on city_raters;
create policy "own update" on city_raters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own delete" on city_raters;
create policy "own delete" on city_raters for delete using (auth.uid() = user_id);

-- Per-group numbers, kept with the other city stats.
--   local_count / visitor_count : people with ratings of the city who said local / visitor
--   local_overall / visitor_overall : that group's own average for the city (1–5), weighted by
--     dimension like `overall` but not pulled toward the neutral starting score: `overall` is
--     blended to stay steady with few ratings, which would make a small group look worse than a
--     big one that rated lower. These answer "who likes it more", so they are plain averages.
alter table city_stats add column if not exists local_count integer not null default 0;
alter table city_stats add column if not exists visitor_count integer not null default 0;
alter table city_stats add column if not exists local_overall numeric(4, 2);
alter table city_stats add column if not exists visitor_overall numeric(4, 2);

-- A group's own average for a city: per-dimension averages, combined with the dimension weights
-- (null role: everyone).
create or replace function city_overall(p_city_id bigint, p_role rater_role default null)
returns numeric language sql stable security definer set search_path = public as $$
  with per_dim as (
    select r.dimension, avg(r.stars) as score
    from city_ratings r
    left join city_raters cr on cr.city_id = r.city_id and cr.user_id = r.user_id
    where r.city_id = p_city_id and (p_role is null or cr.role = p_role)
    group by r.dimension
  )
  select case when count(*) = 0 then null
              else round(sum(score * city_dimension_weight(dimension)) / sum(city_dimension_weight(dimension)), 2) end
  from per_dim;
$$;

create or replace function refresh_city_stats(p_city_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dims jsonb; v_overall numeric; v_count integer; v_raters integer;
  v_locals integer; v_visitors integer;
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

  -- Only people who still have ratings of the city count.
  select count(*) filter (where cr.role = 'local'), count(*) filter (where cr.role = 'visitor')
    into v_locals, v_visitors
  from city_raters cr
  where cr.city_id = p_city_id
    and exists (select 1 from city_ratings r where r.city_id = cr.city_id and r.user_id = cr.user_id);

  insert into city_stats (city_id, dimensions, overall, rating_count, rater_count,
                          local_count, visitor_count, local_overall, visitor_overall, updated_at)
  values (p_city_id, v_dims, v_overall, coalesce(v_count, 0), coalesce(v_raters, 0),
          coalesce(v_locals, 0), coalesce(v_visitors, 0),
          case when v_locals > 0 then city_overall(p_city_id, 'local') end,
          case when v_visitors > 0 then city_overall(p_city_id, 'visitor') end,
          now())
  on conflict (city_id) do update set
    dimensions = excluded.dimensions,
    overall = excluded.overall,
    rating_count = excluded.rating_count,
    rater_count = excluded.rater_count,
    local_count = excluded.local_count,
    visitor_count = excluded.visitor_count,
    local_overall = excluded.local_overall,
    visitor_overall = excluded.visitor_overall,
    updated_at = now();
end $$;

-- Saying (or changing) local / visitor updates the city's numbers too.
create or replace function city_raters_changed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform refresh_city_stats(old.city_id); return old; end if;
  perform refresh_city_stats(new.city_id);
  return new;
end $$;
drop trigger if exists city_raters_stats on city_raters;
create trigger city_raters_stats after insert or update or delete on city_raters
  for each row execute function city_raters_changed();

revoke execute on function city_overall(bigint, rater_role) from public, anon, authenticated;
revoke execute on function refresh_city_stats(bigint) from public, anon, authenticated;

-- Fill the new columns for cities already rated.
select refresh_city_stats(city_id) from city_stats;
