-- Project 2: send applications from the user's own Gmail, track replies, follow up.
-- Every write goes through server code with the admin client. Users can only read
-- their own rows, and never the encrypted app password.

alter table public.job_posts drop constraint job_posts_status_check;
alter table public.job_posts add constraint job_posts_status_check
  check (status in ('new', 'saved', 'applied', 'replied', 'no_reply', 'dismissed'));
alter table public.job_posts add column contact_email text check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.job_posts add column contact_source text;
-- The prepared application (letter, subject, body), so the AI runs once per job.
alter table public.job_posts add column draft jsonb;

create table public.mail_accounts (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_tag text not null,
  connected_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_uid bigint,
  test_sent_at timestamptz
);

create table public.applications_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  job_id uuid references public.job_posts (id) on delete set null,
  parent_id uuid references public.applications_outbox (id) on delete cascade,
  kind text not null check (kind in ('application', 'follow_up_1', 'follow_up_2', 'test')),
  to_email text not null check (to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject text not null,
  body text not null,
  cv_markdown text,
  attachment_name text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'cancelled', 'failed')),
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  message_id text,
  error text,
  ai_note text,
  created_at timestamptz not null default now()
);
create index applications_outbox_due on public.applications_outbox (status, send_after) where status = 'queued';
create index applications_outbox_user on public.applications_outbox (user_id, created_at desc);
create unique index applications_outbox_one_per_job on public.applications_outbox (job_id, kind) where status in ('queued', 'sent') and job_id is not null;

create table public.application_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  job_id uuid references public.job_posts (id) on delete set null,
  outbox_id uuid references public.applications_outbox (id) on delete set null,
  message_id text not null,
  from_email text not null,
  subject text not null default '',
  received_at timestamptz not null,
  snippet text not null default '',
  suggested_stage text not null check (suggested_stage in ('interview', 'closed', 'replied')),
  confirmed boolean not null default false,
  unique (user_id, message_id)
);
create index application_replies_user on public.application_replies (user_id, received_at desc);

alter table public.mail_accounts enable row level security;
alter table public.applications_outbox enable row level security;
alter table public.application_replies enable row level security;

create policy mail_accounts_read on public.mail_accounts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.mail_accounts from authenticated, anon;
grant select (user_id, email, connected_at, last_checked_at, test_sent_at) on public.mail_accounts to authenticated;

create policy applications_outbox_read on public.applications_outbox for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.applications_outbox from authenticated, anon;

create policy application_replies_read on public.application_replies for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.application_replies from authenticated, anon;
