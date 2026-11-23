-- Tips paid to barbers apart from the weekly payroll (decided with the shop
-- owner, Nov 2026):
-- · Tips accumulate as pending per barber and are paid whenever the owner wants.
-- · Card tips over $25 have $5 kept for the terminal fee; $25 or less are paid
--   in full (both amounts editable in Ajustes › Finanzas).
-- · They are paid with cash from the drawer: each payout is a cash move «out»
--   in the barber's name (traceable, so the corte still matches) and is never
--   a business expense (Utilidades only counts registered expenses).
-- · Only owner and manager pay or void them.
-- · Tips from appointments on or after `tips_separate_from` are no longer added
--   to the weekly payroll; earlier ones were already paid with it.

alter table public.settings
  add column card_tip_fee int not null default 5 check (card_tip_fee between 0 and 1000),
  add column card_tip_fee_over int not null default 25 check (card_tip_fee_over between 0 and 100000),
  add column tips_separate_from date;

-- Start right after the last closed payroll week (its tips were paid with the
-- payroll), or at the start of the current payroll week when none was closed.
update public.settings s set tips_separate_from = coalesce(
  (select max(week_end) + 1 from public.payroll_closes),
  (now() at time zone s.time_zone)::date
    - ((extract(dow from (now() at time zone s.time_zone))::int - s.week_start_day + 7) % 7)
) where id = 1;

create table public.tip_payouts (
  id text primary key default app.new_id(),
  folio int generated always as identity unique,
  staff_id text not null references public.staff (id),
  staff_name text not null,
  -- The drawer's day the cash came out of.
  date date not null,
  paid_at timestamptz not null default now(),
  -- Tips as the customers left them, the card fee kept, and what was paid.
  gross int not null,
  fee int not null default 0,
  amount int not null check (amount > 0),
  by_method jsonb not null,
  first_date date not null,
  last_date date not null,
  -- Frozen detail for the receipt: [{appointmentId, date, customer, method, tip, fee, amount}].
  lines jsonb not null,
  paid_by_name text not null,
  paid_by uuid,
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
);
create index tip_payouts_staff_date on public.tip_payouts (staff_id, date);

-- What each payout covered per appointment (to know what is still pending).
create table public.tip_payout_items (
  payout_id text not null references public.tip_payouts (id) on delete cascade,
  appointment_id text not null references public.appointments (id) on delete cascade,
  tip int not null,
  fee int not null default 0,
  amount int not null,
  primary key (payout_id, appointment_id)
);
create index tip_payout_items_appointment on public.tip_payout_items (appointment_id);

-- The cash move of a payout: traceable to the barber, never an expense.
alter table public.cash_moves
  add column staff_id text references public.staff (id) on delete set null,
  add column tip_payout_id text references public.tip_payouts (id) on delete set null;

alter table public.tip_payouts enable row level security;
alter table public.tip_payouts force row level security;
alter table public.tip_payout_items enable row level security;
alter table public.tip_payout_items force row level security;
revoke all on public.tip_payouts, public.tip_payout_items from anon;
revoke all on public.tip_payouts, public.tip_payout_items from authenticated;
grant select on public.tip_payouts, public.tip_payout_items to authenticated;
-- Finance sees everything; a barber sees their own payouts. Writes only through the functions below.
create policy tip_payouts_read on public.tip_payouts for select to authenticated
  using (app.is_finance() or staff_id = app.my_staff_id());
create policy tip_payout_items_read on public.tip_payout_items for select to authenticated
  using (exists (select 1 from public.tip_payouts t where t.id = payout_id
                 and (app.is_finance() or t.staff_id = app.my_staff_id())));

create trigger tip_payouts_audit after insert or update or delete on public.tip_payouts
  for each row execute function app.audit();

-- A tip payout's cash move can't be counted as an expense.
create or replace function app.guard_expense_not_tips() returns trigger
language plpgsql as $$
begin
  if new.cash_move_id is not null
     and exists (select 1 from public.cash_moves where id = new.cash_move_id and tip_payout_id is not null) then
    raise exception 'El pago de propinas no es un gasto del negocio.';
  end if;
  return new;
end $$;
create trigger expenses_not_tips before insert or update on public.expenses
  for each row execute function app.guard_expense_not_tips();

-- Card fee kept on one tip.
create or replace function app.tip_fee(p_tip int, p_method text) returns int
language sql stable security definer set search_path = public as $$
  select case when p_method = 'card' and p_tip > s.card_tip_fee_over then least(s.card_tip_fee, p_tip) else 0 end
  from public.settings s where s.id = 1
$$;

-- Every appointment whose tip is not settled yet: new tips, and tips corrected
-- or voided after being paid (amount may then be negative: paid too much).
create or replace function public.pending_tips()
returns table (
  staff_id text, appointment_id text, date date, customer text, method text,
  tip int, fee int, amount int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_finance() then raise exception 'Tu rol no permite ver las propinas por pagar.'; end if;
  return query
  with s as (select * from public.settings where id = 1),
  lines as (
    select a.id, a.staff_id, (a.starts_at at time zone s.time_zone)::date as day, c.name as customer,
           p.tip_method, coalesce(p.tip, 0) as tip,
           coalesce((select sum(i.tip) from public.tip_payout_items i join public.tip_payouts t on t.id = i.payout_id
                     where i.appointment_id = a.id and t.voided_at is null), 0)::int as paid_tip,
           coalesce((select sum(i.amount) from public.tip_payout_items i join public.tip_payouts t on t.id = i.payout_id
                     where i.appointment_id = a.id and t.voided_at is null), 0)::int as paid
    from public.appointments a
    cross join s
    left join public.payments p on p.appointment_id = a.id
    left join public.customers c on c.id = a.customer_id
    where (a.starts_at at time zone s.time_zone)::date >= s.tips_separate_from
      and (coalesce(p.tip, 0) > 0 or exists (select 1 from public.tip_payout_items i where i.appointment_id = a.id))
  )
  select l.staff_id, l.id, l.day, coalesce(l.customer, 'Cliente'), coalesce(l.tip_method, 'cash'),
         (l.tip - l.paid_tip)::int,
         ((l.tip - l.paid_tip) - ((l.tip - app.tip_fee(l.tip, l.tip_method)) - l.paid))::int,
         ((l.tip - app.tip_fee(l.tip, l.tip_method)) - l.paid)::int
  from lines l
  where l.tip <> l.paid_tip
  order by l.staff_id, l.day, l.id;
end $$;
revoke all on function public.pending_tips() from public, anon;
grant execute on function public.pending_tips() to authenticated;

-- Pay a barber every pending tip (up to a date, if given). p_expected is the
-- amount the panel showed: if it changed meanwhile, nothing is paid.
create or replace function public.pay_tips(p_staff_id text, p_expected int, p_until date default null)
returns public.tip_payouts
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_staff text;
  v_today date;
  v_total int;
  r public.tip_payouts;
  v_move text;
begin
  if not app.is_finance() then raise exception 'Solo el dueño o el gerente pueden pagar propinas.'; end if;
  select name into v_staff from public.staff where id = p_staff_id;
  if v_staff is null then raise exception 'No encontramos a ese barbero.'; end if;
  -- One payment at a time per barber, so nothing is paid twice.
  perform pg_advisory_xact_lock(hashtext('tips:' || p_staff_id));
  select (now() at time zone time_zone)::date into v_today from public.settings where id = 1;

  drop table if exists _tips;
  create temp table _tips on commit drop as
    select * from public.pending_tips() t
    where t.staff_id = p_staff_id and (p_until is null or t.date <= p_until);
  select coalesce(sum(amount), 0) into v_total from _tips;
  if v_total <= 0 then raise exception 'No hay propinas por pagar a %.', v_staff; end if;
  if p_expected is distinct from v_total then
    raise exception 'El monto cambió (ahora son $%). Revisa y vuelve a intentar.', v_total;
  end if;

  select name into v_name from public.profiles where id = auth.uid();
  insert into public.tip_payouts (
    staff_id, staff_name, date, gross, fee, amount, by_method, first_date, last_date, lines, paid_by_name, paid_by
  )
  select p_staff_id, v_staff, v_today, sum(tip), sum(fee), sum(amount),
         jsonb_build_object(
           'cash', coalesce(sum(tip) filter (where method = 'cash'), 0),
           'card', coalesce(sum(tip) filter (where method = 'card'), 0),
           'transfer', coalesce(sum(tip) filter (where method = 'transfer'), 0)
         ),
         min(date), max(date),
         jsonb_agg(jsonb_build_object(
           'appointmentId', appointment_id, 'date', date, 'customer', customer, 'method', method,
           'tip', tip, 'fee', fee, 'amount', amount
         ) order by date, appointment_id),
         coalesce(v_name, 'Panel'), auth.uid()
  from _tips
  returning * into r;

  insert into public.tip_payout_items (payout_id, appointment_id, tip, fee, amount)
  select r.id, appointment_id, tip, fee, amount from _tips;

  -- Cash out of today's drawer, in the barber's name (fails if today's drawer is closed).
  insert into public.cash_moves (date, kind, amount, concept, by_name, created_by, staff_id, tip_payout_id)
  values (v_today, 'out', r.amount, format('Pago de propinas · %s · folio %s', v_staff, r.folio),
          coalesce(v_name, 'Panel'), auth.uid(), p_staff_id, r.id)
  returning id into v_move;
  return r;
end $$;
revoke all on function public.pay_tips(text, int, date) from public, anon;
grant execute on function public.pay_tips(text, int, date) to authenticated;

-- Void a payout (paid by mistake): its tips are pending again. The cash goes
-- back to the drawer: the cash move is removed while its day is open, or a
-- cash «in» is registered today when that day was already closed.
create or replace function public.void_tip_payout(p_id text, p_reason text)
returns public.tip_payouts
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  r public.tip_payouts;
  v_today date;
begin
  if not app.is_finance() then raise exception 'Solo el dueño o el gerente pueden anular pagos de propinas.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Escribe el motivo.'; end if;
  select * into r from public.tip_payouts where id = p_id for update;
  if r.id is null then raise exception 'No encontramos ese pago.'; end if;
  if r.voided_at is not null then raise exception 'Ese pago ya estaba anulado.'; end if;
  select name into v_name from public.profiles where id = auth.uid();
  select (now() at time zone time_zone)::date into v_today from public.settings where id = 1;
  if exists (select 1 from public.daily_closes where date = r.date) then
    insert into public.cash_moves (date, kind, amount, concept, by_name, created_by, staff_id)
    values (v_today, 'in', r.amount, format('Reverso de pago de propinas · %s · folio %s', r.staff_name, r.folio),
            coalesce(v_name, 'Panel'), auth.uid(), r.staff_id);
  else
    delete from public.cash_moves where tip_payout_id = r.id;
  end if;
  update public.tip_payouts
    set voided_at = now(), voided_by_name = coalesce(v_name, 'Panel'), void_reason = trim(p_reason)
    where id = p_id returning * into r;
  return r;
end $$;
revoke all on function public.void_tip_payout(text, text) from public, anon;
grant execute on function public.void_tip_payout(text, text) to authenticated;
