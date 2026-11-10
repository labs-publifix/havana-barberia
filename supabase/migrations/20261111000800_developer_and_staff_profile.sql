-- 1) Developer role: the same access as the owner (to verify every module with a
--    real account). The shop still needs at least one active owner.
-- 2) Barbers managed from the panel: a public bio for the site, and a private
--    e-mail where each barber receives notices of their appointments.

-- ── Developer ────────────────────────────────────────────────────────────
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'developer', 'manager', 'reception', 'barber'));

create or replace function app.is_owner() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('owner', 'developer'), false) $$;

create or replace function app.is_finance() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('owner', 'developer', 'manager'), false) $$;

create or replace function app.is_desk() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('owner', 'developer', 'manager', 'reception'), false) $$;

grant execute on function app.is_owner() to anon, authenticated;

drop policy profiles_owner on public.profiles;
create policy profiles_owner on public.profiles for all to authenticated
  using (app.is_owner()) with check (app.is_owner());

drop policy audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (app.is_owner());

-- ── Barber profile ───────────────────────────────────────────────────────
-- Shown on the site under the name (the title is the role, e.g. "Barbero senior").
alter table public.staff add column bio text not null default '' check (length(bio) <= 280);

-- Private: only owner, developer and manager see or change it (never the site).
create table public.staff_contacts (
  staff_id text primary key references public.staff (id) on delete cascade,
  email text not null default '' check (email = '' or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  updated_at timestamptz not null default now()
);
alter table public.staff_contacts enable row level security;
create policy staff_contacts_all on public.staff_contacts for all to authenticated
  using (app.is_finance()) with check (app.is_finance());
revoke all on public.staff_contacts from anon;
grant select, insert, update, delete on public.staff_contacts to authenticated;
