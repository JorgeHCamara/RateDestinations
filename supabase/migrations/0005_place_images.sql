-- One photo per place, for the hover preview and the place page (src/lib/images).
--   image_source  'commons': a Wikimedia Commons photo of the place's Wikidata item (openly licensed)
--                 'website': the share image (og:image) the place's own website publishes
--   image_credit  shown on the photo: author and licence, or the website's name
--   image_page    where the credit links: the Commons file page, or the website
--   image_checked_at  when we last looked; null means never (looked up on first hover, or by the
--                 scheduled job for places shown in a guide). Looked up again after 30 days.
alter table places add column if not exists image_url text;
alter table places add column if not exists image_source text check (image_source in ('commons', 'website'));
alter table places add column if not exists image_credit text;
alter table places add column if not exists image_page text;
alter table places add column if not exists image_checked_at timestamptz;

-- The same website image on places with different names is a generic banner, not a photo of
-- either place; this index makes that check cheap.
create index if not exists places_image_url_idx on places (image_url) where image_url is not null;
