-- «Completar y cobrar» works at any time, also before the appointment starts
-- (the shop asked to charge whenever the customer pays). Same function as in
-- 20261110000400_charging.sql without the «only once it started» check.
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

  return jsonb_build_object('stampAdded', v_stamp_added);
end $$;
revoke all on function public.complete_appointment(text, jsonb) from public, anon;
grant execute on function public.complete_appointment(text, jsonb) to authenticated;
