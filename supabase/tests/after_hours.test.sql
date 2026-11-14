-- Out-of-hours appointments. Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values ('90000000-0000-0000-0000-000000000001', 'dueno9@havana.test');
insert into auth.users (id, email) values ('90000000-0000-0000-0000-000000000002', 'recep9@havana.test');
insert into public.profiles (id, name, email, role) values
  ('90000000-0000-0000-0000-000000000001', 'Dueño', 'dueno9@havana.test', 'owner'),
  ('90000000-0000-0000-0000-000000000002', 'Recepción', 'recep9@havana.test', 'reception')
on conflict (id) do nothing;
insert into public.customers (id, name, phone) values ('h1', 'Cliente tarde', '4420009999');

set role authenticated;
set request.jwt.claim.sub = '90000000-0000-0000-0000-000000000002';
do $$ begin
  insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, source, after_hours)
  values ('ah1', 'h1', 'isaac', '{corte-adulto}', '2026-12-01 03:00+00', '2026-12-01 03:45+00', 45, 280, 'panel', true);
  raise exception 'FALLÓ: recepción agendó fuera de horario';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · recepción no agenda fuera de horario';
end $$;

set request.jwt.claim.sub = '90000000-0000-0000-0000-000000000001';
insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, source, after_hours)
values ('ah2', 'h1', 'isaac', '{corte-adulto}', '2026-12-01 03:00+00', '2026-12-01 03:45+00', 45, 280, 'panel', true);
reset role;
select pg_temp.check((select after_hours from public.appointments where id = 'ah2'), 'el dueño agenda fuera de horario y queda marcada');

rollback;
