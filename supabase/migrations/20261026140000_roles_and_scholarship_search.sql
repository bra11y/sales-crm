-- Roles for who sees what, scholarship search fields, and a local government ID document.

-- Who you are in this CRM: the workspace owner, a sales member, or a job seeker
-- (anyone signed in who is not in the workspace). Pages and the menu check this.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select m.role from public.workspace_members m where m.user_id = (select auth.uid()) order by (m.role = 'owner') desc limit 1),
    'seeker'
  );
$$;
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- Local government ID (certificate of origin), asked for by many Nigerian scholarships.
alter table public.documents drop constraint documents_kind_check;
alter table public.documents add constraint documents_kind_check check (kind in ('cv', 'cover_letter', 'transcript', 'degree', 'school_result', 'nysc', 'certificate',
  'passport', 'national_id', 'lga_certificate', 'birth_certificate', 'recommendation', 'personal_statement', 'language_test', 'photo',
  'admission', 'proof_of_funds', 'other'));

-- Scholarships found by the search, not only in chats.
alter table public.scholarship_leads
  add column fully_funded boolean not null default false,
  add column summary text check (char_length(summary) <= 1000),
  add column tracked_id uuid references public.scholarships (id) on delete set null;
grant update (dismissed, tracked_id) on public.scholarship_leads to authenticated;
