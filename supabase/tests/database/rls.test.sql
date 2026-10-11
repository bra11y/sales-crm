begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'member@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'outsider@test.local');

insert into public.profiles (user_id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Owner'),
  ('00000000-0000-0000-0000-000000000002', 'Member'),
  ('00000000-0000-0000-0000-000000000003', 'Outsider');

insert into public.workspaces (id, name, kind) overriding system value values (2, 'Other', 'internal');

insert into public.workspace_members (workspace_id, user_id, role) values
  (1, '00000000-0000-0000-0000-000000000001', 'owner'),
  (1, '00000000-0000-0000-0000-000000000002', 'member'),
  (2, '00000000-0000-0000-0000-000000000003', 'owner');

insert into public.companies (id, workspace_id, product, external_id, name, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 1, 'washcare', 't1', 'Owner co', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000b', 1, 'washcare', 't2', 'Member co', '00000000-0000-0000-0000-000000000002');

set local role anon;
select is((select count(*) from public.companies)::int, 0, 'signed-out reads no companies');
select is((select count(*) from public.company_list)::int, 0, 'signed-out reads nothing from the view');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.companies)::int, 0, 'a user in another workspace reads nothing');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.companies where external_id in ('t1', 't2'))::int, 2, 'a member reads every company in the workspace');

update public.companies set name = 'Changed' where id = '10000000-0000-0000-0000-00000000000a';
select is((select name from public.companies where id = '10000000-0000-0000-0000-00000000000a'), 'Owner co', 'a member cannot edit another owner''s company');

update public.companies set name = 'Mine' where id = '10000000-0000-0000-0000-00000000000b';
select is((select name from public.companies where id = '10000000-0000-0000-0000-00000000000b'), 'Mine', 'a member edits their own company');

select throws_ok(
  $$ insert into public.events (workspace_id, product, event_id, type, occurred_at, payload) values (1, 'washcare', 'x', 'lead.captured', now(), '{}') $$,
  '42501',
  null,
  'a signed-in user cannot write events'
);

select * from finish();
rollback;
