-- Gigs: posts from people who need short-term work done (Hacker News, Mastodon).
-- The posts themselves are read live; this keeps only what you did with each one.
create table public.gig_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  gig_id text not null check (char_length(gig_id) between 1 and 120),
  url text not null check (url ~ '^https://' and char_length(url) <= 1000),
  title text not null default '' check (char_length(title) <= 300),
  status text not null default 'drafted' check (status in ('drafted', 'sent', 'replied', 'won', 'not_for_me')),
  updated_at timestamptz not null default now(),
  unique (user_id, gig_id)
);
create index gig_replies_user on public.gig_replies (user_id, updated_at desc);
alter table public.gig_replies enable row level security;
create policy gig_replies_read on public.gig_replies for select to authenticated using (user_id = (select auth.uid()));
create policy gig_replies_insert on public.gig_replies for insert to authenticated with check (user_id = (select auth.uid()));
create policy gig_replies_update on public.gig_replies for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy gig_replies_delete on public.gig_replies for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.gig_replies from anon;
revoke update on public.gig_replies from authenticated;
grant update (status, updated_at) on public.gig_replies to authenticated;

-- Starting a scholarship application writes a first draft of the personal statement for you to finish.
alter table public.scholarships add column statement text check (char_length(statement) <= 20000);
grant update (statement) on public.scholarships to authenticated;
