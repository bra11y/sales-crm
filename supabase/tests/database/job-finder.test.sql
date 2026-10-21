begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'seeker@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'other@test.local');
insert into public.profiles (user_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Seeker'),
  ('00000000-0000-0000-0000-0000000000a2', 'Other');

insert into public.job_profiles (user_id, facts) values
  ('00000000-0000-0000-0000-0000000000a1', '{"person":{"name":"Seeker"}}'),
  ('00000000-0000-0000-0000-0000000000a2', '{"person":{"name":"Other"}}');
insert into public.job_posts (id, user_id, source, external_id, title, url, apply_url, score) values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'remotive', '1', 'Frontend Developer', 'https://a.test/1', 'https://a.test/1', 80),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'remotive', '1', 'Frontend Developer', 'https://a.test/1', 'https://a.test/1', 80);
insert into public.job_runs (user_id, trigger) values ('00000000-0000-0000-0000-0000000000a2', 'manual');

set local role anon;
select is((select count(*) from public.job_posts)::int, 0, 'signed-out reads no jobs');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is((select count(*) from public.job_posts)::int, 1, 'a user reads only their own jobs');
select is((select count(*) from public.job_profiles)::int, 1, 'a user reads only their own profile');
select is((select count(*) from public.job_runs)::int, 0, 'a user reads no one else''s runs');

update public.job_posts set status = 'saved' where id = '20000000-0000-0000-0000-0000000000a2';
update public.job_posts set status = 'saved' where id = '20000000-0000-0000-0000-0000000000a1';
select throws_ok($$update public.job_posts set score = 100 where id = '20000000-0000-0000-0000-0000000000a1'$$, '42501', null, 'a user cannot change their own fit score');
update public.job_profiles set facts = '{"person":{"name":"Hacked"}}' where user_id = '00000000-0000-0000-0000-0000000000a2';
reset role;

select is((select status from public.job_posts where id = '20000000-0000-0000-0000-0000000000a2'), 'new', 'a user cannot save another user''s job');
select is((select status from public.job_posts where id = '20000000-0000-0000-0000-0000000000a1'), 'saved', 'a user can save their own job');
select is((select facts->'person'->>'name' from public.job_profiles where user_id = '00000000-0000-0000-0000-0000000000a2'), 'Other', 'a user cannot edit another user''s profile');

select * from finish();
rollback;
