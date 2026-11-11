-- Clientes › Por recuperar: invite customers who haven't come back in a while
-- (or imported customers who haven't visited since the new system) by e-mail or
-- WhatsApp. E-mail invitations have a daily cap (Resend's free plan allows 100
-- e-mails a day, appointment e-mails included) and each customer is invited at
-- most once every 30 days. Customers can opt out from a link in the e-mail.

alter table public.settings
  add column winback_days int not null default 40 check (winback_days between 15 and 180),
  add column invite_daily_limit int not null default 30 check (invite_daily_limit between 1 and 90);

alter table public.customers
  add column marketing_opt_out boolean not null default false,
  add column optout_token text unique default encode(gen_random_bytes(12), 'hex');
update public.customers set optout_token = encode(gen_random_bytes(12), 'hex') where optout_token is null;
alter table public.customers alter column optout_token set not null;

-- Who was invited, how and when (e-mail and WhatsApp).
create table public.customer_invites (
  id bigint generated always as identity primary key,
  customer_id text not null references public.customers (id) on delete cascade,
  kind text not null check (kind in ('winback', 'new_system')),
  channel text not null check (channel in ('email', 'whatsapp')),
  at timestamptz not null default now(),
  by_name text not null default ''
);
create index customer_invites_customer on public.customer_invites (customer_id, at desc);
create index customer_invites_at on public.customer_invites (at);
alter table public.customer_invites enable row level security;
create policy customer_invites_read on public.customer_invites for select to authenticated using (app.is_desk());
revoke all on public.customer_invites from anon;
revoke insert, update, delete on public.customer_invites from authenticated;
grant select on public.customer_invites to authenticated;

-- Invitations go through the e-mail outbox, by customer instead of appointment.
alter table public.email_outbox alter column appointment_id drop not null;
alter table public.email_outbox add column customer_id text references public.customers (id) on delete cascade;
alter table public.email_outbox add constraint email_outbox_target check (appointment_id is not null or customer_id is not null);
alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation', 'reschedule', 'cancellation', 'reminder_24h', 'reminder_2h', 'team_new', 'team_cancel',
  'thank_you', 'winback', 'new_system'
));

-- The claim must return the new column (setof public.email_outbox already does).

-- Queue e-mail invitations for a list of customers. Returns how many were queued,
-- who was skipped and why, and how many are left for today.
create or replace function public.invite_customers(p_ids text[], p_kind text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  limit_today int;
  used int;
  left_today int;
  queued int := 0;
  skipped jsonb := '[]'::jsonb;
  me text;
  c record;
begin
  if not app.is_desk() then raise exception 'Tu rol no permite enviar invitaciones.'; end if;
  if p_kind not in ('winback', 'new_system') then raise exception 'Invitación desconocida.'; end if;
  select invite_daily_limit into limit_today from public.settings where id = 1;
  select count(*) into used from public.customer_invites
  where channel = 'email' and at >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
  left_today := greatest(limit_today - used, 0);
  select name into me from public.profiles where id = auth.uid();

  for c in select * from public.customers where id = any(p_ids) loop
    if c.email = '' then
      skipped := skipped || jsonb_build_object('id', c.id, 'reason', 'sin correo');
    elsif c.marketing_opt_out then
      skipped := skipped || jsonb_build_object('id', c.id, 'reason', 'pidió no recibir invitaciones');
    elsif exists (select 1 from public.customer_invites i where i.customer_id = c.id and i.at > now() - interval '30 days') then
      skipped := skipped || jsonb_build_object('id', c.id, 'reason', 'invitado hace menos de 30 días');
    elsif left_today <= 0 then
      skipped := skipped || jsonb_build_object('id', c.id, 'reason', 'se acabó el cupo de hoy');
    else
      insert into public.customer_invites (customer_id, kind, channel, by_name) values (c.id, p_kind, 'email', coalesce(me, ''));
      insert into public.email_outbox (kind, customer_id, dedupe_key)
      values (p_kind, c.id, p_kind || ':' || c.id || ':' || to_char(now(), 'YYYY-MM-DD'))
      on conflict (dedupe_key) do nothing;
      queued := queued + 1;
      left_today := left_today - 1;
    end if;
  end loop;
  return jsonb_build_object('queued', queued, 'skipped', skipped, 'left', left_today);
end $$;
revoke all on function public.invite_customers(text[], text) from public, anon;
grant execute on function public.invite_customers(text[], text) to authenticated;

-- A WhatsApp invitation is sent from the phone; the panel only records it.
create or replace function public.log_whatsapp_invite(p_id text, p_kind text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_desk() then raise exception 'Tu rol no permite enviar invitaciones.'; end if;
  if p_kind not in ('winback', 'new_system') then raise exception 'Invitación desconocida.'; end if;
  insert into public.customer_invites (customer_id, kind, channel, by_name)
  select p_id, p_kind, 'whatsapp', coalesce((select name from public.profiles where id = auth.uid()), '')
  where exists (select 1 from public.customers where id = p_id);
end $$;
revoke all on function public.log_whatsapp_invite(text, text) from public, anon;
grant execute on function public.log_whatsapp_invite(text, text) to authenticated;

-- "No quiero recibir invitaciones": the link in the e-mail (no session). Returns the first name.
create or replace function public.unsubscribe(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if length(coalesce(p_token, '')) < 16 then return null; end if;
  update public.customers set marketing_opt_out = true where optout_token = p_token returning split_part(name, ' ', 1) into n;
  return n;
end $$;
revoke all on function public.unsubscribe(text) from public;
grant execute on function public.unsubscribe(text) to anon, authenticated;
