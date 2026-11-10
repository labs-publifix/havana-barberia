-- Subscribed calendars. Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values ('50000000-0000-0000-0000-000000000001', 'dueno@havana.test');
insert into auth.users (id, email) values ('50000000-0000-0000-0000-000000000002', 'isaac@havana.test');
insert into public.profiles (id, name, email, role, staff_id) values
  ('50000000-0000-0000-0000-000000000002', 'Isaac', 'isaac@havana.test', 'barber', 'isaac');

set role authenticated;
set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000001';
create temp table t1 as select public.calendar_feed(null) as shop, public.calendar_feed('isaac') as isaac;
select pg_temp.check((select length(shop) = 48 and shop <> isaac from t1), 'el dueño obtiene enlaces privados de la barbería y de un barbero');
select pg_temp.check((select public.calendar_feed(null) = shop from t1), 'el mismo enlace cada vez');
select pg_temp.check((select public.calendar_feed(null, true) <> shop from t1), 'generar uno nuevo invalida el anterior');
reset role;
select pg_temp.check((select count(*) from public.calendar_feeds where token = (select shop from t1)) = 0, 'el enlace anterior ya no existe');
set role authenticated;

set request.jwt.claim.sub = '50000000-0000-0000-0000-000000000002';
select pg_temp.check(length(public.calendar_feed('isaac')) = 48, 'el barbero conecta su propia agenda');
do $$ begin
  perform public.calendar_feed(null);
  raise exception 'FALLÓ: el barbero vio la agenda de toda la barbería';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · el barbero no conecta la agenda de toda la barbería';
end $$;
do $$ begin
  perform public.calendar_feed('leonardo');
  raise exception 'FALLÓ: el barbero vio la agenda de otro';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · ni la de otro barbero';
end $$;
do $$ begin
  perform 1 from public.calendar_feeds;
  raise exception 'FALLÓ: se leyeron enlaces desde el navegador';
exception when insufficient_privilege then raise notice 'ok · los enlaces no se leen desde el navegador';
end $$;
reset role;

rollback;
