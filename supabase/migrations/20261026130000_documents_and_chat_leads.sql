-- Your documents (CV, transcript, certificates, passport, ID) for school, scholarship
-- and job applications, and scholarships found in WhatsApp chats you import.

-- Files live in a private bucket, one folder per person: <user id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy documents_files_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy documents_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy documents_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('cv', 'cover_letter', 'transcript', 'degree', 'school_result', 'nysc', 'certificate',
    'passport', 'national_id', 'birth_certificate', 'recommendation', 'personal_statement', 'language_test', 'photo',
    'admission', 'proof_of_funds', 'other')),
  title text not null check (char_length(title) between 1 and 200),
  path text not null check (char_length(path) <= 400),
  mime text not null check (char_length(mime) <= 120),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  expires_on date,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  -- The file must sit in the owner's own folder.
  constraint documents_path_owner check (split_part(path, '/', 1) = user_id::text)
);
create index documents_user_kind on public.documents (user_id, kind);

alter table public.documents enable row level security;
create policy documents_read on public.documents for select to authenticated using (user_id = (select auth.uid()));
create policy documents_insert on public.documents for insert to authenticated with check (user_id = (select auth.uid()));
create policy documents_update on public.documents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy documents_delete on public.documents for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.documents from anon;
revoke update on public.documents from authenticated;
grant update (kind, title, expires_on, note) on public.documents to authenticated;

-- Scholarships found in an imported chat, before you choose to track one.
create table public.scholarship_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  url text not null check (url ~ '^https?://' and char_length(url) <= 1000),
  place text check (char_length(place) <= 200),
  eligible text check (char_length(eligible) <= 200),
  level text check (char_length(level) <= 120),
  benefits jsonb not null default '[]' check (jsonb_typeof(benefits) = 'array' and jsonb_array_length(benefits) <= 6),
  needs jsonb not null default '[]' check (jsonb_typeof(needs) = 'array' and jsonb_array_length(needs) <= 20),
  deadline date,
  deadline_text text check (char_length(deadline_text) <= 80),
  shared_at date,
  source text not null default 'whatsapp' check (char_length(source) <= 60),
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index scholarship_leads_user_deadline on public.scholarship_leads (user_id, deadline);

alter table public.scholarship_leads enable row level security;
create policy scholarship_leads_read on public.scholarship_leads for select to authenticated using (user_id = (select auth.uid()));
create policy scholarship_leads_insert on public.scholarship_leads for insert to authenticated with check (user_id = (select auth.uid()));
create policy scholarship_leads_update on public.scholarship_leads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy scholarship_leads_delete on public.scholarship_leads for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.scholarship_leads from anon;
revoke update on public.scholarship_leads from authenticated;
grant update (dismissed) on public.scholarship_leads to authenticated;
