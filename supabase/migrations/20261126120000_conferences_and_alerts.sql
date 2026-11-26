-- Conferences you can apply to, the reason a job still needs you, and the morning email log.
-- Every row belongs to one person and is read and written only by them.

create table public.conferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  url text not null check (url ~ '^https://' and char_length(url) <= 1000),
  apply_url text check (apply_url ~ '^https://' and char_length(apply_url) <= 1000),
  place text check (char_length(place) <= 120),
  dates text check (char_length(dates) <= 120),
  deadline date,
  deadline_text text check (char_length(deadline_text) <= 120),
  fee text check (char_length(fee) <= 200),
  covers text check (char_length(covers) <= 300),
  eligible text check (char_length(eligible) <= 200),
  summary text check (char_length(summary) <= 2000),
  warnings text[] not null default '{}',
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  source text not null check (char_length(source) <= 60),
  status text not null default 'found' check (status in ('found', 'interested', 'drafted', 'applied', 'accepted', 'declined', 'dismissed')),
  note text check (char_length(note) <= 2000),
  applied_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);
create index conferences_user_deadline on public.conferences (user_id, status, deadline);

alter table public.conferences enable row level security;
create policy conferences_read on public.conferences for select to authenticated using (user_id = (select auth.uid()));
create policy conferences_insert on public.conferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy conferences_update on public.conferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy conferences_delete on public.conferences for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.conferences from anon;
revoke update on public.conferences from authenticated;
grant update (status, note, questions, applied_on, updated_at) on public.conferences to authenticated;

alter table public.job_posts add column needs_you text check (char_length(needs_you) <= 300);

create table public.alert_digests (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  items integer not null default 0,
  sent_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.alert_digests enable row level security;
create policy alert_digests_read on public.alert_digests for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.alert_digests from anon;
revoke insert, update, delete on public.alert_digests from authenticated;
