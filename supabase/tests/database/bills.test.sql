begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'payer@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'other-payer@test.local');
insert into public.bills (id, user_id, name, amount, next_due) values
  ('80000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'Their rent', 150000, '2026-12-01');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select is((select count(*) from public.bills)::int, 0, 'you cannot see another person''s bills');
select lives_ok($$insert into public.bills (name, amount, currency, cycle, next_due, category) values ('Netflix', 4400, 'NGN', 'month', '2026-11-15', 'subscription')$$, 'you can add your own bill');
select throws_ok($$insert into public.bill_payments (bill_id, amount, currency) values ('80000000-0000-0000-0000-0000000000c2', 150000, 'NGN')$$, '42501', null, 'you cannot record a payment on someone else''s bill');
select throws_ok($$insert into public.bills (name, amount, next_due) values ('Bad', -5, '2026-11-15')$$, '23514', null, 'an amount must be above zero');
update public.bills set amount = 1 where name = 'Their rent';
select lives_ok($$insert into public.money_plans (income, currency, save_percent) values (500000, 'NGN', 20)$$, 'you can set your own budget');
reset role;
select is((select amount from public.bills where name = 'Their rent'), 150000.00, 'another person''s bill cannot be changed');

select * from finish();
