-- "Gracias por tu visita": an e-mail when the visit is charged (ticket, stamps
-- card and a Google review button). Walk-ins get it too when they left an e-mail.
-- The review link is Leo's own (Perfil de Negocio › Pedir reseñas), set in
-- Ajustes › Correos; empty means the Google Maps profile.

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'confirmation', 'reschedule', 'cancellation', 'reminder_24h', 'reminder_2h', 'team_new', 'team_cancel', 'thank_you'
));

alter table public.settings
  add column google_review_url text not null default ''
  check (google_review_url = '' or google_review_url ~ '^https://');

create or replace function app.appointment_emails() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  active_before boolean := tg_op = 'UPDATE' and old.status in ('booked', 'confirmed');
  active_now boolean := new.status in ('booked', 'confirmed');
  at text := extract(epoch from new.starts_at)::bigint::text;
begin
  -- Charged: thanks, ticket and stamps (any source, walk-ins included).
  if tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from 'completed' then
    perform app.queue_email('thank_you', new.id, 'thank_you:' || new.id);
    return null;
  end if;
  if new.source = 'walk_in' then return null; end if;
  if tg_op = 'INSERT' then
    if active_now then
      perform app.queue_email('confirmation', new.id, 'confirmation:' || new.id);
      if new.source = 'online' then perform app.queue_email('team_new', new.id, 'team_new:' || new.id); end if;
    end if;
  elsif active_before and new.status = 'cancelled' then
    perform app.queue_email('cancellation', new.id, 'cancellation:' || new.id);
    if new.source = 'online' then perform app.queue_email('team_cancel', new.id, 'team_cancel:' || new.id); end if;
  elsif active_before and active_now and (new.starts_at <> old.starts_at or new.staff_id <> old.staff_id) then
    perform app.queue_email('reschedule', new.id, 'reschedule:' || new.id || ':' || at || ':' || new.staff_id);
  end if;
  return null;
end $$;
