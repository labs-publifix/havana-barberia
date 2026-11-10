-- Developer role and barber contacts. Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values ('30000000-0000-0000-0000-000000000001', 'dueno@havana.test');
insert into auth.users (id, email) values ('30000000-0000-0000-0000-000000000002', 'dev@havana.test');
insert into auth.users (id, email) values ('30000000-0000-0000-0000-000000000003', 'recepcion@havana.test');
insert into public.profiles (id, name, email, role) values
  ('30000000-0000-0000-0000-000000000002', 'Dev', 'dev@havana.test', 'developer'),
  ('30000000-0000-0000-0000-000000000003', 'Recepción', 'recepcion@havana.test', 'reception');
insert into public.staff_contacts (staff_id, email) values ('isaac', 'isaac@havana.test');

set role authenticated;
set request.jwt.claim.sub = '30000000-0000-0000-0000-000000000002';
select pg_temp.check(app.is_owner() and app.is_finance() and app.is_desk(), 'el desarrollador tiene el acceso del dueño');
select pg_temp.check((select count(*) from public.profiles) = 3, 've a todos los usuarios');
update public.profiles set name = 'Recepción 2' where id = '30000000-0000-0000-0000-000000000003';
select pg_temp.check((select name from public.profiles where id = '30000000-0000-0000-0000-000000000003') = 'Recepción 2', 'administra usuarios');
select pg_temp.check((select count(*) from public.audit_log) >= 0, 'lee la bitácora');
select pg_temp.check((select email from public.staff_contacts where staff_id = 'isaac') = 'isaac@havana.test', 've el correo de cada barbero');
update public.staff set bio = 'Fades y barba clásica.' where id = 'isaac';
select pg_temp.check((select bio from public.staff where id = 'isaac') = 'Fades y barba clásica.', 'edita el perfil público del barbero');

set request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
select pg_temp.check((select count(*) from public.staff_contacts) = 0, 'recepción no ve correos de barberos');
reset role;
set role anon;
do $$ begin
  perform 1 from public.staff_contacts;
  raise exception 'FALLÓ: el sitio leyó correos de barberos';
exception when insufficient_privilege then raise notice 'ok · el sitio no lee correos de barberos';
end $$;
select pg_temp.check((select bio from public.staff where id = 'isaac') = 'Fades y barba clásica.', 'el sitio ve la descripción pública');
reset role;

-- The shop always keeps an active owner (a developer does not replace it).
do $$ begin
  update public.profiles set role = 'developer' where id = '30000000-0000-0000-0000-000000000001';
  set constraints all immediate;
  raise exception 'FALLÓ: quedó sin dueño';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · siempre queda una persona dueña';
end $$;

rollback;
