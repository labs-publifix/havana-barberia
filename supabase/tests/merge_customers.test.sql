-- Deleting and merging customers. Rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;

insert into auth.users (id, email) values ('80000000-0000-0000-0000-000000000001', 'dueno8@havana.test');
insert into auth.users (id, email) values ('80000000-0000-0000-0000-000000000002', 'recep8@havana.test');
insert into public.profiles (id, name, email, role) values
  ('80000000-0000-0000-0000-000000000001', 'Dueño', 'dueno8@havana.test', 'owner'),
  ('80000000-0000-0000-0000-000000000002', 'Recepción', 'recep8@havana.test', 'reception')
on conflict (id) do nothing;

insert into public.customers (id, name, phone, email, notes) values
  ('k1', 'Pepe Bermúdez', '4429990001', '', ''),
  ('d1', 'José Bermudez', '', 'pepe@dup.test', 'Prefiere fade'),
  ('solo', 'Duplicado sin citas', '', 'solo@dup.test', '');
insert into public.loyalty_cards (token, customer_id, stamps, goal) values
  ('tokkeep0000000000000000', 'k1', 6, 10),
  ('tokdupl0000000000000000', 'd1', 7, 10);
insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, status, loyalty_token) values
  ('ma1', 'k1', 'isaac', '{corte-adulto}', now() - interval '20 days', now() - interval '20 days' + interval '45 minutes', 45, 280, 'completed', 'tokkeep0000000000000000'),
  ('ma2', 'd1', 'isaac', '{corte-adulto}', now() - interval '10 days', now() - interval '10 days' + interval '45 minutes', 45, 280, 'completed', 'tokdupl0000000000000000');
insert into public.customer_invites (customer_id, kind, channel) values ('d1', 'winback', 'whatsapp');

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-0000-0000-000000000002';
do $$ begin
  perform public.delete_customer('solo');
  raise exception 'FALLÓ: recepción eliminó un cliente';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · recepción no elimina clientes';
end $$;

set request.jwt.claim.sub = '80000000-0000-0000-0000-000000000001';
select public.delete_customer('solo');
select pg_temp.check(not exists (select 1 from public.customers where id = 'solo'), 'sin citas se elimina por completo');
do $$ begin
  perform public.delete_customer('d1');
  raise exception 'FALLÓ: eliminó un cliente con citas';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok · con citas pide unirlo en lugar de borrar';
end $$;

select public.merge_customers('d1', 'k1');
reset role;
select pg_temp.check(not exists (select 1 from public.customers where id = 'd1'), 'el duplicado ya no existe');
select pg_temp.check((select count(*) from public.appointments where customer_id = 'k1') = 2, 'sus citas pasan al cliente correcto');
select pg_temp.check(
  (select stamps = 10 and reward_expires_at is not null from public.loyalty_cards where customer_id = 'k1'),
  'los sellos se suman sin pasar del tope (y se gana el corte gratis)'
);
select pg_temp.check(not exists (select 1 from public.loyalty_cards where token = 'tokdupl0000000000000000'), 'queda una sola tarjeta');
select pg_temp.check((select loyalty_token from public.appointments where id = 'ma2') = 'tokkeep0000000000000000', 'los enlaces de su tarjeta siguen funcionando');
select pg_temp.check(
  (select phone = '4429990001' and email = 'pepe@dup.test' and notes like '%Unido con «José Bermudez»: Prefiere fade%' from public.customers where id = 'k1'),
  'conserva el teléfono, completa el correo y guarda una nota'
);
select pg_temp.check((select count(*) from public.customer_invites where customer_id = 'k1') = 1, 'el historial de invitaciones también pasa');

rollback;
