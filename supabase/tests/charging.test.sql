-- Charging and the daily close, run in a transaction that is rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

-- The first user becomes the owner (trigger); then reception.
insert into auth.users (id, email) values ('10000000-0000-0000-0000-000000000001', 'dueno@havana.test');
insert into auth.users (id, email) values ('10000000-0000-0000-0000-000000000002', 'recepcion@havana.test');
insert into public.profiles (id, name, email, role) values ('10000000-0000-0000-0000-000000000002', 'Recepción', 'recepcion@havana.test', 'reception');
insert into public.customers (id, name, phone) values ('c1', 'Ana Ríos', '4421112233'), ('c2', 'Luis Mora', '4424445566');
insert into public.products (id, name, price) values ('cera', 'Cera', 150);
insert into public.product_costs (product_id, cost, commission) values ('cera', 60, 20);
insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, status) values
  ('a1', 'c1', 'isaac', '{corte-adulto}', '2026-01-05 16:00+00', '2026-01-05 16:45+00', 45, 280, 'confirmed'),
  ('a2', 'c1', 'isaac', '{corte-barba}', '2026-01-06 16:00+00', '2026-01-06 17:00+00', 60, 500, 'confirmed'),
  ('a3', 'c2', 'isaac', '{corte-adulto}', '2026-01-07 16:00+00', '2026-01-07 16:45+00', 45, 280, 'confirmed'),
  ('a4', 'c2', 'leonardo', '{bigote}', '2026-01-07 16:00+00', '2026-01-07 16:15+00', 15, 150, 'confirmed');

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';

-- Cash + tip + a product: one stamp on a new card.
select public.complete_appointment('a1', '{"method":"cash","tip":50,"tipMethod":"cash","products":[{"productId":"cera","qty":1}]}');
select pg_temp.check(
  (select amount = 280 and tip = 50 and products -> 0 ->> 'commission' = '20' from public.payments where appointment_id = 'a1'),
  'cobro con propina y producto al precio del catálogo'
);
select pg_temp.check((select stamps from public.loyalty_cards where customer_id = 'c1') = 1, 'el cobro suma un sello');
select pg_temp.check((select status from public.appointments where id = 'a1') = 'completed', 'la cita queda completada');

-- Reception can't discount without an owner's or manager's approval.
do $$ begin
  perform public.complete_appointment('a3', '{"method":"cash","tip":0,"discount":{"amount":30,"reason":"Promo"}}');
  raise exception 'FALLÓ: descuento sin autorización';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · recepción necesita autorización para descontar';
end $$;
reset role;
insert into public.discount_approvals (id, amount, authorized_by, authorized_by_name)
values ('ap1', 30, '10000000-0000-0000-0000-000000000001', 'Dueño');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select public.complete_appointment('a3', '{"method":"card","tip":0,"discount":{"amount":30,"reason":"Promo","approvalId":"ap1"}}');
select pg_temp.check(
  (select amount = 250 and discount ->> 'authorizedByName' = 'Dueño' from public.payments where appointment_id = 'a3'),
  'descuento autorizado queda registrado con quién lo autorizó'
);
do $$ begin
  perform 1 from public.discount_approvals;
  raise exception 'FALLÓ: el navegador no debe leer autorizaciones';
exception when insufficient_privilege then raise notice 'ok · las autorizaciones no se leen desde el navegador';
end $$;

-- Mixed payment must add up.
do $$ begin
  perform public.complete_appointment('a4', '{"method":"cash","tip":0,"splits":[{"method":"cash","amount":100},{"method":"card","amount":10}]}');
  raise exception 'FALLÓ: pago mixto que no suma';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · el pago mixto debe sumar el total';
end $$;
select public.complete_appointment('a4', '{"method":"cash","tip":0,"splits":[{"method":"cash","amount":100},{"method":"card","amount":50}]}');

-- Free cut on a combo: a haircut's price off, the rest charged; the card starts over.
reset role;
update public.loyalty_cards set stamps = goal, reward_expires_at = now() + interval '30 days' where customer_id = 'c1';
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select public.complete_appointment('a2', '{"method":"cash","tip":0,"useReward":true}');
select pg_temp.check(
  (select amount = 220 and reward_amount = 280 from public.payments where appointment_id = 'a2'),
  'corte gratis en combo descuenta un corte y cobra la diferencia'
);
select pg_temp.check((select stamps from public.loyalty_cards where customer_id = 'c1') = 0, 'canjear reinicia la tarjeta');

-- Daily close: the expected cash is computed in the database (by payment time).
reset role;
update public.payments set paid_at = '2026-01-07 18:00+00' where appointment_id in ('a3', 'a4');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
insert into public.cash_moves (date, kind, amount, concept, by_name) values ('2026-01-07', 'out', 40, 'Toallas', 'Recepción');
select pg_temp.check(
  (select expected from public.close_day('2026-01-07', 500, 560, '')) = 500 + 100 - 40,
  'el corte calcula el efectivo esperado (mixtos repartidos)'
);

-- Counter sale: price and the product commission from the catalog.
select pg_temp.check(
  (select total = 300 and items -> 0 ->> 'commission' = '20' from public.record_sale('[{"productId":"cera","qty":2}]', 'isaac', 'cash')),
  'venta de mostrador al precio del catálogo con la comisión del producto'
);
do $$ begin
  perform public.record_sale('[{"productId":"cera","qty":1}]', null, 'cash');
  raise exception 'FALLÓ: venta sin vendedor';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · la venta siempre guarda quién la vendió';
end $$;
-- A walk-in without a phone.
insert into public.customers (name) values ('Sin teléfono');
select pg_temp.check(true, 'cliente sin cita puede no dejar teléfono');

-- Visitors without a session can't charge, close or sell.
reset role;
select pg_temp.check(
  not has_function_privilege('anon', 'public.complete_appointment(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.close_day(date, int, int, text)', 'execute')
  and not has_function_privilege('anon', 'public.record_sale(jsonb, text, text)', 'execute'),
  'sin sesión no se puede cobrar, cerrar caja ni vender'
);

reset role;
rollback;
