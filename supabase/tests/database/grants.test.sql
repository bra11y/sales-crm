begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'grant-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'grant-other@test.local');
insert into public.grants (id, user_id, name) values
  ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Drawbridge Grant'),
  ('40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'Other grant');
insert into public.grant_answers (user_id, question, answer) values
  ('00000000-0000-0000-0000-0000000000c2', 'What does your business do?', 'Private answer');

set local role anon;
select throws_ok($$select count(*) from public.grants$$, '42501', null, 'signed-out cannot read grants at all');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select is((select count(*) from public.grants)::int, 1, 'a user reads only their own grants');
select is((select count(*) from public.grant_answers)::int, 0, 'a user never sees someone else''s answers');
select throws_ok($$insert into public.grants (user_id, name) values ('00000000-0000-0000-0000-0000000000c2', 'Sneaky')$$, '42501', null, 'a user cannot add a grant for someone else');
select throws_ok($$update public.grants set status = 'won!' where id = '40000000-0000-0000-0000-0000000000c1'$$, '23514', null, 'a grant stage must be one of the listed stages');
update public.grants set status = 'won' where id = '40000000-0000-0000-0000-0000000000c2';
reset role;

select is((select status from public.grants where id = '40000000-0000-0000-0000-0000000000c2'), 'interested', 'a user cannot edit another user''s grant');

select * from finish();
