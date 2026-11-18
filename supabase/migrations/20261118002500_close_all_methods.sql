-- Corte de caja with every payment method: the drawer's cash (counted), the
-- card terminal's closing total and the transfers received in the bank. Each
-- method keeps what was expected (computed here, from payments, counter sales
-- and cash moves of that day) and what was captured; any difference flags
-- the day «No cuadró» in the panel.
--
-- Closes made before this keep card/transfer as null («no se capturó»).

alter table public.daily_closes
  add column card_expected int,
  add column card_counted int check (card_counted between 0 and 10000000),
  add column card_difference int generated always as (card_counted - card_expected) stored,
  add column transfer_expected int,
  add column transfer_counted int check (transfer_counted between 0 and 10000000),
  add column transfer_difference int generated always as (transfer_counted - transfer_expected) stored;

-- What came in by one method on a day: charges (a mixed payment counts its
-- part; a single-method one its services plus products), tips paid that way
-- and counter sales. Same rule the panel shows (src/admin/cash.ts).
create or replace function app.day_in_by_method(p_date date, p_method text) returns int
language sql stable security definer set search_path = public as $$
  with tz as (select time_zone from public.settings where id = 1)
  select (
    coalesce((
      select sum(
        case when p.splits is not null then
          coalesce((select sum((x ->> 'amount')::int) from jsonb_array_elements(p.splits) x where x ->> 'method' = p_method), 0)
        when p.method = p_method then
          p.amount + coalesce((select sum((x ->> 'price')::int * (x ->> 'qty')::int)
                               from jsonb_array_elements(coalesce(p.products, '[]'::jsonb)) x), 0)
        else 0 end
        + case when p.tip_method = p_method then p.tip else 0 end
      ) from public.payments p, tz where (p.paid_at at time zone tz.time_zone)::date = p_date
    ), 0)
    + coalesce((
      select sum(s.total) from public.product_sales s, tz
      where s.method = p_method and (s.at at time zone tz.time_zone)::date = p_date
    ), 0)
  )::int
$$;
revoke all on function app.day_in_by_method(date, text) from public, anon, authenticated;

create or replace function public.close_day(
  p_date date,
  p_opening_fund int,
  p_counted int,
  p_card_counted int,
  p_transfer_counted int,
  p_note text
) returns public.daily_closes
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  r public.daily_closes;
begin
  if not app.is_desk() then raise exception 'Tu rol no permite cerrar la caja.'; end if;
  if exists (select 1 from public.daily_closes where date = p_date) then
    raise exception 'La caja de ese día ya está cerrada. Reábrela para hacer cambios.';
  end if;
  if p_opening_fund is null or p_opening_fund < 0 or p_opening_fund > 1000000 then raise exception 'Revisa el fondo inicial.'; end if;
  if p_counted is null or p_counted < 0 or p_counted > 1000000 then raise exception 'Revisa el efectivo contado.'; end if;
  if p_card_counted is null or p_card_counted < 0 or p_card_counted > 10000000 then
    raise exception 'Escribe el total del cierre de la terminal (0 si no hubo pagos con tarjeta).';
  end if;
  if p_transfer_counted is null or p_transfer_counted < 0 or p_transfer_counted > 10000000 then
    raise exception 'Escribe el total de transferencias recibidas (0 si no hubo).';
  end if;
  select name into v_name from public.profiles where id = auth.uid();
  insert into public.daily_closes (
    date, opening_fund, expected, counted,
    card_expected, card_counted, transfer_expected, transfer_counted,
    note, closed_by_name, closed_by
  ) values (
    p_date, p_opening_fund,
    p_opening_fund + app.day_in_by_method(p_date, 'cash')
      + coalesce((select sum(case when kind = 'in' then amount else -amount end) from public.cash_moves where date = p_date), 0),
    p_counted,
    app.day_in_by_method(p_date, 'card'), p_card_counted,
    app.day_in_by_method(p_date, 'transfer'), p_transfer_counted,
    coalesce(trim(p_note), ''), coalesce(v_name, 'Panel'), auth.uid()
  )
  returning * into r;
  return r;
end $$;
revoke all on function public.close_day(date, int, int, int, int, text) from public, anon;
grant execute on function public.close_day(date, int, int, int, int, text) to authenticated;
