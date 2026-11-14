-- Corrections (owner/developer only). Rolled back.
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
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'dueno10@havana.test');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000002', 'gerente10@havana.test');
insert into public.profiles (id, name, email, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Leo', 'dueno10@havana.test', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'Gerente', 'gerente10@havana.test', 'manager')
on conflict (id) do nothing;
insert into public.customers (id, name, phone) values ('k1', 'Ana', '4425550001'), ('k2', 'Beto', '4425550002');
insert into public.products (id, name, price) values ('cera10', 'Cera', 150);
insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, status, source) values
  ('c1', 'k1', 'isaac', '{corte-adulto}', now() + interval '6 days', now() + interval '6 days 45 minutes', 45, 280, 'confirmed', 'panel'),
  ('c2', 'k1', 'isaac', '{corte-adulto}', now() + interval '7 days', now() + interval '7 days 45 minutes', 45, 280, 'confirmed', 'panel');

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
select pg_temp.refused($$select public.edit_appointment('c1', '{bigote}', 'k2', '')$$, 'el gerente no edita citas');

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
-- Edit: services, customer and notes; duration and price follow the services.
select public.edit_appointment('c1', '{corte-adulto,bigote}', 'k2', 'Trae a su hermano');
select pg_temp.check(
  (select customer_id = 'k2' and duration_min = 60 and total_price = 430 and ends_at = starts_at + interval '60 minutes'
     and notes = 'Trae a su hermano' from public.appointments where id = 'c1'),
  'editar cita: servicios, cliente y notas; duración y precio recalculados'
);

-- Charge, then void: the stamp goes back and the appointment is open again.
select public.complete_appointment('c2', '{"method":"card","tip":0}');
select pg_temp.check((select stamps from public.loyalty_cards where customer_id = 'k1') = 1, 'el cobro suma un sello');
select pg_temp.refused($$select public.void_payment('c2', '  ')$$, 'anular pide motivo');
select public.void_payment('c2', 'Se cobró a la cita equivocada');
select pg_temp.check(
  (select status = 'confirmed' from public.appointments where id = 'c2')
  and not exists (select 1 from public.payments where appointment_id = 'c2')
  and (select stamps from public.loyalty_cards where customer_id = 'k1') = 0,
  'anular cobro: cita abierta otra vez y el sello se devuelve'
);

-- Correct: method and services change, a product is added; time and stamp stay right.
select public.complete_appointment('c2', '{"method":"card","tip":0}');
update public.payments set paid_at = now() - interval '2 hours' where appointment_id = 'c2';
select public.correct_payment('c2', '{"method":"cash","tip":20,"tipMethod":"cash","serviceIds":["corte-adulto","corte-adulto"],"products":[{"productId":"cera10","qty":1}]}', 'Fue efectivo y eran dos cortes');
select pg_temp.check(
  (select method = 'cash' and amount = 560 and tip = 20 and products -> 0 ->> 'name' = 'Cera'
     and correction_reason = 'Fue efectivo y eran dos cortes' and corrected_by_name is not null
     and paid_at < now() - interval '1 hour' from public.payments where appointment_id = 'c2')
  and (select service_ids = '{corte-adulto,corte-adulto}' and total_price = 560 and status = 'completed' from public.appointments where id = 'c2')
  and (select stamps from public.loyalty_cards where customer_id = 'k1') = 1,
  'corregir cobro: nuevo cobro con la hora original, un solo sello y quién lo corrigió'
);
select pg_temp.check(
  (select count(*) from public.audit_log where entity = 'payments' and entity_id = 'c2' and action in ('void', 'correct')) = 2,
  'bitácora con motivo de cada corrección'
);

-- Free cut: voiding a charge that redeemed it gives the reward back.
insert into public.loyalty_cards (customer_id, stamps, goal, reward_expires_at) values ('k2', 10, 10, now() + interval '20 days')
on conflict (customer_id) do update set stamps = 10, reward_expires_at = now() + interval '20 days';
select public.complete_appointment('c1', '{"method":"cash","tip":0,"useReward":true}');
select pg_temp.check((select stamps from public.loyalty_cards where customer_id = 'k2') = 0, 'canjear el corte gratis reinicia la tarjeta');
select public.void_payment('c1', 'Prueba');
select pg_temp.check(
  (select stamps = 10 and reward_expires_at > now() + interval '19 days' from public.loyalty_cards where customer_id = 'k2'),
  'anular devuelve el corte gratis con su vigencia'
);

-- Counter sale: correct and void.
select (public.record_sale('[{"productId":"cera10","qty":1}]', 'isaac', 'cash')).id as sale_id \gset
select public.correct_sale(:'sale_id', '[{"productId":"cera10","qty":2}]', 'leonardo', 'card', 'Eran dos y la vendió Leo');
select pg_temp.check(
  (select total = 300 and staff_id = 'leonardo' and method = 'card' and correction_reason is not null from public.product_sales where id = :'sale_id'),
  'corregir venta: productos, vendedor y forma de pago'
);

-- A closed cash day blocks corrections until it is reopened.
reset role;
insert into public.daily_closes (date, opening_fund, expected, counted, closed_by_name)
values ((now() at time zone 'America/Mexico_City')::date, 0, 0, 0, 'Leo');
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.refused(format($$select public.void_sale(%L, 'x')$$, :'sale_id'), 'con la caja cerrada no se corrige');
reset role;
delete from public.daily_closes;
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select public.void_sale(:'sale_id', 'Venta duplicada');
reset role;
select pg_temp.check(not exists (select 1 from public.product_sales where id = :'sale_id'), 'anular venta');

rollback;
