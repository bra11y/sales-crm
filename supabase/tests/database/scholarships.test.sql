begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'sch-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'sch-other@test.local');
insert into public.scholarships (id, user_id, name) values
  ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Chevening'),
  ('40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'DAAD');
insert into public.career_goals (id, user_id, title, horizon) values
  ('50000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'Land a remote job', 'short');

set local role anon;
select throws_ok($$select count(*) from public.scholarships$$, '42501', null, 'signed-out cannot read scholarships');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select is((select count(*) from public.scholarships)::int, 1, 'a user reads only their own scholarships');
select is((select count(*) from public.career_goals)::int, 0, 'a user cannot read another user''s goals');
select throws_ok($$insert into public.scholarships (user_id, name) values ('00000000-0000-0000-0000-0000000000c2', 'X')$$, '42501', null, 'a user cannot add a scholarship for someone else');
select throws_ok($$insert into public.scholarships (name, url) values ('X', 'http://plain.example')$$, '23514', null, 'links must be https');
select throws_ok($$update public.scholarships set user_id = '00000000-0000-0000-0000-0000000000c2' where id = '40000000-0000-0000-0000-0000000000c1'$$, '42501', null, 'a scholarship cannot be handed to someone else');
update public.career_goals set title = 'hacked' where id = '50000000-0000-0000-0000-0000000000c2';
reset role;

select is((select title from public.career_goals where id = '50000000-0000-0000-0000-0000000000c2'), 'Land a remote job', 'a user cannot edit another user''s goal');

select * from finish();
