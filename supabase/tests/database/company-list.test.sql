begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into public.companies (id, workspace_id, product, external_id, name, stage, win_probability) values
  ('20000000-0000-0000-0000-00000000000a', 1, 'washcare', 'ended', 'Ended Trial Co', 'Trial', 40),
  ('20000000-0000-0000-0000-00000000000b', 1, 'washcare', 'live', 'Live Trial Co', 'Trial', 40);

insert into public.subscriptions (workspace_id, company_id, product, plan, status, renews_at, source_at) values
  (1, '20000000-0000-0000-0000-00000000000a', 'washcare', 'washcare', 'trialing', now() - interval '1 day', now() - interval '8 days'),
  (1, '20000000-0000-0000-0000-00000000000b', 'washcare', 'washcare', 'trialing', now() + interval '3 days', now() - interval '4 days');

select is(
  (select stage from public.company_list where id = '20000000-0000-0000-0000-00000000000a'),
  'Trial ended',
  'a trial past its end date reads Trial ended on the companies list'
);
select is(
  (select win_probability from public.company_list where id = '20000000-0000-0000-0000-00000000000a'),
  15,
  'an ended trial drops to the Trial ended win probability'
);
select is(
  (select stage from public.company_list where id = '20000000-0000-0000-0000-00000000000b'),
  'Trial',
  'a running trial still reads Trial'
);

select * from finish();
rollback;
