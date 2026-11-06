-- Learn: notes from videos and writing, and books with summaries. Everything is private to its owner.

-- Your own book files (PDF, EPUB) and audio or video to transcribe. One folder per person.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning', 'learning', false, 26214400,
  array['application/pdf', 'application/epub+zip', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy learning_files_read on storage.objects for select to authenticated
  using (bucket_id = 'learning' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy learning_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'learning' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy learning_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'learning' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  author text not null default '' check (char_length(author) <= 200),
  field text not null default 'career' check (field in ('accessibility', 'frontend', 'design', 'software', 'career', 'other')),
  -- Where to read a catalogue book; null for your own file.
  url text check (url ~ '^https://' and char_length(url) <= 1000),
  cover text check (cover ~ '^https://' and char_length(cover) <= 1000),
  catalog_key text check (char_length(catalog_key) <= 1000),
  access text check (access in ('free', 'borrow')),
  -- Your own file in the learning bucket.
  path text check (char_length(path) <= 400),
  mime text check (char_length(mime) <= 120),
  size_bytes integer check (size_bytes > 0 and size_bytes <= 26214400),
  status text not null default 'want' check (status in ('want', 'reading', 'done')),
  created_at timestamptz not null default now(),
  constraint books_path_owner check (path is null or split_part(path, '/', 1) = user_id::text),
  constraint books_has_place check (url is not null or path is not null),
  unique (user_id, catalog_key)
);
create index books_user_created on public.books (user_id, created_at desc);

alter table public.books enable row level security;
create policy books_read on public.books for select to authenticated using (user_id = (select auth.uid()));
create policy books_insert on public.books for insert to authenticated with check (user_id = (select auth.uid()));
create policy books_update on public.books for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy books_delete on public.books for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.books from anon;
revoke update on public.books from authenticated;
grant update (title, author, field, status) on public.books to authenticated;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('video', 'text', 'book')),
  title text not null check (char_length(title) between 1 and 300),
  author text not null default '' check (char_length(author) <= 200),
  source_url text check (source_url ~ '^https://' and char_length(source_url) <= 1000),
  thumbnail text check (thumbnail ~ '^https://' and char_length(thumbnail) <= 1000),
  video_id text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  book_id uuid references public.books (id) on delete set null,
  -- The words of the video or book, and where they came from.
  transcript text not null default '' check (char_length(transcript) <= 400000),
  transcript_from text check (transcript_from in ('pasted', 'extension', 'whisper', 'book', 'typed')),
  -- Your own words, kept apart from the AI's.
  body text not null default '' check (char_length(body) <= 50000),
  ai jsonb check (ai is null or jsonb_typeof(ai) = 'object'),
  ai_note text check (char_length(ai_note) <= 1000),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  review_step smallint not null default 0 check (review_step between 0 and 5),
  review_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_updated on public.notes (user_id, updated_at desc);
create index notes_user_due on public.notes (user_id, review_due) where review_due is not null;
create unique index notes_user_video on public.notes (user_id, video_id) where video_id is not null;

alter table public.notes enable row level security;
create policy notes_read on public.notes for select to authenticated using (user_id = (select auth.uid()));
create policy notes_insert on public.notes for insert to authenticated with check (user_id = (select auth.uid()));
create policy notes_update on public.notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notes_delete on public.notes for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.notes from anon;
revoke update on public.notes from authenticated;
grant update (title, body, tags, transcript, transcript_from, ai, ai_note, review_step, review_due, updated_at) on public.notes to authenticated;
