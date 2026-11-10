-- Who else hears about each online booking and cancellation (e.g. the owner),
-- besides the appointment's barber. Edited in Ajustes › Correos.
alter table public.settings
  add column team_emails text[] not null default '{}'
  check (cardinality(team_emails) <= 5);
