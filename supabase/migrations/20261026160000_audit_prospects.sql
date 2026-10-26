-- Companies whose sites you checked for accessibility problems, for freelance audit work.
-- Outreach is drafted into your own Gmail Drafts; you send it yourself.
create table public.audit_prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company text not null check (char_length(company) between 1 and 200),
  url text not null check (url ~ '^https://' and char_length(url) <= 1000),
  contact_name text check (char_length(contact_name) <= 120),
  contact_email text check (char_length(contact_email) <= 200),
  score smallint check (score between 0 and 100),
  findings jsonb not null default '[]' check (jsonb_typeof(findings) = 'array'),
  status text not null default 'checked' check (status in ('checked', 'drafted', 'sent', 'replied', 'won', 'not_now')),
  checked_at timestamptz,
  drafted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index audit_prospects_user on public.audit_prospects (user_id, created_at desc);
alter table public.audit_prospects enable row level security;
create policy audit_prospects_read on public.audit_prospects for select to authenticated using (user_id = (select auth.uid()));
create policy audit_prospects_insert on public.audit_prospects for insert to authenticated with check (user_id = (select auth.uid()));
create policy audit_prospects_update on public.audit_prospects for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy audit_prospects_delete on public.audit_prospects for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.audit_prospects from anon;
revoke update on public.audit_prospects from authenticated;
grant update (company, contact_name, contact_email, score, findings, status, checked_at, drafted_at) on public.audit_prospects to authenticated;
