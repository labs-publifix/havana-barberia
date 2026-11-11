-- E-mail outbox, reminders and photo uploads, run in a transaction that is rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', what; end if;
  raise notice 'ok · %', what;
end $$;
create function pg_temp.queued(p_appt text) returns text language sql as $$
  select coalesce(string_agg(kind, ',' order by id), '') from public.email_outbox where appointment_id = p_appt
$$;

insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000001', 'dueno@havana.test');
insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000002', 'recepcion@havana.test');
insert into public.profiles (id, name, email, role) values ('20000000-0000-0000-0000-000000000002', 'Recepción', 'recepcion@havana.test', 'reception');
insert into public.customers (id, name, phone, email) values ('e1', 'Ana Ríos', '4421112233', 'ana@cliente.test');

-- Panel booking: confirmation. Online: confirmation and a notice to the barber. Walk-in: nothing.
insert into public.appointments (id, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, source, created_at) values
  ('m1', 'e1', 'isaac', '{corte-adulto}', now() + interval '23 hours', now() + interval '23 hours 45 minutes', 45, 280, 'panel', now() - interval '3 days'),
  ('m2', 'e1', 'leonardo', '{corte-adulto}', now() + interval '90 minutes', now() + interval '135 minutes', 45, 280, 'online', now() - interval '2 days'),
  ('m3', 'e1', 'isaac', '{corte-adulto}', now() + interval '10 minutes', now() + interval '55 minutes', 45, 280, 'walk_in', now());
select pg_temp.check(pg_temp.queued('m1') = 'confirmation', 'cita del panel: confirmación');
select pg_temp.check(pg_temp.queued('m2') = 'confirmation,team_new', 'cita en línea: confirmación y aviso al barbero');
select pg_temp.check(pg_temp.queued('m3') = '', 'cliente sin cita: sin correo');

-- Reminders, once per appointment and time.
select app.queue_reminders();
select app.queue_reminders();
select pg_temp.check(pg_temp.queued('m1') = 'confirmation,reminder_24h', 'recordatorio de un día antes, una sola vez');
select pg_temp.check(pg_temp.queued('m2') = 'confirmation,team_new,reminder_2h', 'recordatorio de dos horas antes');

-- Changing the time notifies; cancelling notifies (and the barber, if it was online).
update public.appointments set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = 'm1';
select pg_temp.check(pg_temp.queued('m1') = 'confirmation,reminder_24h,reschedule', 'cambio de horario: aviso');
update public.appointments set status = 'cancelled' where id = 'm2';
select pg_temp.check(pg_temp.queued('m2') = 'confirmation,team_new,reminder_2h,cancellation,team_cancel', 'cancelación: aviso al cliente y al barbero');
update public.appointments set notes = 'Trae foto' where id = 'm1';
select pg_temp.check(pg_temp.queued('m1') = 'confirmation,reminder_24h,reschedule', 'cambiar notas no manda correo');

-- Charging the visit queues "Gracias por tu visita" once (walk-ins too).
update public.appointments set status = 'completed' where id = 'm3';
update public.appointments set notes = 'otra vez' where id = 'm3';
select pg_temp.check(pg_temp.queued('m3') = 'thank_you', 'al cobrar: gracias por tu visita, una sola vez');

-- The sender takes a batch once.
select pg_temp.check((select count(*) from public.claim_emails(50)) = 9, 'el envío toma los pendientes');
select pg_temp.check((select count(*) from public.claim_emails(50)) = 0, 'y no los toma dos veces');

-- Who can see and do what.
select pg_temp.check(
  not has_function_privilege('anon', 'public.claim_emails(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_emails(int)', 'execute'),
  'solo el servidor toma correos para enviar'
);
set role authenticated;
set request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
select pg_temp.check((select count(*) from public.email_outbox) = 0, 'recepción no ve los correos enviados');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('photos', 'products/x.webp');
  raise exception 'FALLÓ: recepción subió una foto';
exception when insufficient_privilege then raise notice 'ok · recepción no sube fotos';
end $$;
set request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from public.email_outbox) > 0, 'el dueño ve los correos enviados');
insert into storage.objects (bucket_id, name) values ('photos', 'products/x.webp');
select pg_temp.check(true, 'el dueño sube fotos');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('otro', 'x.webp');
  raise exception 'FALLÓ: subió a otro bucket';
exception when insufficient_privilege then raise notice 'ok · solo en el bucket de fotos';
end $$;
reset role;
select pg_temp.check((select public from storage.buckets where id = 'photos'), 'las fotos se ven por su URL');
select app.mailer_tick();
select pg_temp.check(true, 'el aviso al enviador no falla sin configuración');

rollback;
