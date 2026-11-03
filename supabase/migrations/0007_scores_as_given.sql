-- Scores show what people actually gave. A city's overall score becomes the plain average of its
-- ratings (each dimension's average, weighted as before: safety and cleanliness count 1.5x),
-- instead of being pulled toward a neutral 3.5 until it has many ratings. Places nobody has rated
-- show no score in the app (their estimate is only used to order lists).
--
-- city_stats.dimensions keeps each dimension's avg (shown) and score (the blended value, no longer
-- shown). local_overall / visitor_overall (0006) were already plain averages, so all three now
-- compare directly.

create or replace function refresh_city_stats(p_city_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_dims jsonb; v_count integer; v_raters integer;
  v_locals integer; v_visitors integer;
begin
  with per_dim as (
    select dimension, round(avg(stars), 2) as avg, count(*) as n,
           blend_score(avg(stars), count(*)::integer, 3.5) as score
    from city_ratings where city_id = p_city_id group by dimension
  )
  select coalesce(jsonb_object_agg(dimension, jsonb_build_object('avg', avg, 'count', n, 'score', score)), '{}'::jsonb)
    into v_dims
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
  values (p_city_id, v_dims, city_overall(p_city_id), coalesce(v_count, 0), coalesce(v_raters, 0),
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

revoke execute on function refresh_city_stats(bigint) from public, anon, authenticated;

-- Recompute every rated city with the new overall.
select refresh_city_stats(city_id) from city_stats;
