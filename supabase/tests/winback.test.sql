-- Invitations to come back. Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values ('70000000-0000-0000-0000-000000000001', 'dueno7@havana.test');
insert into auth.users (id, email) values ('70000000-0000-0000-0000-000000000002', 'isaac7@havana.test');
insert into public.profiles (id, name, email, role) values
  ('70000000-0000-0000-0000-000000000001', 'Dueño', 'dueno7@havana.test', 'owner')
on conflict (id) do nothing;
insert into public.profiles (id, name, email, role, staff_id) values
  ('70000000-0000-0000-0000-000000000002', 'Isaac', 'isaac7@havana.test', 'barber', 'isaac');
update public.settings set invite_daily_limit = 2 where id = 1;
insert into public.customers (id, name, phone, email) values
  ('w1', 'Ana Ríos', '4420000001', 'ana@w.test'),
  ('w2', 'Luis Mora', '4420000002', 'luis@w.test'),
  ('w3', 'Sin Correo', '4420000003', ''),
  ('w4', 'Beto Paz', '4420000004', 'beto@w.test'),
  ('w5', 'Carla Gil', '4420000005', 'carla@w.test');
update public.customers set marketing_opt_out = true where id = 'w5';

set role authenticated;
set request.jwt.claim.sub = '70000000-0000-0000-0000-000000000001';
create temp table r1 as select public.invite_customers(array['w1', 'w2', 'w3', 'w4', 'w5'], 'winback') as r;
select pg_temp.check((select (r ->> 'queued')::int = 2 and (r ->> 'left')::int = 0 from r1), 'respeta el cupo diario de correos');
select pg_temp.check(
  (select r -> 'skipped' @> '[{"id":"w3","reason":"sin correo"},{"id":"w4","reason":"se acabó el cupo de hoy"},{"id":"w5","reason":"pidió no recibir invitaciones"}]' from r1),
  'explica a quién no se envió y por qué'
);
reset role;
select pg_temp.check((select count(*) from public.email_outbox where kind = 'winback') = 2, 'los correos quedan en la bandeja de salida');
update public.settings set invite_daily_limit = 30 where id = 1;
set role authenticated;
set request.jwt.claim.sub = '70000000-0000-0000-0000-000000000001';
select pg_temp.check(
  (select public.invite_customers(array['w1'], 'winback') -> 'skipped' @> '[{"id":"w1","reason":"invitado hace menos de 30 días"}]'),
  'no invita dos veces en 30 días'
);
select public.log_whatsapp_invite('w3', 'winback');
select pg_temp.check((select count(*) from public.customer_invites where customer_id = 'w3' and channel = 'whatsapp') = 1, 'registra la invitación por WhatsApp');

set request.jwt.claim.sub = '70000000-0000-0000-0000-000000000002';
do $$ begin
  perform public.invite_customers(array['w4'], 'winback');
  raise exception 'FALLÓ: un barbero envió invitaciones';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · los barberos no envían invitaciones';
end $$;
reset role;

create temp table tok as select optout_token as t from public.customers where id = 'w4';
grant select on tok to anon;
set role anon;
select pg_temp.check(public.unsubscribe((select t from tok)) = 'Beto', 'el cliente se da de baja desde el enlace');
select pg_temp.check(public.unsubscribe('no-existe-este-token') is null, 'un enlace inválido no hace nada');
do $$ begin
  perform 1 from public.customer_invites;
  raise exception 'FALLÓ: el sitio leyó invitaciones';
exception when insufficient_privilege then raise notice 'ok · el sitio no lee invitaciones';
end $$;
reset role;
select pg_temp.check((select marketing_opt_out from public.customers where id = 'w4'), 'queda marcado para no invitarlo');

rollback;
