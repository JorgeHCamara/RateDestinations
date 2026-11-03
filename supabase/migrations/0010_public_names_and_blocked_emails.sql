-- Public names, and no ratings from throwaway email accounts.
--
-- 1. Names are chosen, never taken from an email. Accounts created with an email used the part
--    before the @ as their public name ("jorgehcamara"), shown on every review. New accounts get
--    a name only from their Google profile; the others choose one (the /welcome page, or "My
--    ratings"). Names that came from an email are cleared, and those people are asked again.
-- 2. A rating needs a public name, and an account whose email is from a throwaway service
--    (Mailinator, 10minutemail, …) can't rate. Both are checked by the trigger every rating
--    passes, so they hold however the database is reached (the site or Supabase's API).
-- blocked_email_domains is filled from src/data/disposable-email-domains.json by the scheduled
-- workflow (scripts/sync-blocked-email-domains.ts).

-- A public name: 2 to 40 characters with at least one letter, and no contact details (an email,
-- a web address, a phone number) or names that pass for the site. Same rules as
-- src/lib/public-name.ts.
create or replace function public_name_ok(n text)
returns boolean language sql immutable as $$
  select n is not null
     and char_length(btrim(n)) between 2 and 40
     and btrim(n) ~ '[^[:digit:][:punct:][:space:]]'
     and position('@' in n) = 0
     and n !~* '(https?:|www\.|\.(com|net|org|br|pt|io|co)\M)'
     and char_length(regexp_replace(n, '[^0-9]', '', 'g')) < 7
     and n !~* '\m(admin|moderator|ratedestinations|rate destinations|support)\M'
$$;

-- New accounts: the Google profile's name when it is a fine public name, otherwise none yet.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''));
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    case when public_name_ok(v_name) then left(v_name, 40) end,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Names that came from an email address are cleared.
update profiles p set display_name = null
from auth.users u
where u.id = p.id
  and p.display_name = split_part(u.email, '@', 1)
  and coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') is null;

-- Changing a name (from the site, or Supabase's API with the "own profile update" policy) must
-- follow the rules too.
create or replace function check_public_name()
returns trigger language plpgsql as $$
begin
  if new.display_name is distinct from old.display_name and new.display_name is not null then
    new.display_name := btrim(regexp_replace(new.display_name, '\s+', ' ', 'g'));
    if not public_name_ok(new.display_name) then
      raise exception 'invalid public name' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_check_public_name on profiles;
create trigger profiles_check_public_name before update on profiles
  for each row execute function check_public_name();

-- Throwaway email services.
create table if not exists blocked_email_domains (
  domain   text primary key,
  added_at timestamptz not null default now()
);
alter table blocked_email_domains enable row level security;
revoke all on blocked_email_domains from anon, authenticated;

-- True when the address's domain, or a parent of it (x.mailinator.com), is blocked.
create or replace function email_domain_blocked(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  with parts as (
    select string_to_array(lower(split_part(coalesce(p_email, ''), '@', 2)), '.') as arr
  )
  select exists (
    select 1
    from parts
    cross join generate_series(1, greatest(coalesce(array_length(arr, 1), 0) - 1, 0)) as i
    join blocked_email_domains b on b.domain = array_to_string(arr[i:array_length(arr, 1)], '.')
  )
$$;

-- Every rating passes here (place_ratings and city_ratings, before insert).
create or replace function enforce_rating_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recent integer;
begin
  if not exists (select 1 from profiles where id = new.user_id and display_name is not null) then
    raise exception 'public name required' using errcode = 'P0001';
  end if;
  if email_domain_blocked((select email from auth.users where id = new.user_id)) then
    raise exception 'email domain not allowed' using errcode = 'P0001';
  end if;
  select (select count(*) from place_ratings where user_id = new.user_id and created_at > now() - interval '24 hours')
       + (select count(*) from city_ratings  where user_id = new.user_id and created_at > now() - interval '24 hours')
    into v_recent;
  if v_recent >= 30 then
    raise exception 'rating limit reached: max 30 ratings per 24 hours' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function email_domain_blocked(text) from public, anon, authenticated;
revoke all on function check_public_name() from public, anon, authenticated;
