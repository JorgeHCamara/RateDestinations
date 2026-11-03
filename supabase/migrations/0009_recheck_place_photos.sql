-- Photo lookups now also read a place website's structured data and large page photos, search
-- Wikimedia Commons for photos taken near the place, and skip government portals
-- (src/lib/images). Places that came up empty are looked up again: by the scheduled workflow for
-- the places guides show first, and when someone views them.
update places set image_checked_at = null
where image_url is null and image_checked_at is not null;
