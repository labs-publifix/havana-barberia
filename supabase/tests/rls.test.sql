-- Who can see and change what. Runs on a throwaway database (scripts/test-db.sh).
\set ON_ERROR_STOP 1

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

-- The first user in the system becomes the owner.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'Dueno@Havana.test');
select pg_temp.check(
  (select role || ' ' || email from public.profiles) = 'owner dueno@havana.test',
  'la primera persona invitada queda como dueña'
);
-- (the guard keeps an active owner; set fixtures up from scratch)
alter table public.profiles disable trigger profiles_guard;
delete from public.profiles;
alter table public.profiles enable trigger profiles_guard;

-- Fixtures (as the database owner). The owner's profile goes first, so later users are not taken as the first one.
insert into public.profiles (id, name, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Dueño', 'dueno@havana.test', 'owner');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000002', 'recepcion@havana.test'),
  ('00000000-0000-0000-0000-000000000003', 'leonardo@havana.test'),
  ('00000000-0000-0000-0000-000000000004', 'gerencia@havana.test');
insert into public.profiles (id, name, email, role, staff_id) values
  ('00000000-0000-0000-0000-000000000002', 'Recepción', 'recepcion@havana.test', 'reception', null),
  ('00000000-0000-0000-0000-000000000003', 'Leonardo Gómez', 'leonardo@havana.test', 'barber', 'leonardo'),
  ('00000000-0000-0000-0000-000000000004', 'Gerente', 'gerencia@havana.test', 'manager', null);
insert into public.customers (id, name, phone, email) values
  ('c-ana', 'Ana Ríos', '4421112233', 'ana@ejemplo.com'),
  ('c-luis', 'Luis Mora', '4424445566', '');
insert into public.appointments (id, token, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price) values
  ('a-leo', 'tok-leo-0123456789ab', 'c-ana', 'leonardo', '{corte-adulto}', '2026-11-10 16:00+00', '2026-11-10 16:45+00', 45, 280),
  ('a-isaac', 'tok-isaac-0123456789', 'c-luis', 'isaac', '{bigote}', '2026-11-10 16:00+00', '2026-11-10 16:15+00', 15, 150);
update public.commission_versions set value = 40 where staff_id = 'leonardo';
insert into public.products (id, name, price) values ('cera', 'Cera mate', 150);
insert into public.product_costs (product_id, cost, commission) values ('cera', 60, 20);

-- ── Public site (anon) ─────────────────────────────────────────────────────
set role anon;
select pg_temp.check((select count(*) from public.services) = 14, 'el sitio ve el catálogo');
select pg_temp.check((select count(*) from public.busy_times('2026-11-10', '2026-11-11')) = 2, 'el sitio ve horarios ocupados');
select pg_temp.check((select customer_name from public.appointment_by_token('tok-leo-0123456789ab')) = 'Ana Ríos', 'el cliente ve su cita con su enlace');
select pg_temp.check((select count(*) from public.appointment_by_token('tok-leo')) = 0, 'un token corto no encuentra nada');
do $$ begin
  perform 1 from public.customers;
  raise exception 'FALLÓ: el sitio no debe leer clientes';
exception when insufficient_privilege then raise notice 'ok · el sitio no lee clientes';
end $$;
reset role;

-- ── Barber: only their own ─────────────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.check((select array_agg(id) from public.appointments) = '{a-leo}', 'el barbero solo ve sus citas');
select pg_temp.check((select array_agg(id) from public.customers) = '{c-ana}', 'el barbero solo ve a sus clientes');
select pg_temp.check((select count(*) from public.commission_versions) = 1, 'el barbero solo ve su comisión');
select pg_temp.check((select count(*) from public.product_costs) = 0, 'el barbero no ve costos');
update public.appointments set notes = 'x' where id = 'a-isaac';
select pg_temp.check((select notes from public.appointments where id = 'a-isaac') is null, 'el barbero no toca citas ajenas');
reset role;

-- ── Reception: agenda and cash, no finance ─────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.check((select count(*) from public.appointments) = 2, 'recepción ve toda la agenda');
select pg_temp.check((select count(*) from public.commission_versions) = 0, 'recepción no ve comisiones');
select pg_temp.check((select count(*) from public.product_costs) = 0, 'recepción no ve costos');
update public.settings set tolerance_min = 15;
select pg_temp.check((select tolerance_min from public.settings) = 10, 'recepción no cambia políticas');
insert into public.payments (appointment_id, method, amount, tip, tip_method) values ('a-isaac', 'cash', 150, 20, 'cash');
select pg_temp.check((select count(*) from public.payments) = 1, 'recepción cobra');
insert into public.cash_moves (date, kind, amount, concept, by_name) values ('2026-11-10', 'out', 100, 'Toallas', 'Recepción');
insert into public.daily_closes (date, opening_fund, expected, counted, closed_by_name) values ('2026-11-10', 500, 570, 560, 'Recepción');
select pg_temp.check((select difference from public.daily_closes) = -10, 'el arqueo calcula la diferencia');
do $$ begin
  insert into public.cash_moves (date, kind, amount, concept, by_name) values ('2026-11-10', 'in', 10, 'Cambio', 'Recepción');
  raise exception 'FALLÓ: una caja cerrada no debe aceptar movimientos';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · caja cerrada bloquea movimientos';
end $$;
delete from public.daily_closes where date = '2026-11-10';
select pg_temp.check((select count(*) from public.daily_closes) = 1, 'recepción no reabre la caja');
reset role;

-- ── Owner: finance, locks and users ────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.check((select cost from public.product_costs) = 60, 'el dueño ve costos');
insert into public.payroll_closes (week_start, week_end, rows, closed_by_name) values ('2026-11-09', '2026-11-15', '[]', 'Dueño');
do $$ begin
  insert into public.advances (staff_id, date, amount) values ('isaac', '2026-11-10', 100);
  raise exception 'FALLÓ: una semana cerrada no debe aceptar anticipos';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · semana cerrada bloquea anticipos';
end $$;
do $$ begin
  insert into public.commission_versions (staff_id, valid_from, mode, value) values ('isaac', '2026-11-12', 'percent', 40);
  raise exception 'FALLÓ: una comisión no debe empezar en una semana cerrada';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · comisiones no entran en semanas cerradas';
end $$;
do $$ begin
  update public.profiles set role = 'manager' where id = auth.uid();
  raise exception 'FALLÓ: nadie cambia su propio rol';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · el dueño no se cambia el rol';
end $$;
select pg_temp.check((select count(*) from public.audit_log where entity = 'payments') = 1, 'la bitácora registra el cobro');
reset role;

-- ── The agenda never double-books a barber ─────────────────────────────────
do $$ begin
  insert into public.appointments (customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price)
  values ('c-luis', 'leonardo', '{bigote}', '2026-11-10 16:30+00', '2026-11-10 16:45+00', 15, 150);
  raise exception 'FALLÓ: no debe haber citas encimadas';
exception when exclusion_violation then raise notice 'ok · sin citas encimadas';
end $$;
update public.appointments set status = 'cancelled' where id = 'a-leo';
insert into public.appointments (customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price)
values ('c-luis', 'leonardo', '{bigote}', '2026-11-10 16:30+00', '2026-11-10 16:45+00', 15, 150);
select pg_temp.check(true, 'una cita cancelada libera el horario');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000005', 'nuevo@havana.test');
select pg_temp.check(
  not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000005'),
  'después del dueño, nadie entra solo como dueño'
);
