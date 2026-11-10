-- Entrega 4: e-mails to customers and the team, reminders, and photos in Storage.
--
-- E-mails go through an outbox: triggers on appointments and a reminder job add
-- rows, and the Edge Function `send-emails` sends them with Resend (blind copy to
-- EMAIL_BCC). The function is woken every minute by pg_cron (via pg_net) while
-- there is something to send. Until the shop turns on "Enviar correos a clientes"
-- (settings.customer_emails), every e-mail goes only to the review copy.

-- ── Test mode switch ───────────────────────────────────────────────────────
alter table public.settings add column customer_emails boolean not null default false;

-- ── Outbox ─────────────────────────────────────────────────────────────────
create table public.email_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in (
    'confirmation', 'reschedule', 'cancellation', 'reminder_24h', 'reminder_2h', 'team_new', 'team_cancel'
  )),
  appointment_id text not null references public.appointments (id) on delete cascade,
  -- One e-mail per event: e.g. a reminder per appointment and start time.
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  to_email text,
  subject text,
  error text,
  created_at timestamptz not null default now()
);
create index email_outbox_pending on public.email_outbox (id) where status in ('pending', 'sending');

alter table public.email_outbox enable row level security;
-- Owner and manager see what was sent (Ajustes › Correos); nobody writes from the browser.
create policy email_outbox_read on public.email_outbox for select to authenticated using (app.is_finance());
revoke all on public.email_outbox from anon;
revoke insert, update, delete on public.email_outbox from authenticated;
grant select on public.email_outbox to authenticated;

create or replace function app.queue_email(p_kind text, p_appointment text, p_key text) returns void
language sql security definer set search_path = public as $$
  insert into public.email_outbox (kind, appointment_id, dedupe_key)
  values (p_kind, p_appointment, p_key)
  on conflict (dedupe_key) do nothing
$$;
revoke all on function app.queue_email(text, text, text) from public, anon, authenticated;

-- Confirmation on booking, notice on change and cancellation. Walk-ins are in
-- the shop already: no e-mail. The barber hears about online bookings.
create or replace function app.appointment_emails() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  active_before boolean := tg_op = 'UPDATE' and old.status in ('booked', 'confirmed');
  active_now boolean := new.status in ('booked', 'confirmed');
  at text := extract(epoch from new.starts_at)::bigint::text;
begin
  if new.source = 'walk_in' then return null; end if;
  if tg_op = 'INSERT' then
    if active_now then
      perform app.queue_email('confirmation', new.id, 'confirmation:' || new.id);
      if new.source = 'online' then perform app.queue_email('team_new', new.id, 'team_new:' || new.id); end if;
    end if;
  elsif active_before and new.status = 'cancelled' then
    perform app.queue_email('cancellation', new.id, 'cancellation:' || new.id);
    if new.source = 'online' then perform app.queue_email('team_cancel', new.id, 'team_cancel:' || new.id); end if;
  elsif active_before and active_now and (new.starts_at <> old.starts_at or new.staff_id <> old.staff_id) then
    perform app.queue_email('reschedule', new.id, 'reschedule:' || new.id || ':' || at || ':' || new.staff_id);
  end if;
  return null;
end $$;

create trigger appointments_emails
after insert or update of status, starts_at, staff_id on public.appointments
for each row execute function app.appointment_emails();

-- Reminders: the day before (if booked more than a day ahead) and two hours
-- before (if booked more than three hours ahead). A new time gets new reminders.
create or replace function app.queue_reminders() returns void
language sql security definer set search_path = public as $$
  insert into public.email_outbox (kind, appointment_id, dedupe_key)
  select r.kind, a.id, r.kind || ':' || a.id || ':' || extract(epoch from a.starts_at)::bigint
  from public.appointments a
  cross join lateral (values
    ('reminder_24h', interval '24 hours', interval '3 hours', interval '20 hours'),
    ('reminder_2h', interval '2 hours', interval '0 minutes', interval '3 hours')
  ) as r (kind, ahead, at_least, booked_ahead)
  where a.status in ('booked', 'confirmed')
    and a.source <> 'walk_in'
    and a.starts_at <= now() + r.ahead
    and a.starts_at > now() + r.at_least
    and a.created_at < a.starts_at - r.booked_ahead
  on conflict (dedupe_key) do nothing
$$;
revoke all on function app.queue_reminders() from public, anon, authenticated;

-- ── What the sender (Edge Function, service role) calls ───────────────────
-- Takes a batch to send; rows stuck in "sending" for 10 minutes are retried.
create or replace function public.claim_emails(p_limit int default 20) returns setof public.email_outbox
language sql security definer set search_path = public as $$
  update public.email_outbox o
  set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from public.email_outbox
    where status = 'pending' or (status = 'sending' and claimed_at < now() - interval '10 minutes')
    order by id
    limit p_limit
    for update skip locked
  )
  returning o.*
$$;
revoke all on function public.claim_emails(int) from public, anon, authenticated;
grant execute on function public.claim_emails(int) to service_role;

-- ── Wake-up: pg_cron every minute calls the Edge Function while there is mail ─
-- URL and shared secret are written by the deploy workflow (rotated on every
-- deploy). This schema is not exposed by the API and the table has no grants.
create table app.mailer_config (
  id int primary key default 1 check (id = 1),
  url text not null,
  secret text not null,
  updated_at timestamptz not null default now()
);
revoke all on app.mailer_config from public, anon, authenticated;

create or replace function app.mailer_tick() returns void
language plpgsql security definer set search_path = public, app as $$
declare c app.mailer_config;
begin
  perform app.queue_reminders();
  if not exists (
    select 1 from public.email_outbox
    where status = 'pending' or (status = 'sending' and claimed_at < now() - interval '10 minutes')
  ) then
    return;
  end if;
  select * into c from app.mailer_config where id = 1;
  if c.url is null or to_regnamespace('net') is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2)'
  using c.url, jsonb_build_object('Content-Type', 'application/json', 'x-mailer-secret', c.secret);
end $$;
revoke all on function app.mailer_tick() from public, anon, authenticated;

-- pg_cron and pg_net exist in Supabase; the local test database may not have them.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $q$select cron.schedule('havana-mailer', '* * * * *', 'select app.mailer_tick()')$q$;
  end if;
end $$;

-- ── Photos (products and barbers) in Storage ──────────────────────────────
-- Public bucket: anyone can see a photo by its URL; only owner and manager upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_update on storage.objects;
drop policy if exists photos_delete on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and app.is_finance());
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and app.is_finance()) with check (bucket_id = 'photos' and app.is_finance());
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and app.is_finance());
