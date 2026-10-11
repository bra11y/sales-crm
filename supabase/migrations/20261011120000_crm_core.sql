create extension if not exists pgcrypto;

create table public.workspaces (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null check (kind in ('internal', 'embedded')),
  product text,
  external_tenant_id text,
  created_at timestamptz not null default now(),
  unique (product, external_tenant_id)
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id bigint not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);
create index workspace_members_user on public.workspace_members (user_id);

create table public.products (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null,
  host text,
  stages text[] not null default '{}',
  segments text[] not null default '{}',
  tag_tones jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.events (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references public.workspaces (id),
  product text not null references public.products (slug),
  event_id text not null unique,
  type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'applied', 'failed')),
  error text,
  received_at timestamptz not null default now()
);
create index events_product_received on public.events (product, received_at desc);
create index events_failed on public.events (status) where status = 'failed';

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id bigint not null references public.workspaces (id),
  product text not null references public.products (slug),
  external_id text not null,
  name text not null,
  stage text,
  segment text,
  owner_id uuid references public.profiles (user_id) on delete set null,
  pipeline_value_minor bigint not null default 0,
  currency text not null default 'NGN',
  win_probability int not null default 0 check (win_probability between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, product, external_id)
);
create index companies_workspace_product on public.companies (workspace_id, product);
create index companies_owner on public.companies (owner_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id bigint not null references public.workspaces (id),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id bigint not null references public.workspaces (id),
  company_id uuid not null references public.companies (id) on delete cascade,
  stage text,
  value_minor bigint not null default 0,
  currency text not null default 'NGN',
  status text not null check (status in ('open', 'won', 'lost')),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create table public.activities (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references public.workspaces (id),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id text unique,
  kind text not null,
  summary text not null,
  at timestamptz not null
);
create index activities_company_at on public.activities (company_id, at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id bigint not null references public.workspaces (id),
  company_id uuid not null references public.companies (id) on delete cascade,
  product text not null references public.products (slug),
  plan text not null,
  status text not null check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  amount_minor bigint not null default 0,
  currency text not null default 'NGN',
  interval_months int not null default 1 check (interval_months in (1, 3, 6, 12)),
  started_at timestamptz,
  renews_at timestamptz,
  cancelled_at timestamptz,
  source_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (company_id, product)
);
create index subscriptions_workspace on public.subscriptions (workspace_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id bigint not null references public.workspaces (id),
  company_id uuid not null references public.companies (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  amount_minor bigint not null,
  currency text not null,
  provider text not null,
  reference text not null,
  status text not null check (status in ('succeeded', 'failed')),
  paid_at timestamptz not null,
  unique (provider, reference)
);
create index payments_workspace_paid on public.payments (workspace_id, paid_at desc);
create index payments_company on public.payments (company_id);

create function public.is_member(ws bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create function public.is_owner(ws bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create function public.shares_workspace(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

revoke execute on function public.is_member(bigint), public.is_owner(bigint), public.shares_workspace(uuid) from public, anon;
grant execute on function public.is_member(bigint), public.is_owner(bigint), public.shares_workspace(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.products enable row level security;
alter table public.events enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

create policy workspaces_read on public.workspaces for select to authenticated using (public.is_member(id));

create policy profiles_read on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_workspace(user_id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy members_read on public.workspace_members for select to authenticated using (public.is_member(workspace_id));
create policy members_insert on public.workspace_members for insert to authenticated with check (public.is_owner(workspace_id));
create policy members_update on public.workspace_members for update to authenticated using (public.is_owner(workspace_id));
create policy members_delete on public.workspace_members for delete to authenticated using (public.is_owner(workspace_id));

create policy products_read on public.products for select to authenticated
  using (exists (select 1 from public.workspace_members m where m.user_id = (select auth.uid())));
create policy products_update on public.products for update to authenticated using (public.is_owner(1));

create policy events_read on public.events for select to authenticated using (public.is_member(workspace_id));

create policy companies_read on public.companies for select to authenticated using (public.is_member(workspace_id));
create policy companies_insert on public.companies for insert to authenticated with check (public.is_owner(workspace_id));
create policy companies_update on public.companies for update to authenticated
  using (public.is_owner(workspace_id) or (public.is_member(workspace_id) and owner_id = (select auth.uid())))
  with check (public.is_owner(workspace_id) or (public.is_member(workspace_id) and owner_id = (select auth.uid())));
create policy companies_delete on public.companies for delete to authenticated using (public.is_owner(workspace_id));

create policy contacts_read on public.contacts for select to authenticated using (public.is_member(workspace_id));
create policy contacts_write on public.contacts for all to authenticated using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));
create policy deals_read on public.deals for select to authenticated using (public.is_member(workspace_id));
create policy deals_write on public.deals for all to authenticated using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));
create policy activities_read on public.activities for select to authenticated using (public.is_member(workspace_id));
create policy activities_write on public.activities for all to authenticated using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));
create policy subscriptions_read on public.subscriptions for select to authenticated using (public.is_member(workspace_id));
create policy payments_read on public.payments for select to authenticated using (public.is_member(workspace_id));

create view public.company_list with (security_invoker = true) as
select
  c.id,
  c.workspace_id,
  c.product,
  c.name,
  c.stage,
  c.segment,
  p.name as owner_name,
  (select count(*) from public.deals d where d.company_id = c.id and d.status = 'open')::int as open_deals,
  c.pipeline_value_minor,
  c.currency,
  c.win_probability,
  la.at as last_interaction_at,
  la.summary as last_interaction_label,
  array(
    select count(a.id)::int
    from generate_series(13, 0, -1) as w
    left join public.activities a
      on a.company_id = c.id
     and a.at >= now() - ((w + 1) * interval '7 days')
     and a.at < now() - (w * interval '7 days')
    group by w
    order by w desc
  ) as trend
from public.companies c
left join public.profiles p on p.user_id = c.owner_id
left join lateral (
  select a.at, a.summary from public.activities a
  where a.company_id = c.id order by a.at desc limit 1
) la on true;

insert into public.workspaces (id, name, kind) overriding system value values (1, 'Internal sales', 'internal');
select setval(pg_get_serial_sequence('public.workspaces', 'id'), 1);

insert into public.products (slug, name, host, stages, segments, tag_tones) values
  ('washcare', 'WashCare', 'washcare.app',
   array['Demo requested', 'Trial', 'Trial ended', 'Paying', 'Locked', 'Cancelled'],
   array['Monthly', 'Quarterly', 'Biannual', 'Yearly'],
   '{"Demo requested":"amber","Trial":"orange","Trial ended":"red","Paying":"green","Locked":"red","Cancelled":"neutral","Monthly":"blue","Quarterly":"teal","Biannual":"purple","Yearly":"moss"}'),
  ('lux', 'Lux Laundry', 'luxlaundryng.org',
   array['Client'], array['Managed client'],
   '{"Client":"green","Managed client":"blue"}'),
  ('bihub', 'Bihub', 'bihub.ng',
   array['Store created', 'Pro', 'Cancelled'], array['Free', 'Pro'],
   '{"Store created":"orange","Pro":"green","Cancelled":"neutral","Free":"yellow"}'),
  ('direct', 'Direct sales', null,
   array['New Logo', 'Upsell', 'Expansion', 'Renewal', 'Pilot', 'Co-Sell', 'Land & Expand'],
   array['Enterprise', 'Mid-Market', 'SMB', 'Strategic'],
   '{"Enterprise":"blue","Mid-Market":"moss","SMB":"yellow","Strategic":"red","New Logo":"green","Upsell":"purple","Expansion":"green","Renewal":"green","Pilot":"orange","Co-Sell":"amber","Land & Expand":"teal"}');
