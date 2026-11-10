-- Online booking: busy times for the site and limits per IP. Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

insert into public.customers (id, name, phone, email) values ('b1', 'Ana Ríos', '4429998877', 'ana@b.test');
insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, status) values
  ('x1', 'b1', 'isaac', '{corte-adulto}', '2026-12-01 16:00+00', '2026-12-01 16:45+00', 45, 280, 'confirmed'),
  ('x2', 'b1', 'isaac', '{corte-adulto}', '2026-12-01 18:00+00', '2026-12-01 18:45+00', 45, 280, 'cancelled');
insert into public.time_blocks (id, staff_id, starts_at, ends_at, reason) values
  ('k1', null, '2026-12-01 20:00+00', '2026-12-01 22:00+00', 'Junta');

set role anon;
select pg_temp.check(
  (select count(*) from public.busy_slots('2026-12-01 00:00+00', '2026-12-02 00:00+00')) = 2,
  'el sitio ve horarios ocupados (citas activas y bloqueos), sin las canceladas'
);
select pg_temp.check(
  (select bool_and(is_block = (id = 'k1')) from public.busy_slots('2026-12-01 00:00+00', '2026-12-02 00:00+00')),
  'distingue citas de bloqueos y no expone datos del cliente'
);
do $$ begin
  perform public.rate_limit('x', 1, 60);
  raise exception 'FALLÓ: un visitante usó el límite directamente';
exception when insufficient_privilege then raise notice 'ok · solo el servidor cuenta intentos';
end $$;
reset role;

select pg_temp.check(public.rate_limit('create:1.2.3.4', 2, 3600), 'primer intento permitido');
select pg_temp.check(public.rate_limit('create:1.2.3.4', 2, 3600), 'segundo intento permitido');
select pg_temp.check(not public.rate_limit('create:1.2.3.4', 2, 3600), 'tercer intento bloqueado');
select pg_temp.check(public.rate_limit('create:5.6.7.8', 2, 3600), 'otra IP no se afecta');

rollback;
