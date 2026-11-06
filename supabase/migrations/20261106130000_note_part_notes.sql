-- Notes on each part of a long video or book, kept while the summary is written step by step.
alter table public.notes add column part_notes jsonb check (part_notes is null or jsonb_typeof(part_notes) = 'array');
grant update (part_notes) on public.notes to authenticated;
