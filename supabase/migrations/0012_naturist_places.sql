-- Nude and naturist places are +18, like strip clubs: kept in the database with adult = true and
-- never listed (see migration 0004). Hanlan's Point Nude Beach, Toronto (OpenStreetMap tags it
-- nudism=designated) was listed as a beach, with a Wikimedia photo of the nude beach.
--
-- The importers flag new ones themselves (src/lib/import/filters.ts: isAdultOsm, hasAdultName);
-- this flags the ones already imported, and drops photos whose file names show nudity from any
-- other place (a family beach next to a nude one), so they are looked up again.

-- By OpenStreetMap tags...
update places set adult = true
where not adult and (
  tags->>'nudism' in ('yes', 'designated', 'customary', 'obligatory')
  or tags->>'naturism' = 'yes'
  or tags->>'club' in ('naturism', 'naturist')
);

-- ...or by words in the name (the same words as filters.ts). Not "naturista": in Spanish and
-- Portuguese that is mostly a health-food shop.
update places set adult = true
where not adult
  and lower(unaccent(name)) ~
      '\m(nude beach|nudists?|nudism|nudismo|nudistas?|naturists?|naturism|naturistes?|naturisme|fkk|clothing.optional)\M';

-- Photos whose file names show nudity, on places still listed: drop them and look again.
update places
set image_url = null, image_source = null, image_credit = null, image_page = null,
    image_checked_at = null
where not adult
  and image_url is not null
  and lower(regexp_replace(image_url, '[^A-Za-z0-9]+', ' ', 'g')) ~
      '\m(nude|nudes|nudity|naked|topless|nudists?|nudism|naturists?|naturism|fkk)\M';
