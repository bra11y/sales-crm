begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a7', 'new.person@test.local', '{"full_name":"Ada Obi"}'),
  ('00000000-0000-0000-0000-0000000000a8', 'plain@test.local', '{}');

select is((select name from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a7'), 'Ada Obi', 'a new sign-up gets a profile with their name');
select is((select name from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a8'), 'plain', 'with no name, the email''s first part is used');
select lives_ok($$insert into public.job_profiles (user_id, facts) values ('00000000-0000-0000-0000-0000000000a7', '{}')$$, 'their job Profile can now be made');
select is((select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id))::int, 0, 'nobody is left without a profile');

select * from finish();
