-- A counter sale always records who sold it (their product commission and
-- product goal depend on it).
create or replace function public.record_sale(p_items jsonb, p_staff_id text, p_method text)
returns public.product_sales
language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_p record;
  r public.product_sales;
begin
  if not app.is_desk() then raise exception 'Tu rol no permite registrar ventas.'; end if;
  if p_method is null or p_method not in ('cash', 'card', 'transfer') then raise exception 'Elige cómo pagó.'; end if;
  if p_staff_id is null or p_staff_id = '' then raise exception 'Elige quién lo vendió.'; end if;
  if not exists (select 1 from public.staff where id = p_staff_id) then
    raise exception 'No encontramos ese barbero.';
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    continue when coalesce((v_item ->> 'qty')::int, 0) <= 0;
    if (v_item ->> 'qty')::int > 99 then raise exception 'Revisa las cantidades.'; end if;
    select p.id, p.name, p.price, c.commission into v_p
      from public.products p left join public.product_costs c on c.product_id = p.id
      where p.id = v_item ->> 'productId' and p.active;
    if not found then raise exception 'Alguno de los productos ya no está a la venta.'; end if;
    v_items := v_items || jsonb_build_object(
      'productId', v_p.id, 'name', v_p.name, 'qty', (v_item ->> 'qty')::int, 'price', v_p.price, 'commission', v_p.commission
    );
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'Agrega al menos un producto.'; end if;
  insert into public.product_sales (items, staff_id, method, total, created_by)
  values (
    v_items, p_staff_id, p_method,
    (select sum((x ->> 'price')::int * (x ->> 'qty')::int) from jsonb_array_elements(v_items) x),
    auth.uid()
  ) returning * into r;
  return r;
end $$;
revoke all on function public.record_sale(jsonb, text, text) from public, anon;
grant execute on function public.record_sale(jsonb, text, text) to authenticated;
