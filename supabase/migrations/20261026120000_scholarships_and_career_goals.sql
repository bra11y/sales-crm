-- Scholarships you are going for, and your own short- and long-term goals.
-- Both belong to one person and are read and written only by them.

create table public.scholarships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  provider text check (char_length(provider) <= 200),
  url text check (url ~ '^https://' and char_length(url) <= 1000),
  level text not null default 'any' check (level in ('any', 'undergraduate', 'masters', 'phd', 'short course')),
  country text check (char_length(country) <= 100),
  amount text check (char_length(amount) <= 120),
  deadline date,
  status text not null default 'interested' check (status in ('interested', 'preparing', 'applied', 'interview', 'won', 'lost')),
  -- A checklist: [{ "text": "Ask two referees", "done": false }]
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 30),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scholarships_user_deadline on public.scholarships (user_id, deadline);

create table public.career_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  horizon text not null check (horizon in ('short', 'long')),
  due_on date,
  why text check (char_length(why) <= 500),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 30),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index career_goals_user on public.career_goals (user_id);

alter table public.scholarships enable row level security;
alter table public.career_goals enable row level security;

create policy scholarships_read on public.scholarships for select to authenticated using (user_id = (select auth.uid()));
create policy scholarships_insert on public.scholarships for insert to authenticated with check (user_id = (select auth.uid()));
create policy scholarships_update on public.scholarships for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy scholarships_delete on public.scholarships for delete to authenticated using (user_id = (select auth.uid()));

create policy career_goals_read on public.career_goals for select to authenticated using (user_id = (select auth.uid()));
create policy career_goals_insert on public.career_goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy career_goals_update on public.career_goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy career_goals_delete on public.career_goals for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.scholarships, public.career_goals from anon;
-- Owners never move a row to someone else.
revoke update on public.scholarships, public.career_goals from authenticated;
grant update (name, provider, url, level, country, amount, deadline, status, steps, note, updated_at) on public.scholarships to authenticated;
grant update (title, horizon, due_on, why, steps, done_at) on public.career_goals to authenticated;
