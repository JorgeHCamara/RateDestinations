-- Daily rating limit by city, not by rating.
--
-- The old cap was 30 ratings per 24 hours, but rating one city is up to 9 ratings (one per
-- category: safety, food, …), so three cities and a few places used it up. Now:
--   * up to 10 different cities per 24 hours. Rating a city, or any place in it, counts as that
--     city once; within those cities, rate as much as you like.
--   * a backstop of 100 place ratings per 24 hours, so a script can't rate hundreds of places in
--     one city. A person rating their home town won't come near it.
-- Changing a rating you already gave is never counted (this only runs on new ratings).
-- The public name and throwaway-email checks are the same as in migration 0010.

create or replace function enforce_rating_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_city   bigint;
  v_cities integer;
  v_places integer;
begin
  if not exists (select 1 from profiles where id = new.user_id and display_name is not null) then
    raise exception 'public name required' using errcode = 'P0001';
  end if;
  if email_domain_blocked((select email from auth.users where id = new.user_id)) then
    raise exception 'email domain not allowed' using errcode = 'P0001';
  end if;

  -- The city this rating is about (separate statements: each table has only its own column).
  if tg_table_name = 'place_ratings' then
    select city_id into v_city from places where id = new.place_id;
  else
    v_city := new.city_id;
  end if;

  -- Other cities this person rated (a city, or a place in it) in the last 24 hours.
  select count(distinct c) into v_cities
  from (
    select p.city_id as c
    from place_ratings r join places p on p.id = r.place_id
    where r.user_id = new.user_id and r.created_at > now() - interval '24 hours'
    union
    select city_id
    from city_ratings
    where user_id = new.user_id and created_at > now() - interval '24 hours'
  ) rated
  where c is distinct from v_city;
  if v_cities >= 10 then
    raise exception 'rating limit reached: max 10 cities per 24 hours' using errcode = 'P0001';
  end if;

  if tg_table_name = 'place_ratings' then
    select count(*) into v_places
    from place_ratings
    where user_id = new.user_id and created_at > now() - interval '24 hours';
    if v_places >= 100 then
      raise exception 'rating limit reached: max 100 places per 24 hours' using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;
