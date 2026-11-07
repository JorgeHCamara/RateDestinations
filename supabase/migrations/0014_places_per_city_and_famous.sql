-- 1. Each city has its own copy of its places.
--
-- A place belonged to one city only (unique by source + source_id), and a city build that
-- selected a place already stored under another city moved it over. Cities overlap: New York's
-- 14 km radius covers Manhattan, Brooklyn and Jersey City, which have guides of their own, so
-- building those took New York's parks (2 of 50 left), markets and beaches. Now a place is unique
-- per city: Central Park is in New York's guide and in Manhattan's.
--
-- 2. Famous places from Wikidata (src/lib/import/famous.ts) can be stored even when no other
-- source lists them: source 'wikidata', source_id the Wikidata item (Q160409).

alter type place_source add value if not exists 'wikidata';

alter table places drop constraint if exists places_source_source_id_key;
alter table places add constraint places_city_source_key unique (city_id, source, source_id);
-- Copies of one place across cities (photo and flag sharing, manual overrides).
create index if not exists places_source_idx on places (source, source_id);
