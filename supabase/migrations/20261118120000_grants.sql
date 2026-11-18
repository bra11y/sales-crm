-- Business grants: ones the daily search finds, the ones you go for, and your answer bank.
-- Every row belongs to one person and is read and written only by them.

create table public.grant_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  url text not null check (url ~ '^https://' and char_length(url) <= 1000),
  eligible text check (char_length(eligible) <= 200),
  amount text check (char_length(amount) <= 120),
  deadline date,
  deadline_text text check (char_length(deadline_text) <= 80),
  shared_at date,
  source text not null check (char_length(source) <= 60),
  summary text check (char_length(summary) <= 1000),
  dismissed boolean not null default false,
  tracked_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index grant_leads_user_created on public.grant_leads (user_id, created_at desc);

create table public.grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  provider text check (char_length(provider) <= 200),
  url text check (url ~ '^https://' and char_length(url) <= 1000),
  business text check (char_length(business) <= 120),
  amount text check (char_length(amount) <= 120),
  deadline date,
  status text not null default 'interested' check (status in ('interested', 'preparing', 'applied', 'shortlisted', 'won', 'lost')),
  note text check (char_length(note) <= 2000),
  applied_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grants_user_deadline on public.grants (user_id, deadline);

alter table public.grant_leads
  add constraint grant_leads_tracked_fk foreign key (tracked_id) references public.grants (id) on delete set null;

-- Your best answers to the questions grant forms keep asking, so the next form takes minutes.
create table public.grant_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 4000),
  business text check (char_length(business) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grant_answers_user on public.grant_answers (user_id, updated_at desc);

alter table public.grant_leads enable row level security;
alter table public.grants enable row level security;
alter table public.grant_answers enable row level security;

create policy grant_leads_read on public.grant_leads for select to authenticated using (user_id = (select auth.uid()));
create policy grant_leads_insert on public.grant_leads for insert to authenticated with check (user_id = (select auth.uid()));
create policy grant_leads_update on public.grant_leads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy grant_leads_delete on public.grant_leads for delete to authenticated using (user_id = (select auth.uid()));

create policy grants_read on public.grants for select to authenticated using (user_id = (select auth.uid()));
create policy grants_insert on public.grants for insert to authenticated with check (user_id = (select auth.uid()));
create policy grants_update on public.grants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy grants_delete on public.grants for delete to authenticated using (user_id = (select auth.uid()));

create policy grant_answers_read on public.grant_answers for select to authenticated using (user_id = (select auth.uid()));
create policy grant_answers_insert on public.grant_answers for insert to authenticated with check (user_id = (select auth.uid()));
create policy grant_answers_update on public.grant_answers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy grant_answers_delete on public.grant_answers for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.grant_leads, public.grants, public.grant_answers from anon;
-- Owners never move a row to someone else.
revoke update on public.grant_leads, public.grants, public.grant_answers from authenticated;
grant update (dismissed, tracked_id) on public.grant_leads to authenticated;
grant update (name, provider, url, business, amount, deadline, status, note, applied_on, updated_at) on public.grants to authenticated;
grant update (question, answer, business, updated_at) on public.grant_answers to authenticated;
