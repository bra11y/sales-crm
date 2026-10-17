insert into public.products (slug, name, host, stages, segments, tag_tones) values
  ('applications', 'Applications', 'temple-apply.vercel.app',
   array['Drafted', 'Applied', 'Interview', 'Offer', 'Won', 'Closed'],
   array['Job', 'Contract'],
   '{"Drafted":"neutral","Applied":"blue","Interview":"amber","Offer":"orange","Won":"green","Closed":"neutral","Job":"purple","Contract":"teal"}')
on conflict (slug) do update set
  name = excluded.name, host = excluded.host, stages = excluded.stages,
  segments = excluded.segments, tag_tones = excluded.tag_tones;
