-- Shop expenses (Utilidades). Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values ('60000000-0000-0000-0000-000000000001', 'dueno@havana.test');
insert into auth.users (id, email) values ('60000000-0000-0000-0000-000000000002', 'recepcion@havana.test');
insert into public.profiles (id, name, email, role) values
  ('60000000-0000-0000-0000-000000000002', 'Recepción', 'recepcion@havana.test', 'reception');
insert into public.cash_moves (id, date, kind, amount, concept, by_name) values ('m1', '2026-11-03', 'out', 300, 'Toallas', 'Recepción');

set role authenticated;
set request.jwt.claim.sub = '60000000-0000-0000-0000-000000000001';
insert into public.expenses (date, category, concept, amount, method, by_name) values ('2026-11-01', 'renta', 'Renta noviembre', 8000, 'transfer', 'Leo');
insert into public.expenses (date, category, concept, amount, cash_move_id, by_name) values ('2026-11-03', 'insumos', 'Toallas', 300, 'm1', 'Leo');
select pg_temp.check((select count(*) from public.expenses) = 2, 'el dueño registra gastos y cuenta una salida de caja');
do $$ begin
  insert into public.expenses (date, category, concept, amount, cash_move_id) values ('2026-11-03', 'insumos', 'Toallas', 300, 'm1');
  raise exception 'FALLÓ: la misma salida contó dos veces';
exception when unique_violation then raise notice 'ok · una salida de caja cuenta una sola vez';
end $$;

set request.jwt.claim.sub = '60000000-0000-0000-0000-000000000002';
select pg_temp.check((select count(*) from public.expenses) = 0, 'recepción no ve los gastos');
reset role;
set role anon;
do $$ begin
  perform 1 from public.expenses;
  raise exception 'FALLÓ: el sitio leyó gastos';
exception when insufficient_privilege then raise notice 'ok · el sitio no lee gastos';
end $$;
reset role;

rollback;
