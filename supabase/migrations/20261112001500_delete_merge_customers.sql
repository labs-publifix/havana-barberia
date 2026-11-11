-- Remove duplicate customers from the panel (owner, developer and manager).
-- Without appointments a customer is deleted with their stamps card and invites.
-- With appointments it is merged into the right record: appointments move,
-- stamps add up (never past the goal), the card links keep working, missing
-- contact data is filled in, and the duplicate is deleted.

create or replace function public.delete_customer(p_id text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_finance() then raise exception 'Tu rol no permite eliminar clientes.'; end if;
  if not exists (select 1 from public.customers where id = p_id) then raise exception 'No encontramos ese cliente.'; end if;
  if exists (select 1 from public.appointments where customer_id = p_id) then
    raise exception 'Este cliente tiene citas: únelo con el registro correcto para no perder su historial.';
  end if;
  delete from public.customers where id = p_id; -- stamps card, invites and queued e-mails go with it
end $$;
revoke all on function public.delete_customer(text) from public, anon;
grant execute on function public.delete_customer(text) to authenticated;

create or replace function public.merge_customers(p_from text, p_into text) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  src public.customers;
  dst public.customers;
  src_card public.loyalty_cards;
  dst_card public.loyalty_cards;
  validity int;
  total int;
begin
  if not app.is_finance() then raise exception 'Tu rol no permite unir clientes.'; end if;
  if p_from = p_into then raise exception 'Elige otro cliente para unir.'; end if;
  select * into src from public.customers where id = p_from for update;
  select * into dst from public.customers where id = p_into for update;
  if src.id is null or dst.id is null then raise exception 'No encontramos ese cliente.'; end if;

  -- Stamps: one card for the person, adding both (never past the goal).
  select * into src_card from public.loyalty_cards where customer_id = p_from;
  select * into dst_card from public.loyalty_cards where customer_id = p_into;
  if src_card.token is not null and dst_card.token is null then
    update public.loyalty_cards set customer_id = p_into where token = src_card.token;
  elsif src_card.token is not null then
    select reward_validity_days into validity from public.settings where id = 1;
    total := least(dst_card.goal, dst_card.stamps + src_card.stamps);
    update public.loyalty_cards set
      stamps = total,
      reward_expires_at = case
        when total >= goal then coalesce(
          greatest(dst_card.reward_expires_at, src_card.reward_expires_at),
          ((now() at time zone 'America/Mexico_City')::date + validity + time '23:59') at time zone 'America/Mexico_City')
        else null end
    where token = dst_card.token;
    update public.appointments set loyalty_token = dst_card.token where loyalty_token = src_card.token;
    delete from public.loyalty_cards where token = src_card.token;
  end if;

  -- History and pending items move to the right record.
  update public.appointments set customer_id = p_into where customer_id = p_from;
  update public.customer_invites set customer_id = p_into where customer_id = p_from;
  update public.email_outbox set customer_id = p_into where customer_id = p_from;

  -- Contact data the right record lacks (phone and e-mail are unique: free them first).
  update public.customers set phone = '', email = '' where id = p_from;
  update public.customers set
    phone = case when dst.phone = '' then src.phone else dst.phone end,
    email = case when dst.email = '' then src.email else dst.email end,
    marketing_opt_out = dst.marketing_opt_out or src.marketing_opt_out,
    notes = trim(both from concat_ws(E'\n', nullif(dst.notes, ''), 'Unido con «' || src.name || '»'
      || case when src.notes <> '' then ': ' || src.notes else '' end))
  where id = p_into;

  delete from public.customers where id = p_from;
end $$;
revoke all on function public.merge_customers(text, text) from public, anon;
grant execute on function public.merge_customers(text, text) to authenticated;
