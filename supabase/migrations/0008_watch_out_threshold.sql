-- Watch out lists places people warn about, but one bad rating is no longer enough.
--
-- A warning is a rating of 1-2 stars or one with a warning tag (dirty, unsafe, scam, overpriced,
-- tourist trap…); each person rates a place once, so warnings count people. A place is listed
-- when:
--   * at least 2 different people warned about it, and
--   * those warnings are at least a third of its ratings, so a well-loved place with a couple of
--     complaints stays out.
-- Most warnings first, then the highest share of warnings, then the lowest average.
-- The same thresholds are in src/lib/watch-out.ts (shown to people); keep them in step.

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
    and s.warning_count >= 2
    and s.warning_count * 3 >= s.user_count
  order by s.warning_count desc,
           s.warning_count::numeric / greatest(s.user_count, 1) desc,
           s.user_avg asc nulls last
  limit greatest(1, least(max_results, 50));
$$;
