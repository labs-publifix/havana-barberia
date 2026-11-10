-- Subscribed calendars: each panel user gets a private link (token) that a phone
-- calendar (iPhone, Google) subscribes to. The Edge Function `calendar` serves
-- the appointments as .ics. Scope: one barber (staff_id) or the whole shop (null).
-- Barbers only get their own; desk roles (owner, developer, manager, reception) any.

create table public.calendar_feeds (
  token text primary key default encode(gen_random_bytes(24), 'hex'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  staff_id text references public.staff (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index calendar_feeds_one_per_scope on public.calendar_feeds (profile_id, coalesce(staff_id, '*'));
alter table public.calendar_feeds enable row level security;
-- No policies: only the functions below and the Edge Function (service role) touch it.
revoke all on public.calendar_feeds from anon, authenticated;

-- The caller's link for a calendar (created the first time). p_reset gives a new
-- link and the old one stops working (if it was shared by mistake).
create or replace function public.calendar_feed(p_staff_id text, p_reset boolean default false) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  me uuid := auth.uid();
  t text;
begin
  if app.my_role() is null then raise exception 'Inicia sesión de nuevo.'; end if;
  if p_staff_id is null and not app.is_desk() then
    raise exception 'Tu rol solo puede conectar su propia agenda.';
  end if;
  if p_staff_id is not null and not app.is_desk() and p_staff_id is distinct from app.my_staff_id() then
    raise exception 'Tu rol solo puede conectar su propia agenda.';
  end if;
  if p_staff_id is not null and not exists (select 1 from public.staff where id = p_staff_id) then
    raise exception 'No encontramos ese barbero.';
  end if;
  if p_reset then
    delete from public.calendar_feeds where profile_id = me and coalesce(staff_id, '*') = coalesce(p_staff_id, '*');
  end if;
  select token into t from public.calendar_feeds where profile_id = me and coalesce(staff_id, '*') = coalesce(p_staff_id, '*');
  if t is null then
    insert into public.calendar_feeds (profile_id, staff_id) values (me, p_staff_id) returning token into t;
  end if;
  return t;
end $$;
revoke all on function public.calendar_feed(text, boolean) from public, anon;
grant execute on function public.calendar_feed(text, boolean) to authenticated;
