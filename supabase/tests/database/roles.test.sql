begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'role-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'role-member@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'role-seeker@test.local');
insert into public.profiles (user_id, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'Owner'),
  ('00000000-0000-0000-0000-0000000000e2', 'Member')
on conflict (user_id) do nothing;
insert into public.workspace_members (workspace_id, user_id, role) values
  (1, '00000000-0000-0000-0000-0000000000e1', 'owner'),
  (1, '00000000-0000-0000-0000-0000000000e2', 'member');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select is(public.my_role(), 'owner', 'the workspace owner is an owner');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select is(public.my_role(), 'member', 'a workspace member is a member');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
select is(public.my_role(), 'seeker', 'anyone else signed in is a job seeker');
select lives_ok($$insert into public.documents (kind, title, path, mime, size_bytes) values ('lga_certificate', 'LGA ID', '00000000-0000-0000-0000-0000000000e3/lga.pdf', 'application/pdf', 10)$$, 'a local government ID can be saved');
reset role;

select * from finish();
