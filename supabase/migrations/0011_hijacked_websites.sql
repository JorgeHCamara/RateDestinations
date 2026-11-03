-- Hijacked websites: a place's website that now serves gambling spam.
--
-- When a small business lets its domain lapse, spammers often buy it and fill it with online
-- gambling pages ("RTP slot gacor", "togel", casino affiliate posts). The photo finder took a
-- picture from such a page for Chun Yang Tea Tribeca in New York (chunyangtea.com now redirects
-- to an Indonesian slot-gambling page), and the place page linked to it.
--
-- website_hijacked hides the link and stops photos being taken from the site
-- (src/lib/import/filters.ts isGamblingSpam). It resets by itself when the place's website changes.

alter table places add column if not exists website_hijacked boolean not null default false;

create or replace function reset_website_hijacked()
returns trigger language plpgsql as $$
begin
  if new.website is distinct from old.website then
    new.website_hijacked := false;
  end if;
  return new;
end $$;
drop trigger if exists places_reset_website_hijacked on places;
create trigger places_reset_website_hijacked before update of website on places
  for each row execute function reset_website_hijacked();

-- 1. Photos whose file name gives the spam away ("rtp-slot-coy99.webp", "tips-main-togel-macau"):
--    drop the photo and hide the website, then look again (Wikimedia may have a real photo).
--    Same words as isGamblingSpam.
update places
set website_hijacked = true,
    image_url = null, image_source = null, image_credit = null, image_page = null,
    image_checked_at = null
where image_source = 'website'
  and lower(regexp_replace(image_url, '[^A-Za-z0-9]+', ' ', 'g')) ~
      '(gacor|togel|judi ?(online|bola|slot|togel)|maxwin|sbobet|nenekslot|slot ?(88|777|online|resmi|demo|thailand|terpercaya)|\mrtp ?(slot|live)\M|situs ?(slot|judi|togel)|bandar ?(slot|judi|togel|bola)|bocoran ?rtp|scatter ?hitam|mahjong ?ways|link ?alternatif|casino ?(online|official|login|bonus|apk|app)\M|online ?casino)';

-- 2. Photos taken from a different site than the place's own: its website redirected elsewhere
--    (image_credit is the site the photo was found on). Usually harmless (brand.com → brand.co.uk),
--    sometimes a hijack: drop the photo and look again, with the spam check.
with hosts as (
  select id,
         lower(regexp_replace(substring(website from '^[a-zA-Z]+://([^/:?#]+)'), '^www\.', '')) as site,
         lower(regexp_replace(image_credit, '^www\.', '')) as found_on
  from places
  where image_source = 'website' and website is not null and image_credit is not null
)
update places p
set image_url = null, image_source = null, image_credit = null, image_page = null,
    image_checked_at = null
from hosts h
where p.id = h.id
  and h.site is not null
  and h.found_on <> h.site
  and h.found_on not like '%.' || h.site
  and h.site not like '%.' || h.found_on;

-- Hand-checked: chunyangtea.com redirects to an Indonesian slot-gambling page (November 2026).
update places set website_hijacked = true
where website ~* '^https?://(www\.)?chunyangtea\.com';
