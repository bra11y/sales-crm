-- Markets: one row a day with the CBN's official rates, Nigerian market news and a plain brief.
-- The same for everyone, so any signed-in person may read it. Only the daily job writes it.
create table public.market_daily (
  day date primary key,
  rates jsonb not null default '[]'::jsonb check (jsonb_typeof(rates) = 'array'),
  news jsonb not null default '[]'::jsonb check (jsonb_typeof(news) = 'array'),
  brief text check (char_length(brief) <= 3000),
  brief_from text check (char_length(brief_from) <= 200),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.market_daily enable row level security;
create policy market_daily_read on public.market_daily for select to authenticated using (true);
revoke all on public.market_daily from anon;
revoke insert, update, delete on public.market_daily from authenticated;
