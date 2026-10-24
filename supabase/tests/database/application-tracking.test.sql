begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'track-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'track-other@test.local');
insert into public.profiles (user_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Owner'),
  ('00000000-0000-0000-0000-0000000000c2', 'Other')
on conflict (user_id) do nothing;
insert into public.job_posts (id, user_id, source, external_id, title, company, url, apply_url, status) values
  ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'remotive', 't1', 'Designer', 'Acme', 'https://acme.test/1', 'https://acme.test/1', 'interview'),
  ('40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'remotive', 't2', 'Designer', 'Beta', 'https://beta.test/1', 'https://beta.test/1', 'applied');
insert into public.application_events (user_id, job_id, kind, title, message_id) values
  ('00000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', 'interview', 'Acme asked to talk', 'm1'),
  ('00000000-0000-0000-0000-0000000000c2', '40000000-0000-0000-0000-0000000000c2', 'sent_email', 'Emailed to jobs@beta.test', null);

select throws_ok($$insert into public.application_events (user_id, job_id, kind, title, message_id) values ('00000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', 'replied', 'again', 'm1')$$, '23505', null, 'the same email is never recorded twice');
select throws_ok($$update public.job_posts set status = 'hired' where id = '40000000-0000-0000-0000-0000000000c1'$$, '23514', null, 'only known statuses are allowed');

set local role anon;
select throws_ok($$select count(*) from public.application_events$$, '42501', null, 'signed-out cannot read application history');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select is((select count(*) from public.application_events)::int, 1, 'a user reads only their own history');
select throws_ok($$insert into public.application_events (user_id, job_id, kind, title) values ('00000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', 'offer', 'Fake offer')$$, '42501', null, 'a user cannot write proof by hand');
select throws_ok($$update public.job_posts set applied_via = 'email' where id = '40000000-0000-0000-0000-0000000000c1'$$, '42501', null, 'a user cannot fake how it was sent');
reset role;

select * from finish();
rollback;
