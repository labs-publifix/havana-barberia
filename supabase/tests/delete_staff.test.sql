-- Deleting barbers. Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values ('40000000-0000-0000-0000-000000000001', 'dueno@havana.test');
insert into auth.users (id, email) values ('40000000-0000-0000-0000-000000000002', 'recepcion@havana.test');
insert into public.profiles (id, name, email, role) values ('40000000-0000-0000-0000-000000000002', 'Recepción', 'recepcion@havana.test', 'reception');
insert into public.staff (id, name, sort, schedule) values
  ('nuevo', 'Barbero Nuevo', 3, '[[],[],[],[],[],[],[]]'),
  ('veterano', 'Barbero Veterano', 4, '[[],[],[],[],[],[],[]]'),
  ('ocupado', 'Barbero Ocupado', 5, '[[],[],[],[],[],[],[]]');
insert into public.staff_contacts (staff_id, email) values ('nuevo', 'nuevo@havana.test');
insert into public.customers (id, name, phone) values ('d1', 'Cliente', '4420001111');
insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, status) values
  ('h1', 'd1', 'veterano', '{corte-adulto}', now() - interval '10 days', now() - interval '10 days' + interval '45 minutes', 45, 280, 'completed'),
  ('f1', 'd1', 'ocupado', '{corte-adulto}', now() + interval '2 days', now() + interval '2 days 45 minutes', 45, 280, 'confirmed');

set role authenticated;
set request.jwt.claim.sub = '40000000-0000-0000-0000-000000000002';
do $$ begin
  perform public.delete_staff('nuevo');
  raise exception 'FALLÓ: recepción eliminó un barbero';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · recepción no elimina barberos';
end $$;

set request.jwt.claim.sub = '40000000-0000-0000-0000-000000000001';
select pg_temp.check(public.delete_staff('nuevo') = 'deleted', 'sin historial se elimina por completo');
select pg_temp.check(not exists (select 1 from public.staff where id = 'nuevo'), 'ya no existe');
select pg_temp.check(not exists (select 1 from public.staff_contacts where staff_id = 'nuevo'), 'su correo se borra con él');

select pg_temp.check(public.delete_staff('veterano') = 'archived', 'con historial se archiva');
select pg_temp.check(
  (select not active and archived_at is not null from public.staff where id = 'veterano'),
  'archivado: inactivo y fuera de Equipo'
);
select pg_temp.check((select staff_id from public.appointments where id = 'h1') = 'veterano', 'su historial se conserva');

do $$ begin
  perform public.delete_staff('ocupado');
  raise exception 'FALLÓ: eliminó a un barbero con citas próximas';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · con citas próximas pide moverlas primero';
end $$;
reset role;

rollback;
