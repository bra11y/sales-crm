begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'doc-owner@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'doc-other@test.local');
insert into public.documents (id, user_id, kind, title, path, mime, size_bytes) values
  ('60000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2', 'passport', 'Passport', '00000000-0000-0000-0000-0000000000d2/p.pdf', 'application/pdf', 1000);
insert into storage.objects (bucket_id, name, owner) values
  ('documents', '00000000-0000-0000-0000-0000000000d2/p.pdf', '00000000-0000-0000-0000-0000000000d2');

select is((select public from storage.buckets where id = 'documents'), false, 'the documents bucket is private');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select is((select count(*) from public.documents)::int, 0, 'a user cannot see another user''s documents');
select is((select count(*) from storage.objects where bucket_id = 'documents')::int, 0, 'a user cannot see another user''s files');
select throws_ok($$insert into public.documents (kind, title, path, mime, size_bytes) values ('cv', 'CV', '00000000-0000-0000-0000-0000000000d2/x.pdf', 'application/pdf', 10)$$, '23514', null, 'a document row must point into your own folder');
select lives_ok($$insert into public.documents (kind, title, path, mime, size_bytes) values ('cv', 'CV', '00000000-0000-0000-0000-0000000000d1/cv.pdf', 'application/pdf', 10)$$, 'you can add your own document');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-0000000000d2/evil.pdf')$$, '42501', null, 'you cannot put a file in someone else''s folder');
reset role;

select is((select count(*) from public.documents where user_id = '00000000-0000-0000-0000-0000000000d2')::int, 1, 'the other user''s document is untouched');

select * from finish();
