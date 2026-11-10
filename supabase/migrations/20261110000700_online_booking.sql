-- Entrega 3: online booking. The site reads busy times through busy_slots and
-- books, cancels or reschedules through the Edge Function `booking` (service
-- role), which checks Turnstile, limits requests per IP and applies the same
-- availability rules as the site.

-- Busy times with the appointment id, so a reschedule can leave its own time out.
create or replace function public.busy_slots(from_at timestamptz, to_at timestamptz)
returns table (id text, staff_id text, starts_at timestamptz, ends_at timestamptz, is_block boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.staff_id, a.starts_at, a.ends_at, false from public.appointments a
  where a.status in ('booked', 'confirmed', 'completed') and a.starts_at < to_at and a.ends_at > from_at
  union all
  select b.id, b.staff_id, b.starts_at, b.ends_at, true from public.time_blocks b
  where b.starts_at < to_at and b.ends_at > from_at
$$;
revoke all on function public.busy_slots(timestamptz, timestamptz) from public;
grant execute on function public.busy_slots(timestamptz, timestamptz) to anon, authenticated;

-- ── Requests per IP (the Edge Function asks before doing anything) ───────────
create table app.rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index rate_hits_key_at on app.rate_hits (key, at);
revoke all on app.rate_hits from public, anon, authenticated;

-- true and counts the request when `key` made fewer than p_max in the window.
create or replace function public.rate_limit(p_key text, p_max int, p_window_sec int) returns boolean
language plpgsql security definer set search_path = public, app as $$
begin
  -- Old entries go away now and then (about 1 call in 50).
  if random() < 0.02 then delete from app.rate_hits where at < now() - interval '1 day'; end if;
  if (select count(*) from app.rate_hits where key = p_key and at > now() - make_interval(secs => p_window_sec)) >= p_max then
    return false;
  end if;
  insert into app.rate_hits (key) values (p_key);
  return true;
end $$;
revoke all on function public.rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit(text, int, int) to service_role;
