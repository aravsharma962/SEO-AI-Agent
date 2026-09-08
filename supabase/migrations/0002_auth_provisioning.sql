-- Auto-provisions a `clients` row + `client_members` (owner) row for every
-- new Supabase Auth signup, so the app never needs a manual SQL step to
-- give a new user a workspace to run audits under.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_client_id uuid;
begin
  insert into public.clients (name, owner_user_id)
  values (
    coalesce(new.raw_user_meta_data ->> 'company_name', split_part(new.email, '@', 1)),
    new.id
  )
  returning id into new_client_id;

  insert into public.client_members (client_id, user_id, role)
  values (new_client_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
