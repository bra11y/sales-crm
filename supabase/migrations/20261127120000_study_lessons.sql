-- Daily study: one short lesson per topic, written once by the morning job and read by everyone.
create table public.study_lessons (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,120}$'),
  lesson jsonb not null check (jsonb_typeof(lesson) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.study_lessons enable row level security;
create policy study_lessons_read on public.study_lessons for select to authenticated using (true);
revoke all on public.study_lessons from anon;
revoke insert, update, delete on public.study_lessons from authenticated;
