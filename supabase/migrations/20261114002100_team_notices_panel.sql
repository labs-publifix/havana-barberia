-- Notices to the barber for every appointment, not only online ones: the shop
-- books many by phone or WhatsApp from the panel and the barber never heard of
-- them. Walk-ins (already in the chair) don't notify, and neither does what the
-- barber books or cancels on their own agenda. Moving an appointment to another
-- barber tells the new one.

create or replace function app.appointment_emails() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  active_before boolean := tg_op = 'UPDATE' and old.status in ('booked', 'confirmed');
  active_now boolean := new.status in ('booked', 'confirmed');
  at text := extract(epoch from new.starts_at)::bigint::text;
  -- The barber themself made the change (from the panel, signed in as them).
  by_barber boolean := app.my_staff_id() is not null and app.my_staff_id() = new.staff_id;
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
      if not by_barber then perform app.queue_email('team_new', new.id, 'team_new:' || new.id); end if;
    end if;
  elsif active_before and new.status = 'cancelled' then
    perform app.queue_email('cancellation', new.id, 'cancellation:' || new.id);
    if not by_barber then perform app.queue_email('team_cancel', new.id, 'team_cancel:' || new.id); end if;
  elsif active_before and active_now and (new.starts_at <> old.starts_at or new.staff_id <> old.staff_id) then
    perform app.queue_email('reschedule', new.id, 'reschedule:' || new.id || ':' || at || ':' || new.staff_id);
    if new.staff_id <> old.staff_id and not by_barber then
      perform app.queue_email('team_new', new.id, 'team_new:' || new.id || ':' || new.staff_id);
    end if;
  end if;
  return null;
end $$;
