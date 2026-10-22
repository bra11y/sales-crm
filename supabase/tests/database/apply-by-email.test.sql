begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'sender@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'other@test.local');
insert into public.profiles (user_id, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Sender'),
  ('00000000-0000-0000-0000-0000000000b2', 'Other');
insert into public.mail_accounts (user_id, email, secret_ciphertext, secret_iv, secret_tag) values
  ('00000000-0000-0000-0000-0000000000b1', 'sender@gmail.com', 'locked', 'iv', 'tag'),
  ('00000000-0000-0000-0000-0000000000b2', 'other@gmail.com', 'locked', 'iv', 'tag');
insert into public.applications_outbox (id, user_id, kind, to_email, subject, body) values
  ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'application', 'jobs@a.test', 'Hi', 'Body'),
  ('30000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2', 'application', 'jobs@b.test', 'Hi', 'Body');
insert into public.application_replies (user_id, message_id, from_email, received_at, suggested_stage) values
  ('00000000-0000-0000-0000-0000000000b2', '<r@b.test>', 'jane@b.test', now(), 'interview');

set local role anon;
select throws_ok($$select email from public.mail_accounts$$, '42501', null, 'signed-out can not read mail accounts');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select is((select count(*) from public.mail_accounts)::int, 1, 'a user sees only their own Gmail connection');
select throws_ok($$select secret_ciphertext from public.mail_accounts$$, '42501', null, 'a user can never read the locked app password');
select is((select count(*) from public.applications_outbox)::int, 1, 'a user sees only their own outbox');
select is((select count(*) from public.application_replies)::int, 0, 'a user sees no one else''s replies');
select throws_ok($$update public.applications_outbox set to_email = 'x@evil.test' where id = '30000000-0000-0000-0000-0000000000b1'$$, '42501', null, 'a user can not change an email behind the server''s back');
select throws_ok($$insert into public.applications_outbox (user_id, kind, to_email, subject, body) values ('00000000-0000-0000-0000-0000000000b1', 'application', 'a@b.test', 's', 'b')$$, '42501', null, 'a user can not queue an email directly');
reset role;

select is((select status from public.applications_outbox where id = '30000000-0000-0000-0000-0000000000b2'), 'queued', 'the other user''s email is untouched');

select * from finish();
