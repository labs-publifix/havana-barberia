-- «Fuera de horario»: owner, developer or manager can book or register a
-- walk-in outside the shop's hours or the barber's shift (customers served
-- after closing). The appointment is flagged so the agenda shows it; it counts
-- like any other in cash, commissions, stamps and reports. Shop hours, shifts
-- and the online booking don't change. Overlaps with the same barber are still
-- refused by the exclusion constraint.

alter table public.appointments add column after_hours boolean not null default false;

create or replace function app.guard_after_hours() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.after_hours and (tg_op = 'INSERT' or not old.after_hours) and auth.uid() is not null and not app.is_finance() then
    raise exception 'Solo el dueño, el gerente o el desarrollador pueden agendar fuera de horario.';
  end if;
  return new;
end $$;

create trigger appointments_after_hours
  before insert or update of after_hours on public.appointments
  for each row execute function app.guard_after_hours();
