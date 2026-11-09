-- The first person in the system becomes the owner (bootstrap). Public sign-up
-- is off, so the only way in is an invitation: the first one is sent from the
-- Supabase dashboard (Authentication › Users › Invite user); after that the
-- owner invites everyone else from the panel (Edge Function invite-user, which
-- writes their profile with the chosen role).
create or replace function app.first_user_is_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles) then
    insert into public.profiles (id, name, email, role)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Dueño'),
      lower(new.email),
      'owner'
    );
  end if;
  return new;
end $$;

create trigger on_auth_user_created_first_owner
  after insert on auth.users
  for each row execute function app.first_user_is_owner();
