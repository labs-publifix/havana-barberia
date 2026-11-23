-- Tips paid apart (owner/manager): pending per barber, card fee rule, cash out
-- in the barber's name, never an expense, no double payment. Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;
create function pg_temp.refused(sql text, what text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FALLÓ: %', what;
exception when raise_exception or insufficient_privilege then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values
  ('b1000000-0000-0000-0000-000000000001', 'dueno-tips@havana.test'),
  ('b1000000-0000-0000-0000-000000000002', 'recepcion-tips@havana.test'),
  ('b1000000-0000-0000-0000-000000000003', 'isaac-tips@havana.test');
insert into public.profiles (id, name, email, role, staff_id) values
  ('b1000000-0000-0000-0000-000000000001', 'Leo', 'dueno-tips@havana.test', 'owner', null),
  ('b1000000-0000-0000-0000-000000000002', 'Recepción', 'recepcion-tips@havana.test', 'reception', null),
  ('b1000000-0000-0000-0000-000000000003', 'Isaac', 'isaac-tips@havana.test', 'barber', 'isaac')
on conflict (id) do nothing;
-- Names may already exist (first user becomes owner); and other test files' tips don't count here.
update public.profiles set name = 'Leo' where id = 'b1000000-0000-0000-0000-000000000001';
delete from public.payments;
update public.settings set tips_separate_from = (now() at time zone time_zone)::date - 30 where id = 1;
insert into public.customers (id, name, phone) values ('t-k1', 'Ana', '4425559001');
insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, status, source) values
  ('t1', 't-k1', 'isaac', '{corte-adulto}', now() - interval '3 hours', now() - interval '2 hours', 45, 280, 'confirmed', 'panel'),
  ('t2', 't-k1', 'isaac', '{corte-adulto}', now() - interval '2 hours', now() - interval '1 hours', 45, 280, 'confirmed', 'panel'),
  ('t3', 't-k1', 'isaac', '{corte-adulto}', now() - interval '1 hours', now() - interval '30 minutes', 45, 280, 'confirmed', 'panel'),
  ('t4', 't-k1', 'leonardo', '{corte-adulto}', now() - interval '1 hours', now() - interval '30 minutes', 45, 280, 'confirmed', 'panel'),
  -- Before tips were paid apart: it went with the payroll, never pending.
  ('t0', 't-k1', 'isaac', '{corte-adulto}', now() - interval '40 days', now() - interval '40 days' + interval '45 minutes', 45, 280, 'confirmed', 'panel');

set role authenticated;
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
select public.complete_appointment('t1', '{"method":"cash","tip":50,"tipMethod":"cash"}');
select public.complete_appointment('t2', '{"method":"card","tip":100,"tipMethod":"card"}');
select public.complete_appointment('t3', '{"method":"card","tip":25,"tipMethod":"card"}');
select public.complete_appointment('t4', '{"method":"cash","tip":30,"tipMethod":"transfer"}');
select public.complete_appointment('t0', '{"method":"cash","tip":70,"tipMethod":"cash"}');

select pg_temp.check(
  (select count(*) = 3 and sum(tip) = 175 and sum(fee) = 5 and sum(amount) = 170
     from public.pending_tips() where staff_id = 'isaac'),
  'pendientes de Isaac: $50 efectivo + $100 tarjeta (−$5) + $25 tarjeta íntegra = $170; la de antes no'
);

-- Only owner and manager.
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';
select pg_temp.refused($$select * from public.pending_tips()$$, 'recepción no ve propinas por pagar');
select pg_temp.refused($$select public.pay_tips('isaac', 170)$$, 'recepción no paga propinas');

set request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
select pg_temp.refused($$select public.pay_tips('isaac', 160)$$, 'si el monto cambió no se paga');
select public.pay_tips('isaac', 170);
select pg_temp.check(
  (select gross = 175 and fee = 5 and amount = 170 and (by_method ->> 'card')::int = 125
     and jsonb_array_length(lines) = 3 and staff_name = 'Isaac Fuentes' and paid_by_name = 'Leo'
     from public.tip_payouts where staff_id = 'isaac'),
  'pago registrado con desglose, descuento y quién pagó'
);
select pg_temp.check(
  (select kind = 'out' and amount = 170 and staff_id = 'isaac' and tip_payout_id is not null
     and concept like 'Pago de propinas · Isaac Fuentes%'
     from public.cash_moves where tip_payout_id is not null),
  'salida de caja a nombre del barbero'
);
select pg_temp.check(not exists (select 1 from public.pending_tips() where staff_id = 'isaac'), 'ya no queda nada pendiente');
select pg_temp.refused($$select public.pay_tips('isaac', 0)$$, 'no se paga dos veces');
select pg_temp.check(
  (select sum(amount) = 30 from public.pending_tips() where staff_id = 'leonardo'),
  'lo de otro barbero sigue pendiente'
);
select pg_temp.refused(
  $$insert into public.expenses (date, category, concept, amount, cash_move_id, by_name)
    select date, 'otros', concept, amount, id, 'Leo' from public.cash_moves where tip_payout_id is not null$$,
  'el pago de propinas no se puede contar como gasto'
);

-- A tip corrected after being paid: only the difference is pending.
select public.correct_payment('t1', '{"method":"cash","tip":80,"tipMethod":"cash"}', 'Eran $80 de propina');
select pg_temp.check(
  (select tip = 30 and amount = 30 from public.pending_tips() where appointment_id = 't1'),
  'propina corregida: queda pendiente solo la diferencia'
);

-- The barber sees their own payouts; reception sees none.
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000003';
select pg_temp.check((select count(*) = 1 from public.tip_payouts), 'el barbero ve sus pagos de propinas');
select pg_temp.refused($$insert into public.tip_payouts (staff_id, staff_name, date, gross, amount, by_method, first_date, last_date, lines, paid_by_name) values ('isaac', 'x', current_date, 1, 1, '{}', current_date, current_date, '[]', 'x')$$, 'nadie escribe pagos directo');
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000002';
select pg_temp.check((select count(*) = 0 from public.tip_payouts), 'recepción no ve pagos de propinas');

-- Void: the cash move goes away (day open) and the tips are pending again.
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-000000000001';
select pg_temp.refused($$select public.void_tip_payout((select id from public.tip_payouts limit 1), ' ')$$, 'anular pide motivo');
select public.void_tip_payout((select id from public.tip_payouts limit 1), 'Se registró dos veces');
select pg_temp.check(
  not exists (select 1 from public.cash_moves where tip_payout_id is not null)
  and (select sum(amount) = 200 from public.pending_tips() where staff_id = 'isaac'),
  'anulado: sale la salida de caja y vuelven a quedar pendientes'
);

reset role;
rollback;
