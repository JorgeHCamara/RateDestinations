-- Imports now always finish (or record a failure) within 4 minutes, so a city still 'pending'
-- after 6 minutes was cut off and may be claimed again. A failed city may be retried after
-- 2 minutes, so a visitor's "Try again" works without hammering OpenStreetMap on every page view.
create or replace function claim_city_import(p_city_id bigint, stale_after interval default interval '90 days')
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed integer;
begin
  -- imported_at doubles as the claim time while pending
  update cities set import_status = 'pending', import_error = null, imported_at = now()
  where id = p_city_id
    and (
      import_status = 'none'
      or (import_status = 'failed' and coalesce(imported_at, created_at) < now() - interval '2 minutes')
      or (import_status = 'done' and imported_at < now() - stale_after)
      or (import_status = 'pending' and coalesce(imported_at, created_at) < now() - interval '6 minutes')
    );
  get diagnostics claimed = row_count;
  return claimed > 0;
end $$;

revoke execute on function claim_city_import(bigint, interval) from public, anon, authenticated;
