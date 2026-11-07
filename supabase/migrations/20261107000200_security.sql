-- Havana Barbería · seguridad: roles, RLS, funciones públicas, candados y bitácora.
--
-- Roles (public.profiles.role):
--   owner, manager  → everything, including finance (commissions, costs, payroll).
--   reception       → agenda, customers, sales and cash; reads catalog and team.
--   barber          → their own agenda, customers of their appointments and their own commissions.
-- The public site (anon) reads the catalog, team and policies, and books through
-- Edge Functions (service role) or the security-definer functions below; it can
-- never read another customer's data.

-- ── Who is calling ─────────────────────────────────────────────────────────
create or replace function app.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function app.my_staff_id() returns text
language sql stable security definer set search_path = public as $$
  select staff_id from public.profiles where id = auth.uid() and active
$$;

create or replace function app.is_finance() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('owner', 'manager'), false) $$;

create or replace function app.is_desk() returns boolean
language sql stable as $$ select coalesce(app.my_role() in ('owner', 'manager', 'reception'), false) $$;

create or replace function app.is_staff() returns boolean
language sql stable as $$ select app.my_role() is not null $$;

grant usage on schema app to anon, authenticated;
grant execute on all functions in schema app to anon, authenticated;

-- ── RLS on every table ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'settings', 'categories', 'services', 'staff', 'staff_services', 'commission_versions',
    'products', 'product_costs', 'customers', 'loyalty_cards', 'appointments', 'payments',
    'time_blocks', 'product_sales', 'cash_moves', 'daily_closes', 'advances', 'bonus_rules',
    'bonus_awards', 'payroll_closes', 'payroll_payments', 'profiles', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.settings, public.categories, public.services, public.staff, public.staff_services to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

-- Public catalog: anyone reads what is on sale; staff see everything; finance edits.
create policy settings_read on public.settings for select using (true);
create policy settings_write on public.settings for update to authenticated using (app.is_finance()) with check (app.is_finance());

create policy categories_read on public.categories for select using (true);
create policy categories_write on public.categories for all to authenticated using (app.is_finance()) with check (app.is_finance());

create policy services_read on public.services for select using (active or app.is_staff());
create policy services_write on public.services for all to authenticated using (app.is_finance()) with check (app.is_finance());

create policy staff_read on public.staff for select using (active or app.is_staff());
create policy staff_write on public.staff for all to authenticated using (app.is_finance()) with check (app.is_finance());

create policy staff_services_read on public.staff_services for select using (true);
create policy staff_services_write on public.staff_services for all to authenticated using (app.is_finance()) with check (app.is_finance());

-- Finance-only data; a barber reads their own commission rules.
create policy commission_read on public.commission_versions for select to authenticated
  using (app.is_finance() or staff_id = app.my_staff_id());
create policy commission_write on public.commission_versions for all to authenticated using (app.is_finance()) with check (app.is_finance());

create policy products_read on public.products for select to authenticated using (app.is_staff());
create policy products_write on public.products for all to authenticated using (app.is_finance()) with check (app.is_finance());
create policy product_costs_all on public.product_costs for all to authenticated using (app.is_finance()) with check (app.is_finance());

-- Customers: desk roles; a barber only those with an appointment of theirs.
create policy customers_desk on public.customers for all to authenticated using (app.is_desk()) with check (app.is_desk());
create policy customers_barber on public.customers for select to authenticated using (
  exists (select 1 from public.appointments a where a.customer_id = customers.id and a.staff_id = app.my_staff_id())
);
create policy loyalty_desk on public.loyalty_cards for all to authenticated using (app.is_desk()) with check (app.is_desk());
create policy loyalty_barber on public.loyalty_cards for select to authenticated using (
  exists (select 1 from public.appointments a where a.customer_id = loyalty_cards.customer_id and a.staff_id = app.my_staff_id())
);

-- Agenda: desk roles do everything; a barber reads and updates their own.
create policy appointments_desk on public.appointments for all to authenticated using (app.is_desk()) with check (app.is_desk());
create policy appointments_barber_read on public.appointments for select to authenticated using (staff_id = app.my_staff_id());
create policy appointments_barber_update on public.appointments for update to authenticated
  using (staff_id = app.my_staff_id()) with check (staff_id = app.my_staff_id());

create policy payments_read on public.payments for select to authenticated using (
  app.is_desk() or exists (select 1 from public.appointments a where a.id = payments.appointment_id and a.staff_id = app.my_staff_id())
);
create policy payments_insert on public.payments for insert to authenticated with check (
  app.is_desk() or exists (select 1 from public.appointments a where a.id = payments.appointment_id and a.staff_id = app.my_staff_id())
);
create policy payments_fix on public.payments for update to authenticated using (app.is_finance()) with check (app.is_finance());
create policy payments_delete on public.payments for delete to authenticated using (app.is_finance());

create policy blocks_read on public.time_blocks for select to authenticated using (app.is_staff());
create policy blocks_write on public.time_blocks for all to authenticated using (app.is_desk()) with check (app.is_desk());

-- Sales and cash: desk roles record; only finance corrects or reopens.
create policy sales_read on public.product_sales for select to authenticated using (app.is_desk() or staff_id = app.my_staff_id());
create policy sales_insert on public.product_sales for insert to authenticated with check (app.is_desk());
create policy sales_fix on public.product_sales for delete to authenticated using (app.is_finance());

create policy cash_moves_read on public.cash_moves for select to authenticated using (app.is_desk());
create policy cash_moves_insert on public.cash_moves for insert to authenticated with check (app.is_desk());
create policy cash_moves_delete on public.cash_moves for delete to authenticated using (app.is_desk());

create policy daily_closes_read on public.daily_closes for select to authenticated using (app.is_desk());
create policy daily_closes_insert on public.daily_closes for insert to authenticated with check (app.is_desk());
create policy daily_closes_reopen on public.daily_closes for delete to authenticated using (app.is_finance());

-- Payroll: finance; a barber reads their own advances and paid marks.
create policy advances_read on public.advances for select to authenticated using (app.is_finance() or staff_id = app.my_staff_id());
create policy advances_write on public.advances for all to authenticated using (app.is_finance()) with check (app.is_finance());
create policy bonus_rules_read on public.bonus_rules for select to authenticated using (app.is_staff());
create policy bonus_rules_write on public.bonus_rules for all to authenticated using (app.is_finance()) with check (app.is_finance());
create policy bonus_awards_read on public.bonus_awards for select to authenticated using (app.is_finance() or staff_id = app.my_staff_id());
create policy bonus_awards_write on public.bonus_awards for all to authenticated using (app.is_finance()) with check (app.is_finance());
create policy payroll_closes_all on public.payroll_closes for all to authenticated using (app.is_finance()) with check (app.is_finance());
create policy payroll_payments_read on public.payroll_payments for select to authenticated using (app.is_finance() or staff_id = app.my_staff_id());
create policy payroll_payments_write on public.payroll_payments for all to authenticated using (app.is_finance()) with check (app.is_finance());

-- Panel users: everyone reads their own profile; finance reads all; only the owner manages them.
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or app.is_finance());
create policy profiles_owner on public.profiles for all to authenticated
  using (app.my_role() = 'owner') with check (app.my_role() = 'owner');

create policy audit_read on public.audit_log for select to authenticated using (app.my_role() = 'owner');

-- ── Guards the panel cannot bypass ─────────────────────────────────────────
-- Nobody demotes or deactivates themselves (checked right away)…
create or replace function app.guard_own_profile() returns trigger
language plpgsql as $$
begin
  if old.id = auth.uid() and (new.role <> old.role or not new.active) then
    raise exception 'No puedes cambiar tu propio rol ni desactivarte.';
  end if;
  return new;
end $$;
create trigger profiles_own before update on public.profiles
  for each row execute function app.guard_own_profile();

-- …and there is always an active owner (checked when the transaction ends).
create or replace function app.guard_profiles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where role = 'owner' and active) then
    raise exception 'Debe quedar al menos una persona dueña activa.';
  end if;
  return null;
end $$;
create constraint trigger profiles_guard after update or delete on public.profiles
  deferrable initially deferred for each row execute function app.guard_profiles();

-- A closed day refuses cash moves; a closed payroll week refuses advances, bonus marks and commission changes inside it.
create or replace function app.guard_closed_day() returns trigger
language plpgsql as $$
declare d date := (to_jsonb(coalesce(new, old)) ->> 'date')::date;
begin
  if exists (select 1 from public.daily_closes where date = d) then
    raise exception 'La caja de ese día ya está cerrada. Reábrela para hacer cambios.';
  end if;
  return coalesce(new, old);
end $$;
create trigger cash_moves_closed before insert or update or delete on public.cash_moves
  for each row execute function app.guard_closed_day();

create or replace function app.week_is_closed(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payroll_closes where d between week_start and week_end)
$$;

create or replace function app.guard_closed_week() returns trigger
language plpgsql as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  d date := (r ->> case tg_table_name
    when 'advances' then 'date'
    when 'bonus_awards' then 'week_start'
    else 'valid_from'
  end)::date;
begin
  if tg_table_name = 'commission_versions' then
    if exists (select 1 from public.payroll_closes where d <= week_end) then
      raise exception 'Esa fecha cae en una semana de nómina ya cerrada. Elige una fecha posterior.';
    end if;
  elsif app.week_is_closed(d) then
    raise exception 'Esa semana de nómina ya está cerrada.';
  end if;
  return coalesce(new, old);
end $$;
create trigger advances_closed before insert or update or delete on public.advances
  for each row execute function app.guard_closed_week();
create trigger bonus_awards_closed before insert or update or delete on public.bonus_awards
  for each row execute function app.guard_closed_week();
create trigger commission_versions_closed before insert or update on public.commission_versions
  for each row execute function app.guard_closed_week();

-- ── Audit log (money and access) ───────────────────────────────────────────
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(row ->> 'id', row ->> 'appointment_id', row ->> 'date', row ->> 'week_start', row ->> 'staff_id'),
    case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) else row end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'payments', 'product_sales', 'cash_moves', 'daily_closes', 'advances', 'bonus_awards',
    'payroll_closes', 'payroll_payments', 'commission_versions', 'product_costs', 'profiles', 'settings'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit()',
      t || '_audit', t
    );
  end loop;
end $$;

-- ── What the public site may ask (no customer data leaks) ─────────────────
-- Busy times for availability: barber and time only.
create or replace function public.busy_times(from_at timestamptz, to_at timestamptz)
returns table (staff_id text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.staff_id, a.starts_at, a.ends_at from public.appointments a
  where a.status in ('booked', 'confirmed', 'completed') and a.starts_at < to_at and a.ends_at > from_at
  union all
  select b.staff_id, b.starts_at, b.ends_at from public.time_blocks b
  where b.starts_at < to_at and b.ends_at > from_at
$$;

-- A customer's own appointment, by the private token in their link.
create or replace function public.appointment_by_token(p_token text)
returns table (
  id text, token text, staff_id text, service_ids text[], starts_at timestamptz, ends_at timestamptz,
  duration_min int, total_price int, status text, customer_name text, loyalty_token text
)
language sql stable security definer set search_path = public as $$
  select a.id, a.token, a.staff_id, a.service_ids, a.starts_at, a.ends_at, a.duration_min, a.total_price,
         a.status, c.name, a.loyalty_token
  from public.appointments a join public.customers c on c.id = a.customer_id
  where a.token = p_token and length(p_token) >= 16
$$;

-- A loyalty card by its private token (first name only).
create or replace function public.loyalty_by_token(p_token text)
returns table (token text, customer_first_name text, stamps int, goal int, reward_expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.token, split_part(c.name, ' ', 1), l.stamps, l.goal, l.reward_expires_at
  from public.loyalty_cards l join public.customers c on c.id = l.customer_id
  where l.token = p_token and length(p_token) >= 16
$$;

revoke all on function public.busy_times(timestamptz, timestamptz) from public;
revoke all on function public.appointment_by_token(text) from public;
revoke all on function public.loyalty_by_token(text) from public;
grant execute on function public.busy_times(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.appointment_by_token(text) to anon, authenticated;
grant execute on function public.loyalty_by_token(text) to anon, authenticated;
