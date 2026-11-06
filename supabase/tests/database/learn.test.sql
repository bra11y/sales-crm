begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'learner@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'other-learner@test.local');
insert into public.books (id, user_id, title, path, mime, size_bytes) values
  ('70000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f2', 'Their book', '00000000-0000-0000-0000-0000000000f2/b.pdf', 'application/pdf', 1000);
insert into public.notes (user_id, kind, title, body) values
  ('00000000-0000-0000-0000-0000000000f2', 'text', 'Their note', 'private');

select is((select public from storage.buckets where id = 'learning'), false, 'the learning bucket is private');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select is((select count(*) from public.notes)::int, 0, 'a user cannot see another user''s notes');
select is((select count(*) from public.books)::int, 0, 'a user cannot see another user''s books');
select lives_ok($$insert into public.notes (kind, title, video_id, transcript, transcript_from) values ('video', 'Focus', 'dQw4w9WgXcQ', 'words', 'pasted')$$, 'you can save a video note');
select throws_ok($$insert into public.notes (kind, title, video_id) values ('video', 'Again', 'dQw4w9WgXcQ')$$, '23505', null, 'the same video is saved once per person');
select throws_ok($$insert into public.books (title, path, mime, size_bytes) values ('Mine', '00000000-0000-0000-0000-0000000000f2/x.pdf', 'application/pdf', 10)$$, '23514', null, 'a book file must sit in your own folder');
select throws_ok($$insert into public.notes (kind, title, source_url) values ('text', 'Bad', 'javascript:alert(1)')$$, '23514', null, 'a note link must be https');
update public.notes set body = 'changed' where title = 'Their note';
reset role;

select is((select body from public.notes where title = 'Their note'), 'private', 'another user''s note cannot be changed');
select is((select count(*) from public.notes where user_id = '00000000-0000-0000-0000-0000000000f1')::int, 1, 'your own note was saved');

select * from finish();
