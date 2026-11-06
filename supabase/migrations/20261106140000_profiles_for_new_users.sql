-- Everyone who signs up gets a profiles row, so their job Profile, notes and documents can be
-- made. Before this, only people added by hand had one, and new sign-ups saw "Your profile
-- could not be loaded".

create or replace function public.make_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, name, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New member'), 200),
    new.email
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.make_profile_for_new_user() from public, anon, authenticated;

create trigger make_profile_after_sign_up
  after insert on auth.users
  for each row execute function public.make_profile_for_new_user();

-- People who signed up before this change.
insert into public.profiles (user_id, name, email)
select u.id,
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(u.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'New member'), 200),
  u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id);
