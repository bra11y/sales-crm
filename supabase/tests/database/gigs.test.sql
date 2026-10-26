begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'gig-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'gig-other@test.local');
insert into public.gig_replies (id, user_id, gig_id, url, title) values
  ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'hn-1', 'https://news.ycombinator.com/item?id=1', 'Acme'),
  ('40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'hn-1', 'https://news.ycombinator.com/item?id=1', 'Acme');

set local role anon;
select throws_ok($$select count(*) from public.gig_replies$$, '42501', null, 'signed-out cannot read gig replies');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select is((select count(*) from public.gig_replies)::int, 1, 'a user reads only their own gig replies');
select throws_ok($$insert into public.gig_replies (gig_id, url) values ('hn-2', 'http://insecure.example')$$, '23514', null, 'a gig link must be https');
select throws_ok($$update public.gig_replies set url = 'https://evil.example' where id = '40000000-0000-0000-0000-0000000000c1'$$, '42501', null, 'a gig''s link cannot be changed, only its stage');
update public.gig_replies set status = 'won' where id = '40000000-0000-0000-0000-0000000000c2';
reset role;

select is((select status from public.gig_replies where id = '40000000-0000-0000-0000-0000000000c2'), 'drafted', 'a user cannot change another user''s gig');
select col_type_is('public', 'scholarships', 'statement', 'text', 'scholarships keep a statement draft');

select * from finish();
rollback;
