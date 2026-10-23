begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'goal-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'goal-other@test.local');
insert into public.goals (id, user_id, metric, period, target) values
  ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'applications', 'week', 20),
  ('30000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2', 'applications', 'week', 20);

set local role anon;
select throws_ok($$select count(*) from public.goals$$, '42501', null, 'signed-out cannot read goals at all');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select is((select count(*) from public.goals)::int, 1, 'a user reads only their own goals');
select throws_ok($$insert into public.goals (user_id, metric, period, target) values ('00000000-0000-0000-0000-0000000000b2', 'replies', 'week', 5)$$, '42501', null, 'a user cannot add a goal for someone else');
select throws_ok($$insert into public.goals (metric, period, target) values ('revenue', 'month', 500000)$$, '23514', null, 'a revenue goal needs a currency');
select throws_ok($$update public.goals set metric = 'replies' where id = '30000000-0000-0000-0000-0000000000b1'$$, '42501', null, 'a goal''s measure cannot be changed, only its target');
update public.goals set target = 99 where id = '30000000-0000-0000-0000-0000000000b2';
reset role;

select is((select target from public.goals where id = '30000000-0000-0000-0000-0000000000b2')::int, 20, 'a user cannot edit another user''s goal');

select * from finish();
