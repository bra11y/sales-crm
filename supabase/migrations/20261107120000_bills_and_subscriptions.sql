-- Your own bills and subscriptions, what you paid, and your monthly budget. Private to you.

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0 and amount <= 100000000000),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  cycle text not null default 'month' check (cycle in ('week', 'month', 'quarter', 'year', 'once')),
  next_due date not null,
  category text not null default 'other' check (category in ('subscription', 'bill', 'rent', 'loan', 'insurance', 'savings', 'family', 'other')),
  method text check (char_length(method) <= 80),
  url text check (url ~ '^https://' and char_length(url) <= 500),
  note text check (char_length(note) <= 500),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now()
);
create index bills_user_due on public.bills (user_id, next_due) where status = 'active';

create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bill_id uuid not null references public.bills (id) on delete cascade,
  paid_on date not null default current_date,
  due_on date,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);
create index bill_payments_user_paid on public.bill_payments (user_id, paid_on desc);

create table public.money_plans (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  income numeric(14, 2) check (income is null or income >= 0),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  save_percent smallint not null default 10 check (save_percent between 0 and 90),
  tips jsonb check (tips is null or jsonb_typeof(tips) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.bills enable row level security;
alter table public.bill_payments enable row level security;
alter table public.money_plans enable row level security;

create policy bills_own on public.bills for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy bill_payments_own on public.bill_payments for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.bills b where b.id = bill_id and b.user_id = (select auth.uid())));
create policy money_plans_own on public.money_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.bills, public.bill_payments, public.money_plans from anon;
