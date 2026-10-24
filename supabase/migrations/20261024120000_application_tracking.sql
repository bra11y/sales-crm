-- Proof that an application went out, and what happened next.
-- Every application gets a history: how it was sent, the confirmation email,
-- replies, interviews and the result. Status moves by itself from these events.
-- Only server code writes (admin client). Users read their own rows.

alter table public.job_posts drop constraint job_posts_status_check;
alter table public.job_posts add constraint job_posts_status_check
  check (status in ('new', 'saved', 'applied', 'replied', 'interview', 'offer', 'rejected', 'no_reply', 'dismissed'));
alter table public.job_posts add column applied_at timestamptz;
alter table public.job_posts add column applied_via text check (applied_via in ('email', 'form', 'manual'));
-- Set when a confirmation email ("we received your application") arrives.
alter table public.job_posts add column confirmed_at timestamptz;

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  job_id uuid not null references public.job_posts (id) on delete cascade,
  kind text not null check (kind in ('sent_email', 'submitted_form', 'marked_applied', 'confirmed', 'replied', 'interview', 'offer', 'rejected', 'follow_up', 'moved')),
  at timestamptz not null default now(),
  title text not null check (length(title) between 1 and 300),
  detail text not null default '' check (length(detail) <= 1000),
  -- Where the proof lives: an email address, a Gmail message id, a page address.
  evidence jsonb not null default '{}',
  -- The Gmail message this came from, so a re-read never adds it twice.
  message_id text
);
create index application_events_job on public.application_events (job_id, at desc);
create index application_events_user on public.application_events (user_id, at desc);
create unique index application_events_one_message on public.application_events (user_id, message_id) where message_id is not null;

alter table public.application_events enable row level security;
create policy application_events_read on public.application_events for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.application_events from anon;
revoke insert, update, delete on public.application_events from authenticated;

-- Jobs already applied to keep a start date for the board.
update public.job_posts set applied_at = status_changed_at where status in ('applied', 'replied', 'no_reply') and applied_at is null;
