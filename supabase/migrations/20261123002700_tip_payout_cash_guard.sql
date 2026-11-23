-- A tip payout's cash move can't be deleted or edited from Caja: it's undone
-- only by voiding the payout (Cierres › Propinas), which returns the cash
-- and makes the tips pending again. void_tip_payout now marks the payout
-- voided first, so its own delete of the cash move is allowed.

-- Security definer: reception can't read tip_payouts, but the guard must see them.
create or replace function app.guard_tip_cash_move() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tip_payout_id is not null
     and exists (select 1 from public.tip_payouts where id = old.tip_payout_id and voided_at is null) then
    raise exception 'Es un pago de propinas: anúlalo en Cierres › Propinas.';
  end if;
  return coalesce(new, old);
end $$;
create trigger cash_moves_tip_payout before update or delete on public.cash_moves
  for each row execute function app.guard_tip_cash_move();

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
  update public.tip_payouts
    set voided_at = now(), voided_by_name = coalesce(v_name, 'Panel'), void_reason = trim(p_reason)
    where id = p_id returning * into r;
  if exists (select 1 from public.daily_closes where date = r.date) then
    insert into public.cash_moves (date, kind, amount, concept, by_name, created_by, staff_id)
    values (v_today, 'in', r.amount, format('Reverso de pago de propinas · %s · folio %s', r.staff_name, r.folio),
            coalesce(v_name, 'Panel'), auth.uid(), r.staff_id);
  else
    delete from public.cash_moves where tip_payout_id = r.id;
  end if;
  return r;
end $$;
revoke all on function public.void_tip_payout(text, text) from public, anon;
grant execute on function public.void_tip_payout(text, text) to authenticated;
