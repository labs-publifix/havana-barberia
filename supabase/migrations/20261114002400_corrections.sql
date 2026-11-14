-- Corrections, owner and developer only, always with a reason (audit log):
--   · edit_appointment: services, customer and notes of an appointment not yet charged.
--   · void_payment / correct_payment: undo a charge (stamps and free cut back as they
--     were) or replace it, keeping its original time.
--   · void_sale / correct_sale: a counter sale.
-- A closed cash day or payroll week must be reopened first, so nothing changes
-- behind a count or a payroll already made.

alter table public.payments
  add column stamp_added boolean,
  add column loyalty_before jsonb,
  add column corrected_at timestamptz,
  add column corrected_by_name text,
  add column correction_reason text;
alter table public.product_sales
  add column corrected_at timestamptz,
  add column corrected_by_name text,
  add column correction_reason text;

-- Refuse when the cash day of `p_at` or the payroll week of `p_day` is closed.
create or replace function app.assert_unclosed(p_at timestamptz, p_day date) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  tz text;
  wsd int;
  d date;
  ws date;
begin
  select time_zone, week_start_day into tz, wsd from public.settings where id = 1;
  d := (p_at at time zone tz)::date;
  if exists (select 1 from public.daily_closes where date = d) then
    raise exception 'La caja del % ya está cerrada. Reábrela en Ventas › Caja del día para corregir.', to_char(d, 'DD/MM/YYYY');
  end if;
  ws := p_day - ((extract(dow from p_day)::int - wsd + 7) % 7);
  if exists (select 1 from public.payroll_closes where week_start = ws) then
    raise exception 'La semana de nómina del % ya está cerrada. Reábrela en Cierre y nómina para corregir.', to_char(ws, 'DD/MM/YYYY');
  end if;
end $$;

create or replace function app.my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.profiles where id = auth.uid()), 'Panel')
$$;

-- Undo a charge: card back as it was, payment removed, appointment open again.
create or replace function app.undo_charge(p_id text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  a public.appointments;
  p public.payments;
  eligible boolean;
begin
  select * into a from public.appointments where id = p_id for update;
  select * into p from public.payments where appointment_id = p_id for update;
  if p.reward_amount is not null then
    -- The free cut was redeemed: the card gets its full stamps (and deadline) back.
    update public.loyalty_cards set
      stamps = coalesce((p.loyalty_before ->> 'stamps')::int, goal),
      reward_expires_at = coalesce((p.loyalty_before ->> 'rewardExpiresAt')::timestamptz, now() + interval '30 days')
    where customer_id = a.customer_id;
  else
    select exists (select 1 from public.services where id = any (a.service_ids) and loyalty_eligible) into eligible;
    if coalesce(p.stamp_added, eligible) then
      update public.loyalty_cards set
        stamps = greatest(stamps - 1, 0),
        reward_expires_at = case when stamps - 1 < goal then null else reward_expires_at end
      where customer_id = a.customer_id;
    end if;
  end if;
  delete from public.payments where appointment_id = p_id;
  update public.appointments set status = 'confirmed' where id = p_id;
  return to_jsonb(p);
end $$;

create or replace function public.void_payment(p_id text, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  a public.appointments;
  p public.payments;
  before jsonb;
begin
  if not app.is_owner() then raise exception 'Solo el dueño o el desarrollador pueden anular un cobro.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Escribe el motivo.'; end if;
  select * into a from public.appointments where id = p_id for update;
  if not found or a.status <> 'completed' then raise exception 'Esta cita no está cobrada.'; end if;
  select * into p from public.payments where appointment_id = p_id;
  if not found then raise exception 'Esta cita no tiene cobro registrado.'; end if;
  perform app.assert_unclosed(p.paid_at, (a.starts_at at time zone (select time_zone from public.settings where id = 1))::date);
  before := app.undo_charge(p_id);
  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (auth.uid(), 'void', 'payments', p_id, jsonb_build_object('reason', trim(p_reason), 'by', app.my_name(), 'before', before));
end $$;

create or replace function public.correct_payment(p_id text, p_payment jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  a public.appointments;
  p public.payments;
  before jsonb;
  v_ids text[];
  result jsonb;
begin
  if not app.is_owner() then raise exception 'Solo el dueño o el desarrollador pueden corregir un cobro.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Escribe el motivo de la corrección.'; end if;
  select * into a from public.appointments where id = p_id for update;
  if not found or a.status <> 'completed' then raise exception 'Esta cita no está cobrada.'; end if;
  select * into p from public.payments where appointment_id = p_id;
  if not found then raise exception 'Esta cita no tiene cobro registrado.'; end if;
  perform app.assert_unclosed(p.paid_at, (a.starts_at at time zone (select time_zone from public.settings where id = 1))::date);
  before := app.undo_charge(p_id);

  -- The services charged (repeats allowed); a changed list is priced from the catalog.
  if jsonb_typeof(p_payment -> 'serviceIds') = 'array' then
    select coalesce(array_agg(x order by n), '{}') into v_ids
      from jsonb_array_elements_text(p_payment -> 'serviceIds') with ordinality t(x, n);
    if cardinality(v_ids) = 0 then raise exception 'Deja al menos un servicio.'; end if;
    if cardinality(v_ids) > 20 then raise exception 'Revisa los servicios.'; end if;
    if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.services v where v.id = x)) then
      raise exception 'Alguno de los servicios ya no existe.';
    end if;
    if v_ids is distinct from a.service_ids then
      update public.appointments set
        service_ids = v_ids,
        total_price = (select coalesce(sum(v.price), 0) from unnest(v_ids) x join public.services v on v.id = x)
      where id = p_id;
    end if;
  end if;

  result := public.complete_appointment(p_id, (p_payment - 'serviceIds') - 'addServices');
  -- The corrected charge keeps the original time (same cash day) and says who fixed it and why.
  update public.payments set
    paid_at = p.paid_at,
    charged_by = p.charged_by,
    corrected_at = now(),
    corrected_by_name = app.my_name(),
    correction_reason = trim(p_reason)
  where appointment_id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (auth.uid(), 'correct', 'payments', p_id, jsonb_build_object(
    'reason', trim(p_reason), 'by', app.my_name(), 'before', before,
    'after', (select to_jsonb(x) from public.payments x where appointment_id = p_id)
  ));
  return result;
end $$;

-- Services, customer and notes of an appointment that is not charged yet.
create or replace function public.edit_appointment(p_id text, p_service_ids text[], p_customer_id text, p_notes text)
returns void
language plpgsql security definer set search_path = public, app as $$
declare
  a public.appointments;
  v_dur int;
  v_total int;
begin
  if not app.is_owner() then raise exception 'Solo el dueño o el desarrollador pueden editar una cita.'; end if;
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'No encontramos esa cita.'; end if;
  if a.status not in ('booked', 'confirmed') then raise exception 'Esta cita ya está cerrada; para un cobro usa «Corregir cobro».'; end if;
  if coalesce(cardinality(p_service_ids), 0) = 0 then raise exception 'Elige al menos un servicio.'; end if;
  if cardinality(p_service_ids) > 20 then raise exception 'Revisa los servicios.'; end if;
  if exists (select 1 from unnest(p_service_ids) x where not exists (select 1 from public.services v where v.id = x and v.active)) then
    raise exception 'Alguno de los servicios ya no está disponible.';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then raise exception 'No encontramos ese cliente.'; end if;
  select coalesce(sum(v.duration_min), 0), coalesce(sum(v.price), 0) into v_dur, v_total
    from unnest(p_service_ids) x join public.services v on v.id = x;
  update public.appointments set
    service_ids = p_service_ids,
    duration_min = v_dur,
    ends_at = starts_at + make_interval(mins => v_dur),
    total_price = v_total,
    customer_id = p_customer_id,
    loyalty_token = case when p_customer_id = a.customer_id then loyalty_token
      else (select token from public.loyalty_cards where customer_id = p_customer_id) end,
    notes = coalesce(trim(p_notes), '')
  where id = p_id;
end $$;

create or replace function public.void_sale(p_id text, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
declare r public.product_sales;
begin
  if not app.is_owner() then raise exception 'Solo el dueño o el desarrollador pueden anular una venta.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Escribe el motivo.'; end if;
  select * into r from public.product_sales where id = p_id for update;
  if not found then raise exception 'No encontramos esa venta.'; end if;
  perform app.assert_unclosed(r.at, (r.at at time zone (select time_zone from public.settings where id = 1))::date);
  delete from public.product_sales where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (auth.uid(), 'void', 'product_sales', p_id, jsonb_build_object('reason', trim(p_reason), 'by', app.my_name(), 'before', to_jsonb(r)));
end $$;

create or replace function public.correct_sale(p_id text, p_items jsonb, p_staff_id text, p_method text, p_reason text)
returns public.product_sales
language plpgsql security definer set search_path = public, app as $$
declare
  r public.product_sales;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_p record;
begin
  if not app.is_owner() then raise exception 'Solo el dueño o el desarrollador pueden corregir una venta.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Escribe el motivo de la corrección.'; end if;
  select * into r from public.product_sales where id = p_id for update;
  if not found then raise exception 'No encontramos esa venta.'; end if;
  perform app.assert_unclosed(r.at, (r.at at time zone (select time_zone from public.settings where id = 1))::date);
  if p_method is null or p_method not in ('cash', 'card', 'transfer') then raise exception 'Elige cómo pagó.'; end if;
  if p_staff_id is null or p_staff_id = '' then raise exception 'Elige quién lo vendió.'; end if;
  if not exists (select 1 from public.staff where id = p_staff_id) then raise exception 'No encontramos ese barbero.'; end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    continue when coalesce((v_item ->> 'qty')::int, 0) <= 0;
    if (v_item ->> 'qty')::int > 99 then raise exception 'Revisa las cantidades.'; end if;
    select p.id, p.name, p.price, c.commission into v_p
      from public.products p left join public.product_costs c on c.product_id = p.id
      where p.id = v_item ->> 'productId';
    if not found then raise exception 'Alguno de los productos ya no existe.'; end if;
    v_items := v_items || jsonb_build_object(
      'productId', v_p.id, 'name', v_p.name, 'qty', (v_item ->> 'qty')::int, 'price', v_p.price, 'commission', v_p.commission
    );
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'Deja al menos un producto o anula la venta.'; end if;
  update public.product_sales set
    items = v_items,
    staff_id = p_staff_id,
    method = p_method,
    total = (select sum((x ->> 'price')::int * (x ->> 'qty')::int) from jsonb_array_elements(v_items) x),
    corrected_at = now(),
    corrected_by_name = app.my_name(),
    correction_reason = trim(p_reason)
  where id = p_id
  returning * into r;
  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (auth.uid(), 'correct', 'product_sales', p_id, jsonb_build_object('reason', trim(p_reason), 'by', app.my_name(), 'after', to_jsonb(r)));
  return r;
end $$;

revoke all on function public.void_payment(text, text) from public, anon;
revoke all on function public.correct_payment(text, jsonb, text) from public, anon;
revoke all on function public.edit_appointment(text, text[], text, text) from public, anon;
revoke all on function public.void_sale(text, text) from public, anon;
revoke all on function public.correct_sale(text, jsonb, text, text, text) from public, anon;
grant execute on function public.void_payment(text, text) to authenticated;
grant execute on function public.correct_payment(text, jsonb, text) to authenticated;
grant execute on function public.edit_appointment(text, text[], text, text) to authenticated;
grant execute on function public.void_sale(text, text) to authenticated;
grant execute on function public.correct_sale(text, jsonb, text, text, text) to authenticated;
revoke all on function app.undo_charge(text) from public, anon, authenticated;

-- complete_appointment records what the charge did to the stamps card (same function as
-- in 20261114002300 plus that last update), so undo_charge can revert it.
create or replace function public.complete_appointment(p_id text, p_payment jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
  s public.settings;
  card public.loyalty_cards;
  methods text[] := array['cash', 'card', 'transfer'];
  v_method text := p_payment ->> 'method';
  v_tip int := coalesce((p_payment ->> 'tip')::int, 0);
  v_tip_method text := coalesce(p_payment ->> 'tipMethod', p_payment ->> 'method');
  v_amount int;
  v_reward_service text;
  v_reward_amount int;
  v_haircut int;
  v_discount jsonb;
  v_d_amount int;
  v_approval public.discount_approvals;
  v_by uuid;
  v_by_name text;
  v_products jsonb := '[]'::jsonb;
  v_item jsonb;
  v_p record;
  v_charge int;
  v_splits jsonb;
  v_split_sum int;
  v_stamp_added boolean := false;
  v_eligible boolean;
  v_reward_used boolean := coalesce((p_payment ->> 'useReward')::boolean, false);
  v_add text[];
begin
  select * into a from public.appointments where id = p_id for update;
  if not found then raise exception 'No encontramos esa cita.'; end if;
  if not (app.is_desk() or a.staff_id = app.my_staff_id()) then
    raise exception 'Tu rol no permite cobrar esta cita.';
  end if;
  if a.status not in ('booked', 'confirmed') then raise exception 'Esta cita ya está cerrada.'; end if;
  if v_method is null or not v_method = any (methods) then raise exception 'Elige cómo pagó.'; end if;
  if v_tip < 0 or v_tip > 100000 then raise exception 'Escribe la propina en pesos, sin centavos.'; end if;
  if v_tip > 0 and not v_tip_method = any (methods) then raise exception 'Elige cómo dejó la propina.'; end if;
  select * into s from public.settings where id = 1;

  -- Services added during the visit join the appointment at catalog price,
  -- repeats included (two haircuts = two lines and twice the price).
  if jsonb_typeof(p_payment -> 'addServices') = 'array' then
    select coalesce(array_agg(x order by n), '{}') into v_add
      from jsonb_array_elements_text(p_payment -> 'addServices') with ordinality t(x, n);
    if cardinality(v_add) > 20 then raise exception 'Revisa los servicios agregados.'; end if;
    if exists (select 1 from unnest(v_add) x where not exists (select 1 from public.services v where v.id = x and v.active)) then
      raise exception 'Alguno de los servicios ya no está disponible.';
    end if;
    if cardinality(v_add) > 0 then
      update public.appointments set
        service_ids = service_ids || v_add,
        total_price = total_price + (select coalesce(sum(v.price), 0) from unnest(v_add) x join public.services v on v.id = x)
      where id = a.id
      returning * into a;
    end if;
  end if;
  v_amount := a.total_price;

  -- Free cut: a haircut is free; on any other service it discounts a haircut's price.
  if v_reward_used then
    select * into card from public.loyalty_cards where customer_id = a.customer_id for update;
    if not found or card.stamps < card.goal or card.reward_expires_at is null or card.reward_expires_at < now() then
      raise exception 'Este cliente no tiene un corte gratis vigente.';
    end if;
    select id, price into v_reward_service, v_reward_amount from public.services
      where id = any (a.service_ids) and category_id = 'cortes' order by price desc limit 1;
    if v_reward_service is null then
      select max(price) into v_haircut from public.services where category_id = 'cortes';
      select id, least(price, v_haircut) into v_reward_service, v_reward_amount from public.services
        where id = any (a.service_ids) order by price desc limit 1;
    end if;
    if v_reward_service is null or v_reward_amount is null then
      raise exception 'No hay un servicio al que aplicar el corte gratis.';
    end if;
    v_amount := v_amount - v_reward_amount;
  end if;

  -- Discount on the services, authorized by owner or manager.
  if p_payment ? 'discount' and jsonb_typeof(p_payment -> 'discount') = 'object' then
    v_d_amount := (p_payment -> 'discount' ->> 'amount')::int;
    if v_d_amount is null or v_d_amount <= 0 then raise exception 'Escribe el descuento en pesos, sin centavos.'; end if;
    if v_d_amount > v_amount then raise exception 'El descuento no puede ser mayor a lo que se cobra.'; end if;
    if coalesce(trim(p_payment -> 'discount' ->> 'reason'), '') = '' then raise exception 'Escribe el motivo del descuento.'; end if;
    if app.is_finance() then
      v_by := auth.uid();
      select name into v_by_name from public.profiles where id = v_by;
    else
      select * into v_approval from public.discount_approvals
        where id = p_payment -> 'discount' ->> 'approvalId' and used_at is null
          and created_at > now() - interval '10 minutes' and amount = v_d_amount
        for update;
      if not found then
        raise exception 'El descuento necesita la autorización del dueño o gerente.';
      end if;
      update public.discount_approvals set used_at = now() where id = v_approval.id;
      v_by := v_approval.authorized_by;
      v_by_name := v_approval.authorized_by_name;
    end if;
    v_discount := jsonb_build_object(
      'amount', v_d_amount, 'reason', trim(p_payment -> 'discount' ->> 'reason'),
      'authorizedBy', v_by, 'authorizedByName', v_by_name
    );
    v_amount := v_amount - v_d_amount;
  end if;

  -- Products sold in the same ticket, at catalog price (commission from finance data).
  for v_item in select * from jsonb_array_elements(coalesce(p_payment -> 'products', '[]'::jsonb)) loop
    continue when coalesce((v_item ->> 'qty')::int, 0) <= 0;
    if (v_item ->> 'qty')::int > 99 then raise exception 'Revisa las cantidades.'; end if;
    select p.id, p.name, p.price, c.commission into v_p
      from public.products p left join public.product_costs c on c.product_id = p.id
      where p.id = v_item ->> 'productId' and p.active;
    if not found then raise exception 'Alguno de los productos ya no está a la venta.'; end if;
    v_products := v_products || jsonb_build_object(
      'productId', v_p.id, 'name', v_p.name, 'qty', (v_item ->> 'qty')::int, 'price', v_p.price, 'commission', v_p.commission
    );
  end loop;
  v_charge := v_amount + coalesce((select sum((x ->> 'price')::int * (x ->> 'qty')::int) from jsonb_array_elements(v_products) x), 0);

  -- Mixed payment: at least two methods, each once, adding up to the charge.
  if jsonb_typeof(p_payment -> 'splits') = 'array' and jsonb_array_length(p_payment -> 'splits') > 0 then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_splits
      from jsonb_array_elements(p_payment -> 'splits') x where (x ->> 'amount')::int > 0;
    if jsonb_array_length(v_splits) < 2 then raise exception 'Un pago mixto necesita al menos dos formas de pago.'; end if;
    if (select count(distinct x ->> 'method') from jsonb_array_elements(v_splits) x) <> jsonb_array_length(v_splits) then
      raise exception 'Usa cada forma de pago una sola vez.';
    end if;
    if exists (select 1 from jsonb_array_elements(v_splits) x where not (x ->> 'method') = any (methods)) then
      raise exception 'Revisa los montos del pago mixto.';
    end if;
    select sum((x ->> 'amount')::int) into v_split_sum from jsonb_array_elements(v_splits) x;
    if v_split_sum <> v_charge then raise exception 'El pago mixto debe sumar % pesos.', v_charge; end if;
    select x ->> 'method' into v_method from jsonb_array_elements(v_splits) x order by (x ->> 'amount')::int desc limit 1;
  end if;

  insert into public.payments (
    appointment_id, method, amount, tip, tip_method, reward_service_id, reward_amount, splits, products, discount, charged_by
  ) values (
    a.id, v_method, v_amount, v_tip, case when v_tip > 0 then v_tip_method else v_method end,
    v_reward_service, v_reward_amount, v_splits,
    case when jsonb_array_length(v_products) > 0 then v_products end, v_discount, auth.uid()
  );
  update public.appointments set status = 'completed' where id = a.id;

  -- Loyalty: redeeming starts the card over (no stamp); otherwise a stamp if a service counts.
  if v_reward_used then
    update public.loyalty_cards set stamps = 0, reward_expires_at = null where token = card.token;
  else
    select exists (select 1 from public.services where id = any (a.service_ids) and loyalty_eligible) into v_eligible;
    if v_eligible then
      select * into card from public.loyalty_cards where customer_id = a.customer_id for update;
      if not found then
        insert into public.loyalty_cards (customer_id, goal) values (a.customer_id, s.loyalty_goal) returning * into card;
      end if;
      if card.stamps < card.goal then
        update public.loyalty_cards set
          stamps = stamps + 1,
          reward_expires_at = case when stamps + 1 = goal then
            ((((now() at time zone s.time_zone)::date + s.reward_validity_days)::timestamp + interval '23 hours 59 minutes') at time zone s.time_zone)
            else reward_expires_at end
        where token = card.token returning * into card;
        v_stamp_added := true;
      end if;
    end if;
  end if;
  if card.token is not null then update public.appointments set loyalty_token = card.token where id = a.id; end if;
  -- What the charge did to the card, so a correction can undo it exactly.
  update public.payments set
    stamp_added = v_stamp_added,
    loyalty_before = case when v_reward_used then jsonb_build_object('stamps', card.stamps, 'rewardExpiresAt', card.reward_expires_at) end
  where appointment_id = a.id;

  return jsonb_build_object('stampAdded', v_stamp_added);
end $$;
revoke all on function public.complete_appointment(text, jsonb) from public, anon;
grant execute on function public.complete_appointment(text, jsonb) to authenticated;
