-- Daily post for X: one per day, written by the morning job from the day's first study topic.
create table public.daily_posts (
  day date primary key,
  post jsonb not null check (jsonb_typeof(post) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.daily_posts enable row level security;
create policy daily_posts_read on public.daily_posts for select to authenticated using (true);
revoke all on public.daily_posts from anon;
revoke insert, update, delete on public.daily_posts from authenticated;
