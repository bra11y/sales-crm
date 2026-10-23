-- Goals: a target for one measure over a week, month or quarter.
-- Progress is worked out from payments, activities and job applications; nothing is stored twice.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  metric text not null check (metric in ('revenue', 'new_paid', 'applications', 'interviews', 'replies', 'touches')),
  period text not null check (period in ('week', 'month', 'quarter')),
  -- Revenue targets are in minor units (kobo, cents); the rest are counts.
  target bigint not null check (target > 0 and target < 10000000000000),
  currency text check (currency ~ '^[A-Z]{3}$'),
  product text references public.products (slug) on delete set null,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint goals_currency_for_revenue check ((metric = 'revenue') = (currency is not null))
);
create index goals_user on public.goals (user_id);

alter table public.goals enable row level security;

create policy goals_read on public.goals for select to authenticated using (user_id = (select auth.uid()));
create policy goals_insert on public.goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy goals_update on public.goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_delete on public.goals for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.goals from anon;
revoke update on public.goals from authenticated;
grant update (target, note) on public.goals to authenticated;
