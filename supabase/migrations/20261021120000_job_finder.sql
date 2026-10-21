create table public.job_profiles (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  facts jsonb not null,
  preferences jsonb not null default '{}',
  source_state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.job_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  source text not null check (source ~ '^[a-z]{2,30}$'),
  external_id text not null,
  title text not null,
  company text not null default '',
  company_logo text,
  url text not null check (url ~ '^https://'),
  apply_url text not null check (apply_url ~ '^https://'),
  description text not null default '',
  location text not null default '',
  employment_type text not null default '',
  tags text[] not null default '{}',
  pay jsonb,
  pay_monthly_usd integer,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  score smallint not null default 0 check (score between 0 and 100),
  band text not null default 'maybe' check (band in ('strong', 'good', 'maybe')),
  eligibility text not null default 'unknown' check (eligibility in ('worldwide', 'region', 'local', 'visa', 'restricted', 'unknown')),
  track text not null default '',
  matched text[] not null default '{}',
  gaps text[] not null default '{}',
  reasons text[] not null default '{}',
  flags text[] not null default '{}',
  hidden_reason text,
  status text not null default 'new' check (status in ('new', 'saved', 'applied', 'dismissed')),
  status_changed_at timestamptz,
  company_info jsonb,
  unique (user_id, source, external_id)
);
create index job_posts_user_board on public.job_posts (user_id, status, score desc) where hidden_reason is null;
create index job_posts_user_seen on public.job_posts (user_id, last_seen_at desc);

create table public.job_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'schedule')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched integer not null default 0,
  kept integer not null default 0,
  added integer not null default 0,
  errors jsonb not null default '[]'
);
create index job_runs_user_started on public.job_runs (user_id, started_at desc);

alter table public.job_profiles enable row level security;
alter table public.job_posts enable row level security;
alter table public.job_runs enable row level security;

create policy job_profiles_read on public.job_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy job_profiles_insert on public.job_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy job_profiles_update on public.job_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy job_posts_read on public.job_posts for select to authenticated using (user_id = (select auth.uid()));
create policy job_posts_update on public.job_posts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.job_posts from authenticated;
grant update (status, status_changed_at, company_info) on public.job_posts to authenticated;

create policy job_runs_read on public.job_runs for select to authenticated using (user_id = (select auth.uid()));
