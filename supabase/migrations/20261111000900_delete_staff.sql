-- Remove a barber from the shop. Without history (no appointments, sales,
-- advances or payroll payments) and without a panel user, the barber is
-- deleted completely. With history, the barber is archived: hidden from
-- Equipo, the site and the booking, while past reports and payroll still add up.
-- Either way, upcoming appointments must be moved or cancelled first.

alter table public.staff add column archived_at timestamptz;

create or replace function public.delete_staff(p_id text) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  upcoming int;
  history boolean;
begin
  if not app.is_finance() then
    raise exception 'Tu rol no permite eliminar barberos.';
  end if;
  if not exists (select 1 from public.staff where id = p_id) then
    raise exception 'No encontramos ese barbero.';
  end if;

  select count(*) into upcoming from public.appointments
  where staff_id = p_id and status in ('booked', 'confirmed') and ends_at > now();
  if upcoming > 0 then
    raise exception 'Tiene % cita(s) próxima(s). Muévelas a otro barbero o cancélalas antes de eliminarlo.', upcoming;
  end if;

  history := exists (select 1 from public.appointments where staff_id = p_id)
          or exists (select 1 from public.product_sales where staff_id = p_id)
          or exists (select 1 from public.advances where staff_id = p_id)
          or exists (select 1 from public.payroll_payments where staff_id = p_id)
          or exists (select 1 from public.profiles where staff_id = p_id);

  if history then
    update public.staff set active = false, archived_at = now() where id = p_id;
    -- Their panel access ends too.
    update public.profiles set active = false where staff_id = p_id;
    return 'archived';
  end if;

  delete from public.staff where id = p_id; -- schedule, services, commissions, time off and contact go with it
  return 'deleted';
end $$;
revoke all on function public.delete_staff(text) from public, anon;
grant execute on function public.delete_staff(text) to authenticated;
