# CRM Core and Sales (Plan A) Implementation Plan

> **For agentic workers:** Required sub-skill: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the mock sales CRM into the owner's real internal CRM. Washcare, Lux Laundry and Bihub push signed events into it, and it shows companies, subscriptions, payments and sales.

**Architecture:** The CRM gets its own Supabase database, with `workspace_id` on every row and row-level security everywhere. Products POST HMAC-signed events to `/api/ingest/<product>`. A pure adapter per product turns each event into mutations, and a small engine applies them idempotently, keeping the raw event for replay. The existing UI keeps its components and reads real rows through a view.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), React 19, Zustand, Tailwind v4, Supabase (Postgres, Auth, `@supabase/ssr`), Node's built-in test runner with `--experimental-strip-types`, pgTAP through `supabase test db`.

**Spec:** `docs/superpowers/specs/2026-10-11-sales-crm-product-integration-design.md`. This plan covers build order steps 1–6. Plan B (steps 7–9: import, email, commands) and Plan C (step 10: embedded CRM) follow as separate plans.

**Repos touched:**

| Repo | Local path | Branch to create |
|---|---|---|
| sales-crm | `/Users/mac/Desktop/sales-crm` | `feat/crm-core` (from `docs/crm-product-integration-spec`) |
| washcare (Presso) | `/Users/mac/Desktop/Presso` | `feat/crm-events` |
| Lux-Laundry | `/Users/mac/Desktop/Lux-Laundry` | works on `lux-on-presso` |
| bihub-marketplace | `/Users/mac/Desktop/Bihub-marketplace` | `feat/crm-events` from its default branch, not from `feat/android-merchant-app` |

## Global Constraints

- Read `CONVENTIONS.md` in sales-crm before any component work. It requires Tailwind only, `Button` with an explicit `variant`, no code comments, the `Asset` component for media, and the `@layer base` type scale.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code. Middleware is `proxy.ts` and route `params` is a Promise.
- Accessibility follows WCAG 2.2 AA. Use native elements, one `h1` per page, a skip link first, visible `:focus-visible`, `<label for>` on every input, errors tied with `aria-describedby` and `role="alert"`, live regions for result counts, and status never shown by colour alone.
- All money is integer minor units (kobo for NGN) plus a currency code. Never add different currencies together.
- The CRM never writes to a product database. Products only send.
- The service-role key (`SUPABASE_SECRET_KEY`) is server-only. Never import `lib/supabase/admin.ts` from a client component.
- Signature: hex HMAC-SHA256 of `${timestamp}.${rawBody}`. `timestamp` is unix seconds. Requests more than 300 seconds off are rejected. Headers are `x-crm-timestamp` and `x-crm-signature`.
- `event_id` is globally unique and always prefixed with the product, for example `washcare:tenant:42:created`.
- Product slugs: `washcare`, `lux`, `bihub`, `direct`. `direct` holds companies the owner adds by hand.
- A product helper must never throw into or delay a user flow. It is called inside `after()` with a 3-second timeout.
- Pure logic in `lib/crm/` uses relative imports with the `.ts` extension, and `import type` for anything from `@/`, so Node's test runner can load it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Anything outward-facing waits for the owner's explicit yes at that step: creating Vercel or Supabase projects, setting production env vars, merging into Lux, or deploying.

## Review Focus

1. **Real dates in activity filters.** `lib/companies.ts` hard-codes `TODAY = "2026-09-14"`, so real companies would get wrong `activityDays` and vanish from the 90-day filter. Expected: days are counted from now. Pinned in Task 8 (`toCompany` test).
2. **A trial that ended with no event.** Washcare never stores `locked`, because the lock is derived from `trial_ends_at`. A trialing subscription whose end date has passed must show as "Trial ended" and must not count as a trial ending soon. Pinned in Task 9 (`effectiveStatus` test).
3. **Events out of order or missing.** A `payment.succeeded` can arrive for an account the CRM never saw created, for example because the CRM was down at sign-up. Expected: the company is created from the payment's account data. An older `subscription.changed` arriving after a newer one must not overwrite it. Pinned in Task 4 (adapter test) and Task 5 (apply test).
4. **CRM down or slow during a sign-up or payment.** Expected: the product's flow finishes normally, and the helper returns `false` within 3 seconds without throwing. Pinned in Task 11 (`send.test.ts`).
5. **A company added by hand disappears on reload.** The current "New company" dialog only writes to the browser store. Expected: it is saved under product `direct` and is still there after reload. Pinned in Task 8 (server action and manual check).

---

## File Structure (sales-crm)

| Path | Responsibility |
|---|---|
| `supabase/config.toml` | Local Supabase config, sign-up disabled |
| `supabase/migrations/20261011120000_crm_core.sql` | Tables, view, RLS, seeds for products and workspace 1 |
| `supabase/tests/database/rls.test.sql` | pgTAP row-level security tests |
| `lib/crm/signature.ts` | Sign and verify request bodies |
| `lib/crm/events.ts` | Event types and `parseEvent` |
| `lib/crm/mutations.ts` | The `Mutation` union |
| `lib/crm/money.ts` | Monthly, annualised, MRR, formatting |
| `lib/crm/adapters/shared.ts` | Shared event-to-mutation building |
| `lib/crm/adapters/presso.ts` | Washcare and Lux adapters |
| `lib/crm/adapters/bihub.ts` | Bihub adapter |
| `lib/crm/adapters/index.ts` | `adapterFor(product)` |
| `lib/crm/apply.ts` | `CrmDb` interface, `applyEvent`, `replayEvent` |
| `lib/crm/ingest.ts` | `handleIngest`, the whole request decision without Next |
| `lib/crm/supabase-db.ts` | `CrmDb` over Supabase |
| `lib/crm/overview.ts` | `effectiveStatus`, `overviewFigures` |
| `lib/crm/to-company.ts` | View row to UI `Company` |
| `lib/crm/test-fakes.ts` | In-memory `CrmDb` for tests |
| `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/proxy-session.ts` | Supabase clients |
| `proxy.ts` | Optimistic login redirect |
| `app/api/ingest/[product]/route.ts` | Ingest endpoint |
| `app/login/page.tsx`, `app/login/actions.ts`, `app/login/login-form.tsx` | Owner login |
| `app/(crm)/layout.tsx` | Skip link, sidebar, `<main>` |
| `app/(crm)/page.tsx` | Companies, real data |
| `app/(crm)/overview/page.tsx`, `app/(crm)/subscriptions/page.tsx`, `app/(crm)/payments/page.tsx` | Sales screens |
| `app/(crm)/actions.ts` | `createCompany`, `signOut` |
| `components/companies/companies-data.tsx` | Client hydrator for the store |
| `components/_common/sidebar/product-switcher.tsx` | Product switcher |
| `components/sales/*` | Overview figures, subscriptions table, payments table, product status |
| `scripts/send-event.mjs` | Sign and send one event file (smoke tests, registering Lux) |

---

### Task 1: Database, row-level security and test runner

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20261011120000_crm_core.sql`, `supabase/tests/database/rls.test.sql`
- Modify: `package.json` (scripts, deps), `tsconfig.json` (`allowImportingTsExtensions`)

**Interfaces:**
- Produces: the tables `workspaces`, `profiles`, `workspace_members`, `products`, `events`, `companies`, `contacts`, `deals`, `activities`, `subscriptions`, `payments`; the view `company_list`; the functions `is_member(bigint)` and `is_owner(bigint)`; workspace 1 (`Internal sales`); product rows `washcare`, `lux`, `bihub` and `direct`.

**Prerequisite:** Docker Desktop is running. The Supabase CLI 2.120.0 is installed at `/usr/local/bin/supabase`.

- [ ] **Step 1: Create the branch and install dependencies**

```bash
cd /Users/mac/Desktop/sales-crm
git checkout -b feat/crm-core
npm install @supabase/supabase-js @supabase/ssr
supabase init
```

- [ ] **Step 2: Add test scripts and allow `.ts` import extensions**

In `package.json` `scripts`, add:

```json
"test": "node --experimental-strip-types --test \"lib/**/*.test.ts\"",
"test:db": "supabase test db",
"db:reset": "supabase db reset"
```

In `tsconfig.json` `compilerOptions`, add `"allowImportingTsExtensions": true`. `noEmit` is already true in Next projects. Confirm it is, because the option requires it.

- [ ] **Step 3: Disable public sign-up locally**

In `supabase/config.toml`, under `[auth]`, set `enable_signup = false`. Under `[auth.email]`, set `enable_signup = false`.

- [ ] **Step 4: Write the failing RLS test**

Create `supabase/tests/database/rls.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'member@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'outsider@test.local');

insert into public.profiles (user_id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Owner'),
  ('00000000-0000-0000-0000-000000000002', 'Member'),
  ('00000000-0000-0000-0000-000000000003', 'Outsider');

insert into public.workspaces (id, name, kind) overriding system value values (2, 'Other', 'internal');

insert into public.workspace_members (workspace_id, user_id, role) values
  (1, '00000000-0000-0000-0000-000000000001', 'owner'),
  (1, '00000000-0000-0000-0000-000000000002', 'member'),
  (2, '00000000-0000-0000-0000-000000000003', 'owner');

insert into public.companies (id, workspace_id, product, external_id, name, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 1, 'washcare', 't1', 'Owner co', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000b', 1, 'washcare', 't2', 'Member co', '00000000-0000-0000-0000-000000000002');

set local role anon;
select is((select count(*) from public.companies)::int, 0, 'signed-out reads no companies');
select is((select count(*) from public.company_list)::int, 0, 'signed-out reads nothing from the view');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.companies)::int, 0, 'a user in another workspace reads nothing');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.companies)::int, 2, 'a member reads every company in the workspace');

update public.companies set name = 'Changed' where id = '10000000-0000-0000-0000-00000000000a';
select is((select name from public.companies where id = '10000000-0000-0000-0000-00000000000a'), 'Owner co', 'a member cannot edit another owner''s company');

update public.companies set name = 'Mine' where id = '10000000-0000-0000-0000-00000000000b';
select is((select name from public.companies where id = '10000000-0000-0000-0000-00000000000b'), 'Mine', 'a member edits their own company');

select throws_ok(
  $$ insert into public.events (workspace_id, product, event_id, type, occurred_at, payload) values (1, 'washcare', 'x', 'lead.captured', now(), '{}') $$,
  '42501',
  null,
  'a signed-in user cannot write events'
);

select * from finish();
rollback;
```

- [ ] **Step 5: Run it to see it fail**

```bash
supabase start
npm run test:db
```

Expected: fails with `relation "public.profiles" does not exist`.

- [ ] **Step 6: Write the migration**

Create `supabase/migrations/20261011120000_crm_core.sql`:

```sql
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
```

- [ ] **Step 7: Reset and run the tests**

```bash
npm run db:reset && npm run test:db
```

Expected: `ok 1` … `ok 7`, `All tests successful.`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json supabase
git commit -m "Add CRM database with workspaces, row-level security and pgTAP tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Request signatures

**Files:**
- Create: `lib/crm/signature.ts`, `lib/crm/signature.test.ts`

**Interfaces:**
- Produces: `signPayload(secret: string, timestamp: string, body: string): string` and `verifySignature(input: VerifyInput): { ok: true } | { ok: false; reason: string }`, where `VerifyInput = { secret: string; timestamp: string | null; signature: string | null; body: string; nowSeconds: number; toleranceSeconds?: number }`.

- [ ] **Step 1: Write the failing test**

`lib/crm/signature.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, verifySignature } from "./signature.ts";

const secret = "test-secret";
const body = '{"event_id":"washcare:x"}';
const now = 1_760_000_000;

test("a correct signature passes", () => {
  const signature = signPayload(secret, String(now), body);
  assert.deepEqual(verifySignature({ secret, timestamp: String(now), signature, body, nowSeconds: now }), { ok: true });
});

test("a body changed after signing fails, even by one space", () => {
  const signature = signPayload(secret, String(now), body);
  const result = verifySignature({ secret, timestamp: String(now), signature, body: `${body} `, nowSeconds: now });
  assert.equal(result.ok, false);
});

test("a wrong secret fails", () => {
  const signature = signPayload("other", String(now), body);
  assert.equal(verifySignature({ secret, timestamp: String(now), signature, body, nowSeconds: now }).ok, false);
});

test("a timestamp more than 300 seconds old fails", () => {
  const then = String(now - 301);
  const signature = signPayload(secret, then, body);
  const result = verifySignature({ secret, timestamp: then, signature, body, nowSeconds: now });
  assert.deepEqual(result, { ok: false, reason: "The request is too old or from the future." });
});

test("missing headers fail without throwing", () => {
  assert.equal(verifySignature({ secret, timestamp: null, signature: null, body, nowSeconds: now }).ok, false);
});

test("a signature of the wrong length fails without throwing", () => {
  assert.equal(verifySignature({ secret, timestamp: String(now), signature: "abc", body, nowSeconds: now }).ok, false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test`
Expected: fails with `Cannot find module '.../lib/crm/signature.ts'`.

- [ ] **Step 3: Implement**

`lib/crm/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyInput = {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds: number;
  toleranceSeconds?: number;
};

export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySignature({
  secret,
  timestamp,
  signature,
  body,
  nowSeconds,
  toleranceSeconds = 300,
}: VerifyInput): { ok: true } | { ok: false; reason: string } {
  if (!timestamp || !signature) return { ok: false, reason: "The request is not signed." };
  const sent = Number(timestamp);
  if (!Number.isInteger(sent) || Math.abs(nowSeconds - sent) > toleranceSeconds) {
    return { ok: false, reason: "The request is too old or from the future." };
  }
  const expected = Buffer.from(signPayload(secret, timestamp, body), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "The signature does not match." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/crm/signature.ts lib/crm/signature.test.ts
git commit -m "Add HMAC signing and verification for ingest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Event contract and parsing

**Files:**
- Create: `lib/crm/events.ts`, `lib/crm/events.test.ts`, `lib/crm/mutations.ts`

**Interfaces:**
- Produces (`events.ts`):

```ts
export const EVENT_TYPES: readonly ["account.created", "lead.captured", "subscription.changed", "payment.succeeded", "payment.failed"];
export type CrmEventType = (typeof EVENT_TYPES)[number];
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";
export type AccountData = { id: string; name: string; city?: string };
export type ContactData = { name: string; email?: string; phone?: string };
export type SubscriptionData = { plan: string; status: SubscriptionStatus; amount_minor: number; currency: string; interval_months: 1 | 3 | 6 | 12; started_at?: string; renews_at?: string; cancelled_at?: string };
export type PaymentData = { reference: string; amount_minor: number; currency: string; provider: string; paid_at: string };
export type EventData = { account: AccountData; contact?: ContactData; subscription?: SubscriptionData; payment?: PaymentData; note?: string; segment?: string };
export type CrmEvent = { event_id: string; product: string; type: CrmEventType; occurred_at: string; data: EventData };
export function parseEvent(raw: string): { ok: true; event: CrmEvent } | { ok: false; reason: string };
```

- Produces (`mutations.ts`): the `Mutation` union below.

- [ ] **Step 1: Write `mutations.ts`.** It is types only, so it needs no test.

```ts
import type { SubscriptionStatus } from "./events.ts";

export type CompanyMutation = {
  kind: "company";
  externalId: string;
  name: string;
  stage?: string;
  segment?: string;
  winProbability?: number;
  pipelineValueMinor?: number;
  currency?: string;
};

export type ContactMutation = { kind: "contact"; externalId: string; name: string; email?: string; phone?: string };

export type SubscriptionMutation = {
  kind: "subscription";
  externalId: string;
  plan: string;
  status: SubscriptionStatus;
  amountMinor: number;
  currency: string;
  intervalMonths: 1 | 3 | 6 | 12;
  startedAt: string | null;
  renewsAt: string | null;
  cancelledAt: string | null;
  sourceAt: string;
};

export type DealMutation = {
  kind: "deal";
  externalId: string;
  stage: string;
  valueMinor: number;
  currency: string;
  status: "open" | "won" | "lost";
};

export type PaymentMutation = {
  kind: "payment";
  externalId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  provider: string;
  status: "succeeded" | "failed";
  paidAt: string;
};

export type ActivityMutation = { kind: "activity"; externalId: string; activityKind: string; summary: string; at: string };

export type Mutation =
  | CompanyMutation
  | ContactMutation
  | SubscriptionMutation
  | DealMutation
  | PaymentMutation
  | ActivityMutation;
```

- [ ] **Step 2: Write the failing test**

`lib/crm/events.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEvent } from "./events.ts";

const valid = {
  event_id: "washcare:tenant:42:created",
  product: "washcare",
  type: "account.created",
  occurred_at: "2026-10-11T09:00:00.000Z",
  data: { account: { id: "42", name: "Clean Lagos" } },
};

test("a valid event parses", () => {
  const result = parseEvent(JSON.stringify(valid));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.event.data.account.name, "Clean Lagos");
});

test("broken JSON is refused with a reason", () => {
  assert.deepEqual(parseEvent("{"), { ok: false, reason: "The body is not valid JSON." });
});

test("an unknown type is refused", () => {
  const result = parseEvent(JSON.stringify({ ...valid, type: "order.created" }));
  assert.deepEqual(result, { ok: false, reason: "Unknown event type: order.created." });
});

test("an event_id without the product prefix is refused", () => {
  const result = parseEvent(JSON.stringify({ ...valid, event_id: "tenant:42:created" }));
  assert.equal(result.ok, false);
});

test("a missing account name is refused", () => {
  const result = parseEvent(JSON.stringify({ ...valid, data: { account: { id: "42" } } }));
  assert.equal(result.ok, false);
});

test("a bad date is refused", () => {
  assert.equal(parseEvent(JSON.stringify({ ...valid, occurred_at: "yesterday" })).ok, false);
});

test("a payment with a fractional amount is refused", () => {
  const event = {
    ...valid,
    type: "payment.succeeded",
    data: {
      account: { id: "42", name: "Clean Lagos" },
      payment: { reference: "r1", amount_minor: 10.5, currency: "NGN", provider: "paystack", paid_at: valid.occurred_at },
    },
  };
  assert.equal(parseEvent(JSON.stringify(event)).ok, false);
});

test("a payment event without payment data is refused", () => {
  const result = parseEvent(JSON.stringify({ ...valid, type: "payment.succeeded" }));
  assert.deepEqual(result, { ok: false, reason: "A payment event needs data.payment." });
});

test("a subscription with an unsupported interval is refused", () => {
  const event = {
    ...valid,
    type: "subscription.changed",
    data: {
      account: { id: "42", name: "Clean Lagos" },
      subscription: { plan: "washcare", status: "active", amount_minor: 100, currency: "NGN", interval_months: 2 },
    },
  };
  assert.equal(parseEvent(JSON.stringify(event)).ok, false);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm test`
Expected: fails, because `events.ts` cannot be found.

- [ ] **Step 4: Implement `lib/crm/events.ts`**

```ts
export const EVENT_TYPES = [
  "account.created",
  "lead.captured",
  "subscription.changed",
  "payment.succeeded",
  "payment.failed",
] as const;

export type CrmEventType = (typeof EVENT_TYPES)[number];
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";

export type AccountData = { id: string; name: string; city?: string };
export type ContactData = { name: string; email?: string; phone?: string };
export type SubscriptionData = {
  plan: string;
  status: SubscriptionStatus;
  amount_minor: number;
  currency: string;
  interval_months: 1 | 3 | 6 | 12;
  started_at?: string;
  renews_at?: string;
  cancelled_at?: string;
};
export type PaymentData = {
  reference: string;
  amount_minor: number;
  currency: string;
  provider: string;
  paid_at: string;
};
export type EventData = {
  account: AccountData;
  contact?: ContactData;
  subscription?: SubscriptionData;
  payment?: PaymentData;
  note?: string;
  segment?: string;
};
export type CrmEvent = {
  event_id: string;
  product: string;
  type: CrmEventType;
  occurred_at: string;
  data: EventData;
};

type Result = { ok: true; event: CrmEvent } | { ok: false; reason: string };

const STATUSES = ["trialing", "active", "past_due", "cancelled"];
const INTERVALS = [1, 3, 6, 12];

function isText(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function checkSubscription(s: Record<string, unknown>): string | null {
  if (!isText(s.plan, 80)) return "data.subscription.plan is missing.";
  if (!STATUSES.includes(s.status as string)) return "data.subscription.status is not a known status.";
  if (!isMinor(s.amount_minor)) return "data.subscription.amount_minor must be a whole number of minor units.";
  if (!isCurrency(s.currency)) return "data.subscription.currency must be a three-letter code.";
  if (!INTERVALS.includes(s.interval_months as number)) return "data.subscription.interval_months must be 1, 3, 6 or 12.";
  for (const key of ["started_at", "renews_at", "cancelled_at"]) {
    if (s[key] !== undefined && s[key] !== null && !isDate(s[key])) return `data.subscription.${key} is not a date.`;
  }
  return null;
}

function checkPayment(p: Record<string, unknown>): string | null {
  if (!isText(p.reference, 120)) return "data.payment.reference is missing.";
  if (!isMinor(p.amount_minor)) return "data.payment.amount_minor must be a whole number of minor units.";
  if (!isCurrency(p.currency)) return "data.payment.currency must be a three-letter code.";
  if (!isText(p.provider, 40)) return "data.payment.provider is missing.";
  if (!isDate(p.paid_at)) return "data.payment.paid_at is not a date.";
  return null;
}

export function parseEvent(raw: string): Result {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "The body is not valid JSON." };
  }
  if (!value || typeof value !== "object") return { ok: false, reason: "The body must be an object." };
  const e = value as Record<string, unknown>;

  if (!isText(e.product, 40) || !/^[a-z0-9-]+$/.test(e.product)) return { ok: false, reason: "product is missing." };
  if (!isText(e.event_id, 200) || !e.event_id.startsWith(`${e.product}:`)) {
    return { ok: false, reason: "event_id must start with the product, like washcare:..." };
  }
  if (!EVENT_TYPES.includes(e.type as CrmEventType)) return { ok: false, reason: `Unknown event type: ${String(e.type)}.` };
  if (!isDate(e.occurred_at)) return { ok: false, reason: "occurred_at is not a date." };

  const data = e.data as Record<string, unknown> | undefined;
  const account = data?.account as Record<string, unknown> | undefined;
  if (!account || !isText(account.id, 120) || !isText(account.name, 200)) {
    return { ok: false, reason: "data.account needs an id and a name." };
  }

  const contact = data?.contact as Record<string, unknown> | undefined;
  if (contact !== undefined && !isText(contact.name, 200)) return { ok: false, reason: "data.contact needs a name." };

  if (data?.subscription !== undefined) {
    const problem = checkSubscription(data.subscription as Record<string, unknown>);
    if (problem) return { ok: false, reason: problem };
  }
  if (e.type === "subscription.changed" && data?.subscription === undefined) {
    return { ok: false, reason: "A subscription event needs data.subscription." };
  }

  if (e.type === "payment.succeeded" || e.type === "payment.failed") {
    if (data?.payment === undefined) return { ok: false, reason: "A payment event needs data.payment." };
    const problem = checkPayment(data.payment as Record<string, unknown>);
    if (problem) return { ok: false, reason: problem };
  }

  return { ok: true, event: value as CrmEvent };
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add lib/crm/events.ts lib/crm/events.test.ts lib/crm/mutations.ts
git commit -m "Add the CRM event contract and its parser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Money helpers and product adapters

**Files:**
- Create: `lib/crm/money.ts`, `lib/crm/money.test.ts`, `lib/crm/adapters/shared.ts`, `lib/crm/adapters/presso.ts`, `lib/crm/adapters/bihub.ts`, `lib/crm/adapters/index.ts`, `lib/crm/adapters/adapters.test.ts`

**Interfaces:**
- Consumes: `CrmEvent`, `SubscriptionData`, `SubscriptionStatus` from Task 3, and `Mutation` from Task 3.
- Produces:
  - `monthlyMinor(amountMinor: number, intervalMonths: number): number`
  - `annualisedMinor(amountMinor: number, intervalMonths: number): number`
  - `formatMoney(minor: number, currency: string): string`
  - `type Adapter = (event: CrmEvent) => Mutation[]`
  - `adaptWashcare`, `adaptLux`, `adaptBihub: Adapter`
  - `adapterFor(product: string): Adapter | null`

- [ ] **Step 1: Write the failing money test**

`lib/crm/money.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { annualisedMinor, formatMoney, monthlyMinor } from "./money.ts";

test("monthly value divides the term and rounds to whole kobo", () => {
  assert.equal(monthlyMinor(1_080_000, 12), 90_000);
  assert.equal(monthlyMinor(100_000, 3), 33_333);
});

test("annualised value scales any term to twelve months", () => {
  assert.equal(annualisedMinor(120_000, 1), 1_440_000);
  assert.equal(annualisedMinor(300_000, 3), 1_200_000);
});

test("formatMoney shows naira from kobo", () => {
  assert.equal(formatMoney(1_250_050, "NGN"), "₦12,500.50");
});
```

- [ ] **Step 2: Run it to see it fail, then implement `lib/crm/money.ts`**

Run: `npm test` (expected: fails, module missing).

```ts
export function monthlyMinor(amountMinor: number, intervalMonths: number): number {
  return Math.round(amountMinor / intervalMonths);
}

export function annualisedMinor(amountMinor: number, intervalMonths: number): number {
  return Math.round((amountMinor * 12) / intervalMonths);
}

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(minor / 100);
}
```

Run: `npm test` (expected: passes).

- [ ] **Step 3: Write the failing adapter tests**

`lib/crm/adapters/adapters.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CrmEvent } from "../events.ts";
import { adapterFor } from "./index.ts";

const at = "2026-10-11T09:00:00.000Z";

function event(partial: Partial<CrmEvent> & Pick<CrmEvent, "type" | "product">): CrmEvent {
  return {
    event_id: `${partial.product}:test`,
    occurred_at: at,
    data: { account: { id: "42", name: "Clean Lagos" } },
    ...partial,
  };
}

test("unknown products have no adapter", () => {
  assert.equal(adapterFor("nope"), null);
});

test("a Washcare sign-up becomes a Trial company with a contact, a trialing subscription and an activity", () => {
  const m = adapterFor("washcare")!(
    event({
      product: "washcare",
      type: "account.created",
      data: {
        account: { id: "42", name: "Clean Lagos" },
        contact: { name: "Ada", email: "ada@clean.ng", phone: "+2348000000000" },
        subscription: { plan: "washcare", status: "trialing", amount_minor: 0, currency: "NGN", interval_months: 1, renews_at: "2026-10-18T09:00:00.000Z" },
      },
    }),
  );
  assert.deepEqual(m.map((x) => x.kind), ["company", "contact", "subscription", "deal", "activity"]);
  assert.deepEqual(m[0], { kind: "company", externalId: "42", name: "Clean Lagos", stage: "Trial", segment: "Monthly", winProbability: 40, pipelineValueMinor: 0, currency: "NGN" });
  assert.equal(m[3].kind === "deal" && m[3].status, "open");
  assert.equal(m[4].kind === "activity" && m[4].summary, "Signed up");
});

test("a Washcare payment for an account the CRM never saw still creates the company first", () => {
  const m = adapterFor("washcare")!(
    event({
      product: "washcare",
      type: "payment.succeeded",
      data: {
        account: { id: "77", name: "Fresh Fold" },
        payment: { reference: "ps_1", amount_minor: 1_080_000, currency: "NGN", provider: "paystack", paid_at: at },
        subscription: { plan: "washcare", status: "active", amount_minor: 1_080_000, currency: "NGN", interval_months: 12 },
      },
    }),
  );
  assert.equal(m[0].kind, "company");
  assert.equal(m[0].kind === "company" && m[0].stage, "Paying");
  assert.equal(m[0].kind === "company" && m[0].segment, "Yearly");
  assert.equal(m[0].kind === "company" && m[0].pipelineValueMinor, 1_080_000);
  assert.ok(m.some((x) => x.kind === "payment" && x.reference === "ps_1" && x.status === "succeeded"));
  assert.ok(m.some((x) => x.kind === "deal" && x.status === "won"));
  assert.ok(m.some((x) => x.kind === "activity" && x.summary === "Paid ₦10,800.00"));
});

test("a Washcare demo request is a Demo requested lead", () => {
  const m = adapterFor("washcare")!(
    event({ product: "washcare", type: "lead.captured", data: { account: { id: "demo:9", name: "Spin City" }, contact: { name: "Tolu" } } }),
  );
  assert.equal(m[0].kind === "company" && m[0].stage, "Demo requested");
  assert.equal(m[0].kind === "company" && m[0].winProbability, 20);
  assert.ok(m.some((x) => x.kind === "activity" && x.summary === "Requested a demo"));
});

test("a past-due Washcare subscription is Locked, and cancelled is Cancelled with a lost deal", () => {
  const sub = { plan: "washcare", amount_minor: 120_000, currency: "NGN", interval_months: 1 as const };
  const locked = adapterFor("washcare")!(event({ product: "washcare", type: "subscription.changed", data: { account: { id: "1", name: "A" }, subscription: { ...sub, status: "past_due" } } }));
  const cancelled = adapterFor("washcare")!(event({ product: "washcare", type: "subscription.changed", data: { account: { id: "1", name: "A" }, subscription: { ...sub, status: "cancelled" } } }));
  assert.equal(locked[0].kind === "company" && locked[0].stage, "Locked");
  assert.equal(cancelled[0].kind === "company" && cancelled[0].stage, "Cancelled");
  assert.ok(cancelled.some((x) => x.kind === "deal" && x.status === "lost"));
});

test("a Lux event is always the Client stage", () => {
  const m = adapterFor("lux")!(event({ product: "lux", type: "account.created" }));
  assert.equal(m[0].kind === "company" && m[0].stage, "Client");
  assert.equal(m[0].kind === "company" && m[0].segment, "Managed client");
});

test("a Bihub store is Store created on the Free segment, and Pro after payment", () => {
  const created = adapterFor("bihub")!(event({ product: "bihub", type: "account.created" }));
  assert.equal(created[0].kind === "company" && created[0].stage, "Store created");
  assert.equal(created[0].kind === "company" && created[0].segment, "Free");
  const paid = adapterFor("bihub")!(
    event({
      product: "bihub",
      type: "payment.succeeded",
      data: {
        account: { id: "s1", name: "Ade Fabrics" },
        payment: { reference: "bh_1", amount_minor: 500_000, currency: "NGN", provider: "paystack", paid_at: at },
        subscription: { plan: "pro", status: "active", amount_minor: 500_000, currency: "NGN", interval_months: 1 },
      },
    }),
  );
  assert.equal(paid[0].kind === "company" && paid[0].stage, "Pro");
  assert.equal(paid[0].kind === "company" && paid[0].segment, "Pro");
});

test("a failed payment records a failed payment and an activity, and leaves stage alone", () => {
  const m = adapterFor("washcare")!(
    event({
      product: "washcare",
      type: "payment.failed",
      data: { account: { id: "1", name: "A" }, payment: { reference: "f1", amount_minor: 120_000, currency: "NGN", provider: "paystack", paid_at: at } },
    }),
  );
  assert.equal(m[0].kind === "company" && m[0].stage, undefined);
  assert.ok(m.some((x) => x.kind === "payment" && x.status === "failed"));
  assert.ok(m.some((x) => x.kind === "activity" && x.summary === "Payment failed: ₦1,200.00"));
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npm test`
Expected: fails, because `./index.ts` cannot be found.

- [ ] **Step 5: Implement the adapters**

`lib/crm/adapters/shared.ts`:

```ts
import type { CrmEvent, SubscriptionData, SubscriptionStatus } from "../events.ts";
import type { CompanyMutation, Mutation } from "../mutations.ts";
import { annualisedMinor, formatMoney } from "../money.ts";

export type Adapter = (event: CrmEvent) => Mutation[];

export type ProductRules = {
  stageFor: (event: CrmEvent) => string | undefined;
  segmentFor: (event: CrmEvent) => string | undefined;
  probability: Record<string, number>;
  leadSummary: string;
};

const SUMMARY: Record<CrmEvent["type"], string> = {
  "account.created": "Signed up",
  "lead.captured": "",
  "subscription.changed": "Subscription changed",
  "payment.succeeded": "",
  "payment.failed": "",
};

export function dealStatusFor(status: SubscriptionStatus): "open" | "won" | "lost" {
  if (status === "active") return "won";
  if (status === "cancelled") return "lost";
  return "open";
}

function summaryFor(event: CrmEvent, rules: ProductRules): string {
  const payment = event.data.payment;
  if (event.type === "payment.succeeded" && payment) return `Paid ${formatMoney(payment.amount_minor, payment.currency)}`;
  if (event.type === "payment.failed" && payment) return `Payment failed: ${formatMoney(payment.amount_minor, payment.currency)}`;
  if (event.type === "lead.captured") return rules.leadSummary;
  if (event.type === "subscription.changed" && event.data.subscription) {
    const s = event.data.subscription;
    return `Plan ${s.plan} is now ${s.status.replace("_", " ")}`;
  }
  return SUMMARY[event.type];
}

function subscriptionValue(s: SubscriptionData | undefined): number | undefined {
  if (!s) return undefined;
  return s.status === "cancelled" ? 0 : annualisedMinor(s.amount_minor, s.interval_months);
}

export function buildMutations(event: CrmEvent, rules: ProductRules): Mutation[] {
  const { account, contact, subscription, payment } = event.data;
  const externalId = account.id;
  const stage = rules.stageFor(event);

  const company: CompanyMutation = { kind: "company", externalId, name: account.name };
  if (stage !== undefined) {
    company.stage = stage;
    company.winProbability = rules.probability[stage] ?? 0;
  }
  const segment = rules.segmentFor(event);
  if (segment !== undefined) company.segment = segment;
  const value = subscriptionValue(subscription);
  if (value !== undefined && subscription) {
    company.pipelineValueMinor = value;
    company.currency = subscription.currency;
  }

  const out: Mutation[] = [company];

  if (contact) out.push({ kind: "contact", externalId, name: contact.name, email: contact.email, phone: contact.phone });

  if (subscription) {
    out.push({
      kind: "subscription",
      externalId,
      plan: subscription.plan,
      status: subscription.status,
      amountMinor: subscription.amount_minor,
      currency: subscription.currency,
      intervalMonths: subscription.interval_months,
      startedAt: subscription.started_at ?? null,
      renewsAt: subscription.renews_at ?? null,
      cancelledAt: subscription.cancelled_at ?? null,
      sourceAt: event.occurred_at,
    });
    out.push({
      kind: "deal",
      externalId,
      stage: stage ?? subscription.status,
      valueMinor: value ?? 0,
      currency: subscription.currency,
      status: dealStatusFor(subscription.status),
    });
  }

  if (payment) {
    out.push({
      kind: "payment",
      externalId,
      reference: payment.reference,
      amountMinor: payment.amount_minor,
      currency: payment.currency,
      provider: payment.provider,
      status: event.type === "payment.failed" ? "failed" : "succeeded",
      paidAt: payment.paid_at,
    });
  }

  out.push({ kind: "activity", externalId, activityKind: event.type, summary: summaryFor(event, rules), at: event.occurred_at });
  return out;
}
```

`lib/crm/adapters/presso.ts`:

```ts
import type { CrmEvent } from "../events.ts";
import { type Adapter, buildMutations } from "./shared.ts";

const TERM: Record<number, string> = { 1: "Monthly", 3: "Quarterly", 6: "Biannual", 12: "Yearly" };

const WASHCARE_STAGE: Record<string, string> = {
  trialing: "Trial",
  active: "Paying",
  past_due: "Locked",
  cancelled: "Cancelled",
};

function washcareStage(event: CrmEvent): string | undefined {
  if (event.type === "lead.captured") return "Demo requested";
  if (event.type === "payment.failed") return undefined;
  const status = event.data.subscription?.status;
  if (status) return WASHCARE_STAGE[status];
  if (event.type === "payment.succeeded") return "Paying";
  if (event.type === "account.created") return "Trial";
  return undefined;
}

export const adaptWashcare: Adapter = (event) =>
  buildMutations(event, {
    stageFor: washcareStage,
    segmentFor: (e) => (e.data.subscription ? TERM[e.data.subscription.interval_months] : undefined),
    probability: { "Demo requested": 20, Trial: 40, "Trial ended": 15, Paying: 100, Locked: 15, Cancelled: 0 },
    leadSummary: "Requested a demo",
  });

export const adaptLux: Adapter = (event) =>
  buildMutations(event, {
    stageFor: () => "Client",
    segmentFor: () => "Managed client",
    probability: { Client: 100 },
    leadSummary: "New enquiry",
  });
```

`lib/crm/adapters/bihub.ts`:

```ts
import type { CrmEvent } from "../events.ts";
import { type Adapter, buildMutations } from "./shared.ts";

function bihubStage(event: CrmEvent): string | undefined {
  if (event.type === "payment.failed") return undefined;
  const s = event.data.subscription;
  if (s?.status === "cancelled") return "Cancelled";
  if (s?.status === "active" || event.type === "payment.succeeded") return "Pro";
  if (event.type === "account.created") return "Store created";
  return undefined;
}

function bihubSegment(event: CrmEvent): string | undefined {
  if (event.type === "payment.failed") return undefined;
  if (event.data.subscription?.status === "active") return "Pro";
  if (event.type === "account.created") return "Free";
  return undefined;
}

export const adaptBihub: Adapter = (event) =>
  buildMutations(event, {
    stageFor: bihubStage,
    segmentFor: bihubSegment,
    probability: { "Store created": 30, Pro: 100, Cancelled: 0 },
    leadSummary: "Joined the waitlist",
  });
```

`lib/crm/adapters/index.ts`:

```ts
import type { Adapter } from "./shared.ts";
import { adaptBihub } from "./bihub.ts";
import { adaptLux, adaptWashcare } from "./presso.ts";

const ADAPTERS: Record<string, Adapter> = {
  washcare: adaptWashcare,
  lux: adaptLux,
  bihub: adaptBihub,
};

export function adapterFor(product: string): Adapter | null {
  return ADAPTERS[product] ?? null;
}

export type { Adapter };
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all passing. If the `₦` formatting differs on this Node's ICU, check the output with `node -e 'console.log(new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",currencyDisplay:"narrowSymbol"}).format(10800))'`. Change the expected strings in the tests only if the symbol and grouping are still correct.

- [ ] **Step 7: Commit**

```bash
git add lib/crm/money.ts lib/crm/money.test.ts lib/crm/adapters
git commit -m "Add money helpers and adapters for Washcare, Lux and Bihub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Apply engine with idempotency, ordering and replay

**Files:**
- Create: `lib/crm/apply.ts`, `lib/crm/test-fakes.ts`, `lib/crm/apply.test.ts`

**Interfaces:**
- Consumes: `CrmEvent` (Task 3), `Mutation` (Task 3), `adapterFor` (Task 4).
- Produces:

```ts
export interface CrmDb {
  insertEvent(event: CrmEvent, workspaceId: number): Promise<{ id: number } | null>;
  setEventStatus(id: number, status: "applied" | "failed", error: string | null): Promise<void>;
  upsertCompany(workspaceId: number, product: string, m: CompanyMutation): Promise<string>;
  upsertContact(workspaceId: number, companyId: string, m: ContactMutation): Promise<void>;
  upsertSubscription(workspaceId: number, companyId: string, product: string, m: SubscriptionMutation): Promise<string | null>;
  upsertDeal(workspaceId: number, companyId: string, m: DealMutation): Promise<void>;
  upsertPayment(workspaceId: number, companyId: string, subscriptionId: string | null, m: PaymentMutation): Promise<void>;
  insertActivity(workspaceId: number, companyId: string, eventId: string, m: ActivityMutation): Promise<void>;
}
export type ApplyResult = { status: "applied" } | { status: "duplicate" } | { status: "failed"; error: string } | { status: "unsupported" };
export function applyEvent(event: CrmEvent, db: CrmDb, workspaceId?: number): Promise<ApplyResult>;
export function replayEvent(rowId: number, event: CrmEvent, db: CrmDb, workspaceId?: number): Promise<ApplyResult>;
export function createFakeDb(): CrmDb & { state: FakeState };
```

`upsertSubscription` returns `null` when the stored subscription has a newer `source_at`. In that case the deal stays as it is, and so do the company's stage and value.

- [ ] **Step 1: Write the fake**

`lib/crm/test-fakes.ts`:

```ts
import type { CrmDb } from "./apply.ts";
import type { CrmEvent } from "./events.ts";

export type FakeState = {
  events: Map<string, { id: number; status: string; error: string | null }>;
  companies: Map<string, { id: string; name: string; stage?: string; segment?: string; winProbability?: number; pipelineValueMinor?: number }>;
  contacts: Map<string, { name: string; email?: string }>;
  subscriptions: Map<string, { id: string; status: string; sourceAt: string; amountMinor: number }>;
  deals: Map<string, { status: string }>;
  payments: Map<string, { status: string; amountMinor: number }>;
  activities: Map<string, string>;
  failOn?: string;
};

export function createFakeDb(): CrmDb & { state: FakeState } {
  const state: FakeState = {
    events: new Map(),
    companies: new Map(),
    contacts: new Map(),
    subscriptions: new Map(),
    deals: new Map(),
    payments: new Map(),
    activities: new Map(),
  };
  let nextId = 1;
  const guard = (name: string) => {
    if (state.failOn === name) throw new Error(`${name} failed`);
  };

  return {
    state,
    async insertEvent(event: CrmEvent) {
      if (state.events.has(event.event_id)) return null;
      const id = nextId++;
      state.events.set(event.event_id, { id, status: "received", error: null });
      return { id };
    },
    async setEventStatus(id, status, error) {
      for (const row of state.events.values()) if (row.id === id) Object.assign(row, { status, error });
    },
    async upsertCompany(_ws, product, m) {
      guard("company");
      const key = `${product}:${m.externalId}`;
      const existing = state.companies.get(key);
      const next = { id: existing?.id ?? key, ...existing, name: m.name };
      for (const field of ["stage", "segment", "winProbability", "pipelineValueMinor"] as const) {
        if (m[field] !== undefined) Object.assign(next, { [field]: m[field] });
      }
      state.companies.set(key, next);
      return next.id;
    },
    async upsertContact(_ws, companyId, m) {
      state.contacts.set(`${companyId}:${m.name}`, { name: m.name, email: m.email });
    },
    async upsertSubscription(_ws, companyId, product, m) {
      guard("subscription");
      const key = `${companyId}:${product}`;
      const existing = state.subscriptions.get(key);
      if (existing && existing.sourceAt > m.sourceAt) return null;
      const id = existing?.id ?? `sub:${key}`;
      state.subscriptions.set(key, { id, status: m.status, sourceAt: m.sourceAt, amountMinor: m.amountMinor });
      return id;
    },
    async upsertDeal(_ws, companyId, m) {
      state.deals.set(companyId, { status: m.status });
    },
    async upsertPayment(_ws, _companyId, _subId, m) {
      state.payments.set(`${m.provider}:${m.reference}`, { status: m.status, amountMinor: m.amountMinor });
    },
    async insertActivity(_ws, companyId, eventId, m) {
      if (!state.activities.has(eventId)) state.activities.set(eventId, `${companyId}:${m.summary}`);
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

`lib/crm/apply.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CrmEvent } from "./events.ts";
import { applyEvent, replayEvent } from "./apply.ts";
import { createFakeDb } from "./test-fakes.ts";

const signup: CrmEvent = {
  event_id: "washcare:tenant:42:created",
  product: "washcare",
  type: "account.created",
  occurred_at: "2026-10-01T09:00:00.000Z",
  data: {
    account: { id: "42", name: "Clean Lagos" },
    contact: { name: "Ada" },
    subscription: { plan: "washcare", status: "trialing", amount_minor: 0, currency: "NGN", interval_months: 1 },
  },
};

const paid: CrmEvent = {
  event_id: "washcare:paystack:ps_1",
  product: "washcare",
  type: "payment.succeeded",
  occurred_at: "2026-10-05T09:00:00.000Z",
  data: {
    account: { id: "42", name: "Clean Lagos" },
    payment: { reference: "ps_1", amount_minor: 120_000, currency: "NGN", provider: "paystack", paid_at: "2026-10-05T09:00:00.000Z" },
    subscription: { plan: "washcare", status: "active", amount_minor: 120_000, currency: "NGN", interval_months: 1 },
  },
};

test("an event is applied once, and the same event_id again is a duplicate with no new rows", async () => {
  const db = createFakeDb();
  assert.deepEqual(await applyEvent(signup, db), { status: "applied" });
  assert.deepEqual(await applyEvent(signup, db), { status: "duplicate" });
  assert.equal(db.state.companies.size, 1);
  assert.equal(db.state.activities.size, 1);
  assert.equal(db.state.events.get(signup.event_id)?.status, "applied");
});

test("a newer payment moves the company to Paying and wins the deal", async () => {
  const db = createFakeDb();
  await applyEvent(signup, db);
  await applyEvent(paid, db);
  assert.equal(db.state.companies.get("washcare:42")?.stage, "Paying");
  assert.equal(db.state.deals.get("washcare:42")?.status, "won");
  assert.equal(db.state.payments.get("paystack:ps_1")?.status, "succeeded");
});

test("an older subscription event arriving late does not overwrite the newer state", async () => {
  const db = createFakeDb();
  await applyEvent(paid, db);
  await applyEvent(signup, db);
  assert.equal(db.state.subscriptions.get("washcare:42:washcare")?.status, "active");
  assert.equal(db.state.companies.get("washcare:42")?.stage, "Paying");
  assert.equal(db.state.deals.get("washcare:42")?.status, "won");
  assert.equal(db.state.activities.size, 2);
});

test("a failure marks the event failed with the reason, and replay applies it after the fix", async () => {
  const db = createFakeDb();
  db.state.failOn = "subscription";
  const result = await applyEvent(signup, db);
  assert.deepEqual(result, { status: "failed", error: "subscription failed" });
  assert.equal(db.state.events.get(signup.event_id)?.status, "failed");

  db.state.failOn = undefined;
  const row = db.state.events.get(signup.event_id)!;
  assert.deepEqual(await replayEvent(row.id, signup, db), { status: "applied" });
  assert.equal(db.state.events.get(signup.event_id)?.status, "applied");
  assert.equal(db.state.activities.size, 1);
});

test("a product with no adapter is unsupported and writes nothing", async () => {
  const db = createFakeDb();
  const result = await applyEvent({ ...signup, product: "nope", event_id: "nope:1" }, db);
  assert.deepEqual(result, { status: "unsupported" });
  assert.equal(db.state.events.size, 0);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm test`
Expected: fails, because `./apply.ts` cannot be found.

- [ ] **Step 4: Implement `lib/crm/apply.ts`**

```ts
import type { CrmEvent } from "./events.ts";
import type {
  ActivityMutation,
  CompanyMutation,
  ContactMutation,
  DealMutation,
  Mutation,
  PaymentMutation,
  SubscriptionMutation,
} from "./mutations.ts";
import { adapterFor } from "./adapters/index.ts";

export interface CrmDb {
  insertEvent(event: CrmEvent, workspaceId: number): Promise<{ id: number } | null>;
  setEventStatus(id: number, status: "applied" | "failed", error: string | null): Promise<void>;
  upsertCompany(workspaceId: number, product: string, m: CompanyMutation): Promise<string>;
  upsertContact(workspaceId: number, companyId: string, m: ContactMutation): Promise<void>;
  upsertSubscription(workspaceId: number, companyId: string, product: string, m: SubscriptionMutation): Promise<string | null>;
  upsertDeal(workspaceId: number, companyId: string, m: DealMutation): Promise<void>;
  upsertPayment(workspaceId: number, companyId: string, subscriptionId: string | null, m: PaymentMutation): Promise<void>;
  insertActivity(workspaceId: number, companyId: string, eventId: string, m: ActivityMutation): Promise<void>;
}

export type ApplyResult =
  | { status: "applied" }
  | { status: "duplicate" }
  | { status: "failed"; error: string }
  | { status: "unsupported" };

function stripStateFields(m: CompanyMutation): CompanyMutation {
  return { kind: "company", externalId: m.externalId, name: m.name };
}

async function run(mutations: Mutation[], event: CrmEvent, db: CrmDb, workspaceId: number) {
  const company = mutations.find((m): m is CompanyMutation => m.kind === "company");
  if (!company) throw new Error("The adapter produced no company.");
  const subscription = mutations.find((m): m is SubscriptionMutation => m.kind === "subscription");

  let subscriptionId: string | null = null;
  let stale = false;
  let companyId = await db.upsertCompany(workspaceId, event.product, stripStateFields(company));

  if (subscription) {
    subscriptionId = await db.upsertSubscription(workspaceId, companyId, event.product, subscription);
    stale = subscriptionId === null;
  }
  if (!stale) companyId = await db.upsertCompany(workspaceId, event.product, company);

  for (const m of mutations) {
    if (m.kind === "contact") await db.upsertContact(workspaceId, companyId, m);
    if (m.kind === "deal" && !stale) await db.upsertDeal(workspaceId, companyId, m);
    if (m.kind === "payment") await db.upsertPayment(workspaceId, companyId, subscriptionId, m);
    if (m.kind === "activity") await db.insertActivity(workspaceId, companyId, event.event_id, m);
  }
}

async function applyRow(rowId: number, event: CrmEvent, db: CrmDb, workspaceId: number): Promise<ApplyResult> {
  const adapter = adapterFor(event.product);
  if (!adapter) return { status: "unsupported" };
  try {
    await run(adapter(event), event, db, workspaceId);
    await db.setEventStatus(rowId, "applied", null);
    return { status: "applied" };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await db.setEventStatus(rowId, "failed", error);
    return { status: "failed", error };
  }
}

export async function applyEvent(event: CrmEvent, db: CrmDb, workspaceId = 1): Promise<ApplyResult> {
  if (!adapterFor(event.product)) return { status: "unsupported" };
  const row = await db.insertEvent(event, workspaceId);
  if (!row) return { status: "duplicate" };
  return applyRow(row.id, event, db, workspaceId);
}

export function replayEvent(rowId: number, event: CrmEvent, db: CrmDb, workspaceId = 1): Promise<ApplyResult> {
  return applyRow(rowId, event, db, workspaceId);
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add lib/crm/apply.ts lib/crm/apply.test.ts lib/crm/test-fakes.ts
git commit -m "Apply events idempotently, keep the newest subscription, and support replay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ingest endpoint and the Supabase-backed `CrmDb`

**Files:**
- Create: `lib/crm/ingest.ts`, `lib/crm/ingest.test.ts`, `lib/crm/supabase-db.ts`, `lib/supabase/admin.ts`, `app/api/ingest/[product]/route.ts`, `scripts/send-event.mjs`, `.env.example`

**Interfaces:**
- Consumes: `verifySignature` (Task 2), `parseEvent` (Task 3), `applyEvent`, `CrmDb` (Task 5).
- Produces:
  - `handleIngest(input: IngestInput): Promise<{ status: number; body: Record<string, unknown> }>`, where `IngestInput = { product: string; rawBody: string; timestamp: string | null; signature: string | null; nowSeconds: number; secret: string | undefined; db: CrmDb }`
  - `supabaseCrmDb(client: SupabaseClient): CrmDb`
  - `createSupabaseAdminClient(): SupabaseClient | null`
  - `POST /api/ingest/[product]`

- [ ] **Step 1: Write the failing test**

`lib/crm/ingest.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleIngest } from "./ingest.ts";
import { signPayload } from "./signature.ts";
import { createFakeDb } from "./test-fakes.ts";

const now = 1_760_000_000;
const secret = "s";
const body = JSON.stringify({
  event_id: "washcare:tenant:1:created",
  product: "washcare",
  type: "account.created",
  occurred_at: "2026-10-11T09:00:00.000Z",
  data: { account: { id: "1", name: "A" } },
});
const signed = (b: string) => ({ timestamp: String(now), signature: signPayload(secret, String(now), b) });

test("a signed event is accepted and applied", async () => {
  const res = await handleIngest({ product: "washcare", rawBody: body, ...signed(body), nowSeconds: now, secret, db: createFakeDb() });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "applied");
});

test("a product with no secret configured is 404", async () => {
  const res = await handleIngest({ product: "washcare", rawBody: body, ...signed(body), nowSeconds: now, secret: undefined, db: createFakeDb() });
  assert.equal(res.status, 404);
});

test("a bad product name is 404 before anything else", async () => {
  const res = await handleIngest({ product: "../x", rawBody: body, ...signed(body), nowSeconds: now, secret, db: createFakeDb() });
  assert.equal(res.status, 404);
});

test("a bad signature is 401 and writes nothing", async () => {
  const db = createFakeDb();
  const res = await handleIngest({ product: "washcare", rawBody: body, timestamp: String(now), signature: "00", nowSeconds: now, secret, db });
  assert.equal(res.status, 401);
  assert.equal(db.state.events.size, 0);
});

test("an event for another product than the path is 400", async () => {
  const other = body.replaceAll("washcare", "bihub");
  const res = await handleIngest({ product: "washcare", rawBody: other, ...signed(other), nowSeconds: now, secret, db: createFakeDb() });
  assert.equal(res.status, 400);
});

test("a body over 64 KB is 413", async () => {
  const big = "x".repeat(65 * 1024);
  const res = await handleIngest({ product: "washcare", rawBody: big, ...signed(big), nowSeconds: now, secret, db: createFakeDb() });
  assert.equal(res.status, 413);
});

test("a repeat is 200 with status duplicate, so the sender does not retry", async () => {
  const db = createFakeDb();
  await handleIngest({ product: "washcare", rawBody: body, ...signed(body), nowSeconds: now, secret, db });
  const res = await handleIngest({ product: "washcare", rawBody: body, ...signed(body), nowSeconds: now, secret, db });
  assert.deepEqual([res.status, res.body.status], [200, "duplicate"]);
});
```

- [ ] **Step 2: Run it to see it fail, then implement `lib/crm/ingest.ts`**

Run: `npm test` (expected: fails, module missing).

```ts
import type { CrmDb } from "./apply.ts";
import { applyEvent } from "./apply.ts";
import { parseEvent } from "./events.ts";
import { verifySignature } from "./signature.ts";

export type IngestInput = {
  product: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  nowSeconds: number;
  secret: string | undefined;
  db: CrmDb;
};

const MAX_BYTES = 64 * 1024;

export async function handleIngest(input: IngestInput): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!/^[a-z0-9-]{1,40}$/.test(input.product) || !input.secret) {
    return { status: 404, body: { error: "Unknown product." } };
  }
  if (Buffer.byteLength(input.rawBody) > MAX_BYTES) {
    return { status: 413, body: { error: "The event is larger than 64 KB." } };
  }
  const check = verifySignature({
    secret: input.secret,
    timestamp: input.timestamp,
    signature: input.signature,
    body: input.rawBody,
    nowSeconds: input.nowSeconds,
  });
  if (!check.ok) return { status: 401, body: { error: check.reason } };

  const parsed = parseEvent(input.rawBody);
  if (!parsed.ok) return { status: 400, body: { error: parsed.reason } };
  if (parsed.event.product !== input.product) {
    return { status: 400, body: { error: "The event's product does not match the address it was sent to." } };
  }

  const result = await applyEvent(parsed.event, input.db);
  if (result.status === "unsupported") return { status: 404, body: { error: "No adapter for this product." } };
  return { status: 200, body: { ...result } };
}
```

Run: `npm test` (expected: passes).

- [ ] **Step 3: Write the admin client and `supabaseCrmDb`**

`lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
```

Run `npm install server-only` if `server-only` is not already resolvable (`node -e "require.resolve('server-only')"`).

`lib/crm/supabase-db.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmDb } from "./apply.ts";

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function supabaseCrmDb(db: SupabaseClient): CrmDb {
  return {
    async insertEvent(event, workspaceId) {
      const { data, error } = await db
        .from("events")
        .upsert(
          {
            workspace_id: workspaceId,
            product: event.product,
            event_id: event.event_id,
            type: event.type,
            occurred_at: event.occurred_at,
            payload: event,
          },
          { onConflict: "event_id", ignoreDuplicates: true },
        )
        .select("id");
      fail("insert event", error);
      return data && data.length > 0 ? { id: data[0].id as number } : null;
    },

    async setEventStatus(id, status, message) {
      const { error } = await db.from("events").update({ status, error: message }).eq("id", id);
      fail("event status", error);
    },

    async upsertCompany(workspaceId, product, m) {
      const row: Record<string, unknown> = {
        workspace_id: workspaceId,
        product,
        external_id: m.externalId,
        name: m.name,
        updated_at: new Date().toISOString(),
      };
      if (m.stage !== undefined) row.stage = m.stage;
      if (m.segment !== undefined) row.segment = m.segment;
      if (m.winProbability !== undefined) row.win_probability = m.winProbability;
      if (m.pipelineValueMinor !== undefined) row.pipeline_value_minor = m.pipelineValueMinor;
      if (m.currency !== undefined) row.currency = m.currency;
      const { data, error } = await db
        .from("companies")
        .upsert(row, { onConflict: "workspace_id,product,external_id" })
        .select("id")
        .single();
      fail("upsert company", error);
      return data!.id as string;
    },

    async upsertContact(workspaceId, companyId, m) {
      const { error } = await db
        .from("contacts")
        .upsert(
          { workspace_id: workspaceId, company_id: companyId, name: m.name, email: m.email ?? null, phone: m.phone ?? null },
          { onConflict: "company_id,name" },
        );
      fail("upsert contact", error);
    },

    async upsertSubscription(workspaceId, companyId, product, m) {
      const { data: existing, error: readError } = await db
        .from("subscriptions")
        .select("id, source_at")
        .eq("company_id", companyId)
        .eq("product", product)
        .maybeSingle();
      fail("read subscription", readError);
      if (existing && Date.parse(existing.source_at) > Date.parse(m.sourceAt)) return null;

      const row = {
        workspace_id: workspaceId,
        company_id: companyId,
        product,
        plan: m.plan,
        status: m.status,
        amount_minor: m.amountMinor,
        currency: m.currency,
        interval_months: m.intervalMonths,
        started_at: m.startedAt,
        renews_at: m.renewsAt,
        cancelled_at: m.cancelledAt,
        source_at: m.sourceAt,
        updated_at: new Date().toISOString(),
      };
      const query = existing
        ? db.from("subscriptions").update(row).eq("id", existing.id).lte("source_at", m.sourceAt)
        : db.from("subscriptions").insert(row);
      const { data, error } = await query.select("id");
      if (error?.code === "23505") return this.upsertSubscription(workspaceId, companyId, product, m);
      fail("write subscription", error);
      return data && data.length > 0 ? (data[0].id as string) : null;
    },

    async upsertDeal(workspaceId, companyId, m) {
      const { error } = await db.from("deals").upsert(
        {
          workspace_id: workspaceId,
          company_id: companyId,
          stage: m.stage,
          value_minor: m.valueMinor,
          currency: m.currency,
          status: m.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );
      fail("upsert deal", error);
    },

    async upsertPayment(workspaceId, companyId, subscriptionId, m) {
      const { error } = await db.from("payments").upsert(
        {
          workspace_id: workspaceId,
          company_id: companyId,
          subscription_id: subscriptionId,
          amount_minor: m.amountMinor,
          currency: m.currency,
          provider: m.provider,
          reference: m.reference,
          status: m.status,
          paid_at: m.paidAt,
        },
        { onConflict: "provider,reference" },
      );
      fail("upsert payment", error);
    },

    async insertActivity(workspaceId, companyId, eventId, m) {
      const { error } = await db.from("activities").upsert(
        { workspace_id: workspaceId, company_id: companyId, event_id: eventId, kind: m.activityKind, summary: m.summary, at: m.at },
        { onConflict: "event_id", ignoreDuplicates: true },
      );
      fail("insert activity", error);
    },
  };
}
```

- [ ] **Step 4: Write the route**

`app/api/ingest/[product]/route.ts`:

```ts
import { handleIngest } from "@/lib/crm/ingest";
import { supabaseCrmDb } from "@/lib/crm/supabase-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "The CRM database is not configured." }, { status: 503 });

  const result = await handleIngest({
    product,
    rawBody: await request.text(),
    timestamp: request.headers.get("x-crm-timestamp"),
    signature: request.headers.get("x-crm-signature"),
    nowSeconds: Math.floor(Date.now() / 1000),
    secret: /^[a-z0-9-]{1,40}$/.test(product) ? process.env[`CRM_SECRET_${product.toUpperCase().replaceAll("-", "_")}`] : undefined,
    db: supabaseCrmDb(admin),
  });
  return Response.json(result.body, { status: result.status });
}
```

- [ ] **Step 5: Write `.env.example` and the smoke-test script**

`.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CRM_SECRET_WASHCARE=
CRM_SECRET_LUX=
CRM_SECRET_BIHUB=
```

`scripts/send-event.mjs`:

```js
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const [file, baseUrl = "http://localhost:3000"] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/send-event.mjs <event.json> [crm-url]");
  process.exit(1);
}
const body = readFileSync(file, "utf8").trim();
const { product } = JSON.parse(body);
const secret = process.env[`CRM_SECRET_${product.toUpperCase().replaceAll("-", "_")}`];
if (!secret) {
  console.error(`Set CRM_SECRET_${product.toUpperCase()} first.`);
  process.exit(1);
}
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
const res = await fetch(`${baseUrl}/api/ingest/${product}`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-crm-timestamp": timestamp, "x-crm-signature": signature },
  body,
});
console.log(res.status, await res.text());
```

- [ ] **Step 6: Smoke-test against local Supabase**

```bash
supabase status -o env
```

Copy `API_URL` to `NEXT_PUBLIC_SUPABASE_URL`, `PUBLISHABLE_KEY` (or `ANON_KEY`) to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SECRET_KEY` (or `SERVICE_ROLE_KEY`) to `SUPABASE_SECRET_KEY` in `.env.local`. Set `CRM_SECRET_WASHCARE=$(openssl rand -hex 32)`.

Write `/private/tmp/claude-501/-Users-mac-Desktop-sales-crm/c81a1c18-84b8-4f1e-a2cb-71821fc28320/scratchpad/signup.json` with the `signup` event from Task 5. Then:

```bash
npm run dev
node --env-file=.env.local scripts/send-event.mjs <scratchpad>/signup.json
node --env-file=.env.local scripts/send-event.mjs <scratchpad>/signup.json
```

Expected: first `200 {"status":"applied"}`, then `200 {"status":"duplicate"}`. In Supabase Studio (`http://127.0.0.1:54323`), `companies` has one row, Clean Lagos, with stage `Trial`.

- [ ] **Step 7: Commit**

```bash
git add lib/crm/ingest.ts lib/crm/ingest.test.ts lib/crm/supabase-db.ts lib/supabase/admin.ts app/api/ingest scripts/send-event.mjs .env.example package.json package-lock.json
git commit -m "Add the signed ingest endpoint backed by Supabase

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Owner login and route protection

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/proxy-session.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/login-form.tsx`, `app/login/actions.ts`, `app/(crm)/layout.tsx`, `app/(crm)/actions.ts`
- Move: `app/page.tsx` → `app/(crm)/page.tsx`

**Interfaces:**
- Produces:
  - `createSupabaseServerClient(): Promise<SupabaseClient>`
  - `updateSession(request: NextRequest): Promise<{ response: NextResponse; signedIn: boolean }>`
  - server action `signIn(prev: LoginState, form: FormData): Promise<LoginState>`
  - server action `signOut(): Promise<void>`
  - `type LoginState = { error?: string; fields?: { email?: string; password?: string }; email?: string }`

- [ ] **Step 1: Read the docs first**

Read `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` and `node_modules/next/dist/docs/01-app/02-guides/authentication.md`. Load the `supabase` skill and follow its `@supabase/ssr` and `getClaims` guidance where it differs from the code below.

- [ ] **Step 2: Server client and proxy session**

`lib/supabase/server.ts`:

```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}
```

`lib/supabase/proxy-session.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  return { response, signedIn: Boolean(data?.claims?.sub) };
}
```

`proxy.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  const onLogin = request.nextUrl.pathname === "/login";
  if (!signedIn && !onLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (signedIn && onLogin) return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!api/ingest|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml|llms.txt|assets/).*)"],
};
```

- [ ] **Step 3: Login action and page**

`app/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; fields?: { email?: string; password?: string }; email?: string };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const fields: LoginState["fields"] = {};
  if (!email) fields.email = "Email: enter the email you use for the CRM.";
  if (!password) fields.password = "Password: enter your password.";
  if (fields.email || fields.password) return { fields, email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password do not match. Check both and try again.", email };
  redirect("/");
}
```

`app/login/login-form.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import Button from "@/components/_ui/button";
import Input from "@/components/_ui/input";
import Label from "@/components/_ui/label";
import { type LoginState, signIn } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.fields?.email) emailRef.current?.focus();
    else if (state.fields?.password) passwordRef.current?.focus();
  }, [state]);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email (required)</Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          aria-invalid={state.fields?.email ? true : undefined}
          aria-describedby={state.fields?.email ? "email-error" : undefined}
        />
        {state.fields?.email && (
          <p id="email-error" role="alert" className="text-destructive">
            {state.fields.email}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password (required)</Label>
        <Input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fields?.password ? true : undefined}
          aria-describedby={state.fields?.password ? "password-error" : undefined}
        />
        {state.fields?.password && (
          <p id="password-error" role="alert" className="text-destructive">
            {state.fields.password}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

Before using it, check `components/_ui/input.tsx`, `label.tsx` and `button.tsx` for their export style (default or named), whether they forward `ref`, and the exact `variant` names. Adjust the imports and `variant="primary"` to match. Check that `text-destructive` exists in `app/globals.css`, and use the project's error colour token if it doesn't.

`app/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign in · Sales CRM", robots: { index: false } };

export default function LoginPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-[24em] flex-col gap-6">
        <h1>Sign in to the Sales CRM</h1>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: CRM layout with a skip link, and sign-out**

Move the page: `git mv app/page.tsx "app/(crm)/page.tsx"`. Leave its body unchanged for now, because Task 8 rewrites it.

`app/(crm)/layout.tsx`:

```tsx
import Sidebar from "@/components/_common/sidebar/sidebar";

export const dynamic = "force-dynamic";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh max-w-full overflow-hidden">
      <a
        href="#main"
        className="bg-background focus-visible:ring-ring sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus-visible:ring-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
        {children}
      </main>
    </div>
  );
}
```

Then change `app/(crm)/page.tsx` so it no longer renders its own `<main>` or `<Sidebar />`. It returns `<Companies />` only. Check whether `dynamic = "force-dynamic"` is still the right switch in this Next version (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-segment-config*`). If it was replaced, use what the docs say. Every CRM page reads cookies, so it must render per request.

`main` uses `focus:outline-none` only because it is a programmatic skip target that is never reached by Tab. Every interactive element keeps its visible focus style.

`app/(crm)/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

Add a sign-out control to the profile drawer (`components/companies/profile/profile.tsx`). Use a `<form action={signOut}>` wrapping `<Button type="submit" variant="secondary">Sign out</Button>`, with the variant matching what exists.

- [ ] **Step 5: Create the owner account locally**

In local Studio (`http://127.0.0.1:54323` → Authentication → Add user), create the owner's email and password with "Auto confirm" on. Then run in the SQL editor, with the real user id:

```sql
insert into public.profiles (user_id, name, title, email) values ('<owner uuid>', 'Bryan Temple Onyenghan', 'Founder', '<owner email>');
insert into public.workspace_members (workspace_id, user_id, role) values (1, '<owner uuid>', 'owner');
```

- [ ] **Step 6: Check it by hand**

With `npm run dev`:
- `/` signed out redirects to `/login`.
- Submitting the empty form shows both field errors, and focus moves to Email.
- A wrong password shows the alert.
- The right password lands on `/`.
- `curl -i -X POST localhost:3000/api/ingest/washcare` returns `401`, not a redirect to `/login`.
- On first Tab, the skip link is visible.

Run `npm run lint` and `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase proxy.ts app
git commit -m "Add owner login, route protection and a skip link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Companies from real data, the product switcher, and saved manual companies

**Files:**
- Create: `lib/crm/to-company.ts`, `lib/crm/to-company.test.ts`, `components/companies/companies-data.tsx`, `components/_common/sidebar/product-switcher.tsx`
- Modify: `data/companies.ts` (`Company.product`, `Tag`, `toneFor`, owner registry), `lib/companies.ts` (`TODAY`, product filter), `stores/companies-store.ts`, `components/companies/toolbar/filter-options.ts`, `components/companies/toolbar/toolbar.tsx`, `components/companies/toolbar/mobile-filters.tsx`, `components/companies/table/company-row.tsx`, `components/companies/table/companies-table.tsx`, `components/companies/command-menu/command-table.tsx`, `components/companies/detail/company-detail.tsx`, `components/companies/new-company/new-company-dialog.tsx`, `components/_common/sidebar/sidebar-content.tsx`, `app/(crm)/page.tsx`, `app/(crm)/actions.ts`

**Interfaces:**
- Produces:
  - `type CompanyListRow = { id: string; product: string; name: string; stage: string | null; segment: string | null; owner_name: string | null; open_deals: number; pipeline_value_minor: number; currency: string; win_probability: number; last_interaction_at: string | null; last_interaction_label: string | null; trend: number[] | null }`
  - `toCompany(row: CompanyListRow, now: Date): Company`
  - `type ProductProfile = { slug: string; name: string; stages: string[]; segments: string[]; tag_tones: Record<string, TagTone> }`
  - store fields `product: string`, `products: ProductProfile[]`, `owners: Owner[]`, and `hydrate(payload: { companies: Company[]; products: ProductProfile[]; owners: Owner[]; currentUser: Owner }): void`
  - `toneFor(tag: string, products: ProductProfile[]): TagTone`
  - server action `createCompany(input: NewCompanyInput): Promise<{ ok: true; company: Company } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing `toCompany` test**

`lib/crm/to-company.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCompany, type CompanyListRow } from "./to-company.ts";

const row: CompanyListRow = {
  id: "c1",
  product: "washcare",
  name: "Clean Lagos",
  stage: "Paying",
  segment: "Yearly",
  owner_name: "Bryan Temple Onyenghan",
  open_deals: 0,
  pipeline_value_minor: 1_080_000,
  currency: "NGN",
  win_probability: 100,
  last_interaction_at: "2026-10-09T10:00:00.000Z",
  last_interaction_label: "Paid ₦10,800.00",
  trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2],
};

test("activity days count from now, not from a fixed date", () => {
  const company = toCompany(row, new Date("2026-10-11T10:00:00.000Z"));
  assert.equal(company.activityDays, 2);
});

test("money comes out in major units for the existing table", () => {
  assert.equal(toCompany(row, new Date("2026-10-11T10:00:00.000Z")).pipelineValue, 10_800);
});

test("tags are segment then stage, skipping empty ones", () => {
  assert.deepEqual(toCompany(row, new Date()).tags, ["Yearly", "Paying"]);
  assert.deepEqual(toCompany({ ...row, segment: null }, new Date()).tags, ["Paying"]);
});

test("a company with no activity is far outside any window and says so", () => {
  const company = toCompany({ ...row, last_interaction_at: null, last_interaction_label: null, trend: null }, new Date("2026-10-11T10:00:00.000Z"));
  assert.equal(company.lastInteraction.label, "No activity yet");
  assert.equal(company.activityDays, Number.MAX_SAFE_INTEGER);
  assert.equal(company.trend.length, 14);
});

test("no owner reads as Unassigned", () => {
  assert.equal(toCompany({ ...row, owner_name: null }, new Date()).owner, "Unassigned");
});
```

- [ ] **Step 2: Run it to see it fail, then implement**

Run: `npm test` (expected: fails, module missing).

`lib/crm/to-company.ts`:

```ts
import type { Company } from "@/data/companies";

export type CompanyListRow = {
  id: string;
  product: string;
  name: string;
  stage: string | null;
  segment: string | null;
  owner_name: string | null;
  open_deals: number;
  pipeline_value_minor: number;
  currency: string;
  win_probability: number;
  last_interaction_at: string | null;
  last_interaction_label: string | null;
  trend: number[] | null;
};

const DAY = 86_400_000;

export function toCompany(row: CompanyListRow, now: Date): Company {
  const last = row.last_interaction_at;
  return {
    id: row.id,
    product: row.product,
    name: row.name,
    tags: [row.segment, row.stage].filter((tag): tag is string => Boolean(tag)),
    owner: row.owner_name ?? "Unassigned",
    openDeals: row.open_deals,
    pipelineValue: row.pipeline_value_minor / 100,
    winProbability: row.win_probability,
    trend: row.trend && row.trend.length === 14 ? row.trend : Array.from({ length: 14 }, () => 0),
    lastInteraction: last
      ? { date: last.slice(0, 10), label: row.last_interaction_label ?? "" }
      : { date: "", label: "No activity yet" },
    activityDays: last ? Math.max(0, Math.floor((now.getTime() - Date.parse(last)) / DAY)) : Number.MAX_SAFE_INTEGER,
  };
}
```

Run: `npm test` (expected: passes once Step 3's `product` field exists. Type-only imports are erased, so the runtime test passes now and `tsc` catches the type after Step 3).

- [ ] **Step 3: Widen the data types in `data/companies.ts`**

- Change `export type Tag = Segment | Stage;` to `export type Tag = string;`.
- Change `TAG_TONES` to `Record<Segment | Stage, TagTone>`.
- Add `product?: string;` to `Company`.
- Add the owner registry and tone lookup:

```ts
export type ProductProfile = {
  slug: string;
  name: string;
  stages: string[];
  segments: string[];
  tag_tones: Record<string, TagTone>;
};

let registeredOwners: Owner[] = [];

export function registerOwners(owners: Owner[]) {
  registeredOwners = owners;
}

export const UNASSIGNED: Owner = { name: "Unassigned", avatar: "", email: "", phone: "", role: "" };

export function toneFor(tag: string, products: ProductProfile[]): TagTone {
  for (const p of products) if (p.tag_tones[tag]) return p.tag_tones[tag];
  return (TAG_TONES as Record<string, TagTone>)[tag] ?? "neutral";
}
```

- Change `ownerByName` to check `registeredOwners` first. If nothing is registered, keep the current mock fallback. If owners are registered but none matches, return `UNASSIGNED`:

```ts
export function ownerByName(name: string): Owner {
  if (registeredOwners.length > 0) return registeredOwners.find((o) => o.name === name) ?? UNASSIGNED;
  return OWNERS.find((owner) => owner.name === name) ?? OWNERS[0];
}
```

- Check `components/_ui/avatar.tsx`. If it renders an `<img>` with an empty `src`, make it show initials when `src` is empty. A broken image or a stranger's face must never stand in for "Unassigned". If you add an `<img>`, keep its `alt=""`, because the owner's name is already shown next to it as text.

- [ ] **Step 4: Real dates and the product filter in `lib/companies.ts`**

- Change `export const TODAY = "2026-09-14";` to `export const TODAY = new Date().toISOString().slice(0, 10);`.
- Add `product: string` to `CompanyFilters`, `export const ALL_PRODUCTS = "all";`, and `product: ALL_PRODUCTS` to `DEFAULT_FILTERS`.
- Leave `activeFilterCount` counting owner, stage and window only. The product is chosen in the sidebar, not in the filter menu.
- In `filterCompanies`, destructure `product` and add as the first check: `if (product !== ALL_PRODUCTS && company.product !== product) return false;`.

- [ ] **Step 5: Store hydration**

In `stores/companies-store.ts`:
- Start `companies` as `[]` instead of `COMPANIES`, and `selectedIds` as `[]`.
- Add `products: [] as ProductProfile[]`, `owners: [] as Owner[]`, `currentUser: CURRENT_USER`, `product` from `DEFAULT_FILTERS`, `setProduct: (product: string) => void`, and `hydrate`:

```ts
hydrate: ({ companies, products, owners, currentUser }) => {
  registerOwners(owners);
  set({ companies, products, owners, currentUser });
},
setProduct: (product) => set({ product, stage: ANY_STAGE }),
resetFilters: () => set((state) => ({ ...DEFAULT_FILTERS, product: state.product })),
```

Import `ANY_STAGE` from `@/lib/companies`. Wherever `CURRENT_USER` is imported directly (`header.tsx`, `profile.tsx`), switch it to `useCompaniesStore((s) => s.currentUser)`.

`components/companies/companies-data.tsx`:

```tsx
"use client";

import { useRef } from "react";
import type { Company, Owner, ProductProfile } from "@/data/companies";
import { useCompaniesStore } from "@/stores/companies-store";

type Props = { companies: Company[]; products: ProductProfile[]; owners: Owner[]; currentUser: Owner; children: React.ReactNode };

export default function CompaniesData({ children, ...payload }: Props) {
  const done = useRef(false);
  if (!done.current) {
    useCompaniesStore.getState().hydrate(payload);
    done.current = true;
  }
  return <>{children}</>;
}
```

- [ ] **Step 6: Load real data in the page**

`app/(crm)/page.tsx`:

```tsx
import Companies from "@/components/companies/companies";
import CompaniesData from "@/components/companies/companies-data";
import type { Owner, ProductProfile } from "@/data/companies";
import { type CompanyListRow, toCompany } from "@/lib/crm/to-company";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function toOwner(p: { name: string; title: string | null; email: string | null; phone: string | null; avatar_url: string | null }): Owner {
  return { name: p.name, role: p.title ?? "", email: p.email ?? "", phone: p.phone ?? "", avatar: p.avatar_url ?? "" };
}

export default async function CompaniesPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: rows, error }, { data: products }, { data: profiles }, { data: claims }] = await Promise.all([
    supabase.from("company_list").select("*").eq("workspace_id", 1),
    supabase.from("products").select("slug, name, stages, segments, tag_tones").order("name"),
    supabase.from("profiles").select("user_id, name, title, email, phone, avatar_url"),
    supabase.auth.getClaims(),
  ]);
  if (error) throw new Error("The companies could not be loaded.");

  const now = new Date();
  const owners = (profiles ?? []).map(toOwner);
  const me = (profiles ?? []).find((p) => p.user_id === claims?.claims?.sub);

  return (
    <CompaniesData
      companies={(rows as CompanyListRow[]).map((row) => toCompany(row, now))}
      products={(products ?? []) as ProductProfile[]}
      owners={owners}
      currentUser={me ? toOwner(me) : owners[0]}
    >
      <Companies />
    </CompaniesData>
  );
}
```

Add `app/(crm)/error.tsx`, a client component with an `h1` "Something went wrong loading the CRM" and a `Button variant="secondary"` that calls `reset()`. Also add `app/(crm)/loading.tsx`, a text-only "Loading…" inside `role="status"`.

- [ ] **Step 7: Filter options from the profile**

Replace the static exports in `components/companies/toolbar/filter-options.ts` with hooks. Keep `ACTIVITY_OPTIONS` and `SORT_MENU_OPTIONS` as they are.

```ts
import { useMemo } from "react";
import { ACTIVITY_WINDOWS, SORT_OPTIONS } from "@/data/companies";
import { ALL_OWNERS, ALL_PRODUCTS, ANY_STAGE } from "@/lib/companies";
import { useCompaniesStore } from "@/stores/companies-store";

export function useOwnerOptions() {
  const owners = useCompaniesStore((s) => s.owners);
  return useMemo(
    () => [{ value: ALL_OWNERS, label: "All Owners" }, ...owners.map((o) => ({ value: o.name, label: o.name }))],
    [owners],
  );
}

export function useStageOptions() {
  const products = useCompaniesStore((s) => s.products);
  const product = useCompaniesStore((s) => s.product);
  return useMemo(() => {
    const chosen = product === ALL_PRODUCTS ? products : products.filter((p) => p.slug === product);
    const tags = Array.from(new Set(chosen.flatMap((p) => [...p.segments, ...p.stages])));
    return [{ value: ANY_STAGE, label: "Any" }, ...tags.map((tag) => ({ value: tag, label: tag }))];
  }, [products, product]);
}
```

In `toolbar.tsx` and `mobile-filters.tsx`, replace `OWNER_OPTIONS` with `const ownerOptions = useOwnerOptions();` and `STAGE_OPTIONS` with `const stageOptions = useStageOptions();` inside the component. Use these in place of the constants. Pass `product` into every `filterCompanies` call (`companies-table.tsx` line 40, and `toolbar.tsx`), reading it with `useCompaniesStore((s) => s.product)`.

The table already has the empty state "No companies match the current filters." Check `companies-table.tsx` for a live region that announces the result count. If there is none, add `<p role="status" className="sr-only">{visible.length} companies shown</p>` next to the table.

- [ ] **Step 8: Tag tones and the product tag on rows**

In `company-row.tsx`, `command-table.tsx` and `company-detail.tsx`, replace `TAG_TONES[tag]` with `toneFor(tag, products)`, where `const products = useCompaniesStore((s) => s.products);`.

In `company-row.tsx`, when the product filter is `all`, show the product name before the tags as `<Tag tone="neutral">{productName}</Tag>`. `productName` comes from `products.find((p) => p.slug === company.product)?.name`. It is text, so it is never colour alone.

- [ ] **Step 9: Product switcher in the sidebar**

`components/_common/sidebar/product-switcher.tsx`:

```tsx
"use client";

import { ALL_PRODUCTS } from "@/lib/companies";
import { useCompaniesStore } from "@/stores/companies-store";

export default function ProductSwitcher() {
  const products = useCompaniesStore((s) => s.products);
  const product = useCompaniesStore((s) => s.product);
  const setProduct = useCompaniesStore((s) => s.setProduct);

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <label htmlFor="product-switcher" className="caption-style text-subtle">
        Product
      </label>
      <select
        id="product-switcher"
        value={product}
        onChange={(e) => setProduct(e.target.value)}
        className="border-sidebar-border bg-sidebar focus-visible:ring-ring h-9 rounded-md border px-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        <option value={ALL_PRODUCTS}>All products</option>
        {products.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

If `components/_ui/select.tsx` is a styled native or Radix select used elsewhere in the toolbar, use it instead, so it matches. It must keep the visible `<label>`.

Render `<ProductSwitcher />` in `sidebar-content.tsx` directly under the header block, before `<ScrollArea>`. In the same file:
- Delete `BASE_COMPANY_COUNT`, and show the count as `companyCount`.
- Give the `Companies` item `href="/"`.
- Remove the counts on items that have no data behind them yet ("Forecast" 9, "Contacts" 38). Showing invented numbers breaks the honesty rule.

Add an `href?: string` prop to `SidebarNavItem` and pass it to `Button`, which already renders a `Link` when `href` is set.

- [ ] **Step 10: Save manual companies**

In `app/(crm)/actions.ts`, add:

```ts
import { randomUUID } from "node:crypto";
import type { Company } from "@/data/companies";
import { type CompanyListRow, toCompany } from "@/lib/crm/to-company";

export type NewCompanyInput = { name: string; segment: string; stage: string; pipelineValue: number; winProbability: number };

export async function createCompany(input: NewCompanyInput): Promise<{ ok: true; company: Company } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Company name: enter a name." };
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data, error } = await supabase
    .from("companies")
    .insert({
      workspace_id: 1,
      product: "direct",
      external_id: randomUUID(),
      name,
      segment: input.segment,
      stage: input.stage,
      owner_id: claims?.claims?.sub ?? null,
      pipeline_value_minor: Math.round(input.pipelineValue * 100),
      win_probability: Math.min(100, Math.max(0, Math.round(input.winProbability))),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "The company could not be saved. Try again." };
  const { data: row } = await supabase.from("company_list").select("*").eq("id", data.id).single();
  if (!row) return { ok: false, error: "The company was saved but could not be read back. Reload the page." };
  return { ok: true, company: toCompany(row as CompanyListRow, new Date()) };
}
```

In `new-company-dialog.tsx`:
- Take segment and stage choices from the `direct` profile in the store (`products.find((p) => p.slug === "direct")`). The `direct` seed has the same lists as the old constants, so the dialog looks the same.
- On submit, call `createCompany`. On `ok`, call `addCompany(result.company)` and close.
- On error, show the message in a `role="alert"` element tied to the name field with `aria-describedby`, set `aria-invalid` on the field, and move focus to it.
- Remove the fields the database does not store, such as the manual last-interaction date, or keep them and add them as an activity. Choose removal for Plan A.

- [ ] **Step 11: Check it by hand**

With local Supabase holding the events from Task 6, plus a second product's event sent the same way:
- `/` lists real companies.
- The product switcher filters them, and the stage options change to that product's stages.
- An "All products" row shows its product name.
- The 30-day window hides nothing that had activity today.
- A new manual company is still there after reload.
- The owner filter lists only real profiles.
- The table and dialogs work at 320px wide and at 200% zoom.

Run `npm test`, `npm run lint` and `npx tsc --noEmit`.

- [ ] **Step 12: Commit**

```bash
git add -A lib data stores components app
git commit -m "Read companies from Supabase, switch products, and save manual companies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Overview, subscription and payment math

**Files:**
- Create: `lib/crm/overview.ts`, `lib/crm/overview.test.ts`

**Interfaces:**
- Consumes: `monthlyMinor` (Task 4).
- Produces:

```ts
export type SubscriptionRow = { company_id: string; product: string; plan: string; status: "trialing" | "active" | "past_due" | "cancelled"; amount_minor: number; currency: string; interval_months: number; renews_at: string | null; cancelled_at: string | null };
export type PaymentRow = { company_id: string; product: string; amount_minor: number; currency: string; status: "succeeded" | "failed"; paid_at: string };
export type EffectiveStatus = "Trial" | "Trial ended" | "Active" | "Past due" | "Cancelled";
export function effectiveStatus(s: SubscriptionRow, now: Date): EffectiveStatus;
export type OverviewFigures = { revenueMinor: number; newPaidAccounts: number; mrrMinor: number; activeSubscriptions: number; trialsEndingSoon: number; trialsEnded: number; failedPayments: number; cancellations: number };
export function overviewFigures(input: { subscriptions: SubscriptionRow[]; payments: PaymentRow[]; from: Date; to: Date; now: Date; currency: string; product?: string }): OverviewFigures;
export function currenciesIn(subscriptions: SubscriptionRow[], payments: PaymentRow[]): string[];
```

- [ ] **Step 1: Write the failing test**

`lib/crm/overview.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { currenciesIn, effectiveStatus, overviewFigures, type PaymentRow, type SubscriptionRow } from "./overview.ts";

const now = new Date("2026-10-11T12:00:00.000Z");
const from = new Date("2026-10-01T00:00:00.000Z");
const to = new Date("2026-10-12T00:00:00.000Z");

const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  company_id: "c",
  product: "washcare",
  plan: "washcare",
  status: "active",
  amount_minor: 120_000,
  currency: "NGN",
  interval_months: 1,
  renews_at: null,
  cancelled_at: null,
  ...over,
});

const pay = (over: Partial<PaymentRow>): PaymentRow => ({
  company_id: "c",
  product: "washcare",
  amount_minor: 120_000,
  currency: "NGN",
  status: "succeeded",
  paid_at: "2026-10-05T10:00:00.000Z",
  ...over,
});

test("a trial past its end date with no new event reads as Trial ended", () => {
  assert.equal(effectiveStatus(sub({ status: "trialing", renews_at: "2026-10-10T00:00:00.000Z" }), now), "Trial ended");
  assert.equal(effectiveStatus(sub({ status: "trialing", renews_at: "2026-10-15T00:00:00.000Z" }), now), "Trial");
});

test("MRR adds monthly values across mixed terms, active only", () => {
  const f = overviewFigures({
    subscriptions: [
      sub({ company_id: "a" }),
      sub({ company_id: "b", amount_minor: 1_080_000, interval_months: 12 }),
      sub({ company_id: "c", amount_minor: 300_000, interval_months: 3 }),
      sub({ company_id: "d", status: "trialing", renews_at: "2026-10-15T00:00:00.000Z" }),
    ],
    payments: [],
    from,
    to,
    now,
    currency: "NGN",
  });
  assert.equal(f.mrrMinor, 120_000 + 90_000 + 100_000);
  assert.equal(f.activeSubscriptions, 3);
  assert.equal(f.trialsEndingSoon, 1);
});

test("ended trials are counted apart and never as ending soon", () => {
  const f = overviewFigures({ subscriptions: [sub({ status: "trialing", renews_at: "2026-10-09T00:00:00.000Z" })], payments: [], from, to, now, currency: "NGN" });
  assert.deepEqual([f.trialsEndingSoon, f.trialsEnded], [0, 1]);
});

test("revenue counts succeeded payments in range and in the chosen currency only", () => {
  const f = overviewFigures({
    subscriptions: [],
    payments: [
      pay({}),
      pay({ paid_at: "2026-09-20T00:00:00.000Z" }),
      pay({ currency: "USD", amount_minor: 5_000 }),
      pay({ status: "failed" }),
    ],
    from,
    to,
    now,
    currency: "NGN",
  });
  assert.equal(f.revenueMinor, 120_000);
  assert.equal(f.failedPayments, 1);
});

test("a new paid account is one whose first successful payment falls in range", () => {
  const f = overviewFigures({
    subscriptions: [],
    payments: [pay({ company_id: "old", paid_at: "2026-09-01T00:00:00.000Z" }), pay({ company_id: "old" }), pay({ company_id: "new" })],
    from,
    to,
    now,
    currency: "NGN",
  });
  assert.equal(f.newPaidAccounts, 1);
});

test("cancellations count cancelled_at in range", () => {
  const f = overviewFigures({ subscriptions: [sub({ status: "cancelled", cancelled_at: "2026-10-03T00:00:00.000Z" })], payments: [], from, to, now, currency: "NGN" });
  assert.equal(f.cancellations, 1);
});

test("the product filter limits every figure", () => {
  const f = overviewFigures({ subscriptions: [sub({}), sub({ product: "bihub" })], payments: [pay({ product: "bihub" })], from, to, now, currency: "NGN", product: "washcare" });
  assert.deepEqual([f.activeSubscriptions, f.revenueMinor], [1, 0]);
});

test("currenciesIn lists each currency once, NGN first when present", () => {
  assert.deepEqual(currenciesIn([sub({ currency: "USD" })], [pay({})]), ["NGN", "USD"]);
});
```

- [ ] **Step 2: Run it to see it fail, then implement `lib/crm/overview.ts`**

Run: `npm test` (expected: fails, module missing).

```ts
import { monthlyMinor } from "./money.ts";

export type SubscriptionRow = {
  company_id: string;
  product: string;
  plan: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
  amount_minor: number;
  currency: string;
  interval_months: number;
  renews_at: string | null;
  cancelled_at: string | null;
};

export type PaymentRow = {
  company_id: string;
  product: string;
  amount_minor: number;
  currency: string;
  status: "succeeded" | "failed";
  paid_at: string;
};

export type EffectiveStatus = "Trial" | "Trial ended" | "Active" | "Past due" | "Cancelled";

export type OverviewFigures = {
  revenueMinor: number;
  newPaidAccounts: number;
  mrrMinor: number;
  activeSubscriptions: number;
  trialsEndingSoon: number;
  trialsEnded: number;
  failedPayments: number;
  cancellations: number;
};

const WEEK = 7 * 86_400_000;

export function effectiveStatus(s: SubscriptionRow, now: Date): EffectiveStatus {
  if (s.status === "cancelled") return "Cancelled";
  if (s.status === "past_due") return "Past due";
  if (s.status === "active") return "Active";
  return s.renews_at && Date.parse(s.renews_at) <= now.getTime() ? "Trial ended" : "Trial";
}

function within(iso: string | null, from: Date, to: Date) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= from.getTime() && t < to.getTime();
}

export function overviewFigures(input: {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  from: Date;
  to: Date;
  now: Date;
  currency: string;
  product?: string;
}): OverviewFigures {
  const { from, to, now, currency, product } = input;
  const subs = input.subscriptions.filter((s) => s.currency === currency && (!product || s.product === product));
  const pays = input.payments.filter((p) => p.currency === currency && (!product || p.product === product));
  const succeeded = pays.filter((p) => p.status === "succeeded");

  const firstPaid = new Map<string, number>();
  for (const p of succeeded) {
    const t = Date.parse(p.paid_at);
    const seen = firstPaid.get(p.company_id);
    if (seen === undefined || t < seen) firstPaid.set(p.company_id, t);
  }

  const active = subs.filter((s) => s.status === "active");
  const trials = subs.filter((s) => s.status === "trialing");

  return {
    revenueMinor: succeeded.filter((p) => within(p.paid_at, from, to)).reduce((sum, p) => sum + p.amount_minor, 0),
    newPaidAccounts: [...firstPaid.values()].filter((t) => t >= from.getTime() && t < to.getTime()).length,
    mrrMinor: active.reduce((sum, s) => sum + monthlyMinor(s.amount_minor, s.interval_months), 0),
    activeSubscriptions: active.length,
    trialsEndingSoon: trials.filter((s) => {
      if (!s.renews_at) return false;
      const t = Date.parse(s.renews_at);
      return t > now.getTime() && t <= now.getTime() + WEEK;
    }).length,
    trialsEnded: trials.filter((s) => effectiveStatus(s, now) === "Trial ended").length,
    failedPayments: pays.filter((p) => p.status === "failed" && within(p.paid_at, from, to)).length,
    cancellations: subs.filter((s) => s.status === "cancelled" && within(s.cancelled_at, from, to)).length,
  };
}

export function currenciesIn(subscriptions: SubscriptionRow[], payments: PaymentRow[]): string[] {
  const set = new Set([...subscriptions.map((s) => s.currency), ...payments.map((p) => p.currency)]);
  return [...set].sort((a, b) => (a === "NGN" ? -1 : b === "NGN" ? 1 : a.localeCompare(b)));
}
```

Run: `npm test` (expected: passes).

- [ ] **Step 3: Commit**

```bash
git add lib/crm/overview.ts lib/crm/overview.test.ts
git commit -m "Add overview figures with ended-trial handling and one currency at a time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Overview, Subscriptions and Payments screens

**Files:**
- Create: `app/(crm)/overview/page.tsx`, `app/(crm)/subscriptions/page.tsx`, `app/(crm)/payments/page.tsx`, `components/sales/period-form.tsx`, `components/sales/figures.tsx`, `components/sales/product-status.tsx`, `components/sales/subscriptions-table.tsx`, `components/sales/payments-table.tsx`, `lib/crm/sales-query.ts`
- Modify: `components/_common/sidebar/sidebar-content.tsx`, `components/_common/sidebar/sidebar-nav-item.tsx`

**Interfaces:**
- Consumes: `overviewFigures`, `effectiveStatus`, `currenciesIn` (Task 9), `formatMoney` (Task 4), `createSupabaseServerClient` (Task 7).
- Produces:
  - `loadSales(): Promise<{ subscriptions: (SubscriptionRow & { company_name: string })[]; payments: (PaymentRow & { company_name: string; reference: string; provider: string })[]; products: { slug: string; name: string; host: string | null }[]; lastEvent: Record<string, string> }>`
  - `periodFrom(searchParams): { from: Date; to: Date; label: string; key: string }`

Pages are server components that read the period, product and currency from the URL (`?period=30d&product=washcare&currency=NGN`). The filter is a plain GET `<form>` with labelled `<select>`s and a submit button, so it works without JavaScript and every filtered view has its own URL.

- [ ] **Step 1: Read the skills that apply**

Read `CONVENTIONS.md` and the `@layer base` type scale in `app/globals.css`. Load the `frontend-design-saas` skill's sections on dashboards and dense tables, and load `dataviz` before building the figure tiles. Follow the skill-picker consent step from the global CLAUDE.md.

- [ ] **Step 2: The data loader**

`lib/crm/sales-query.ts`:

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PaymentRow, SubscriptionRow } from "./overview";

const DAY = 86_400_000;
const PERIODS: Record<string, { label: string; days: number }> = {
  today: { label: "Today", days: 0 },
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
};

export function periodFrom(params: { period?: string }, now = new Date()) {
  const key = params.period && PERIODS[params.period] ? params.period : "30d";
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(startOfToday.getTime() + DAY);
  const from = key === "today" ? startOfToday : new Date(to.getTime() - PERIODS[key].days * DAY);
  return { from, to, label: PERIODS[key].label, key };
}

export const PERIOD_OPTIONS = Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }));

export async function loadSales() {
  const supabase = await createSupabaseServerClient();
  const [subs, pays, products, events] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("company_id, product, plan, status, amount_minor, currency, interval_months, renews_at, cancelled_at, companies(name)")
      .eq("workspace_id", 1),
    supabase
      .from("payments")
      .select("company_id, amount_minor, currency, status, paid_at, reference, provider, companies(name, product)")
      .eq("workspace_id", 1)
      .order("paid_at", { ascending: false })
      .limit(1000),
    supabase.from("products").select("slug, name, host").order("name"),
    supabase.from("events").select("product, received_at").order("received_at", { ascending: false }).limit(500),
  ]);
  if (subs.error || pays.error) throw new Error("Sales could not be loaded.");

  const lastEvent: Record<string, string> = {};
  for (const e of events.data ?? []) lastEvent[e.product] ??= e.received_at;

  return {
    subscriptions: (subs.data ?? []).map((s) => ({
      ...(s as unknown as SubscriptionRow),
      company_name: (s.companies as unknown as { name: string } | null)?.name ?? "Unknown",
    })),
    payments: (pays.data ?? []).map((p) => {
      const company = p.companies as unknown as { name: string; product: string } | null;
      return {
        ...(p as unknown as PaymentRow),
        product: company?.product ?? "",
        company_name: company?.name ?? "Unknown",
        reference: p.reference as string,
        provider: p.provider as string,
      };
    }),
    products: products.data ?? [],
    lastEvent,
  };
}
```

Payments are capped at the latest 1,000 in Plan A. When that cap is reached, show the text "Showing the latest 1,000 payments" above the payments table, and note it on the Overview. A SQL aggregate replaces the cap if volume grows.

- [ ] **Step 3: Shared pieces**

`components/sales/period-form.tsx` is a server component that renders the GET form:

```tsx
import Button from "@/components/_ui/button";
import { PERIOD_OPTIONS } from "@/lib/crm/sales-query";

type Props = {
  period: string;
  product: string;
  currency: string;
  products: { slug: string; name: string }[];
  currencies: string[];
  statusOptions?: { value: string; label: string }[];
  status?: string;
};

const field = "flex flex-col gap-1.5";
const control = "h-9 rounded-md border border-border bg-background px-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default function PeriodForm({ period, product, currency, products, currencies, statusOptions, status }: Props) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter sales">
      <div className={field}>
        <label htmlFor="period">Period</label>
        <select id="period" name="period" defaultValue={period} className={control}>
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={field}>
        <label htmlFor="product">Product</label>
        <select id="product" name="product" defaultValue={product} className={control}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className={field}>
        <label htmlFor="currency">Currency</label>
        <select id="currency" name="currency" defaultValue={currency} className={control}>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {statusOptions && (
        <div className={field}>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""} className={control}>
            <option value="">Any status</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}
```

Confirm the colour token names (`border-border`, `bg-background`, `ring-ring`) against `app/globals.css`, and match the toolbar's existing controls.

`components/sales/figures.tsx` is a `<dl>` grid of labelled figures. Each figure is text, with no chart required:

```tsx
import { formatMoney } from "@/lib/crm/money";
import type { OverviewFigures } from "@/lib/crm/overview";

export default function Figures({ figures, currency }: { figures: OverviewFigures; currency: string }) {
  const items = [
    { label: "Revenue collected", value: formatMoney(figures.revenueMinor, currency) },
    { label: "Monthly recurring revenue", value: formatMoney(figures.mrrMinor, currency) },
    { label: "New paid accounts", value: String(figures.newPaidAccounts) },
    { label: "Active subscriptions", value: String(figures.activeSubscriptions) },
    { label: "Trials ending in 7 days", value: String(figures.trialsEndingSoon) },
    { label: "Trials ended, not paid", value: String(figures.trialsEnded) },
    { label: "Failed payments", value: String(figures.failedPayments) },
    { label: "Cancellations", value: String(figures.cancellations) },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="border-border flex flex-col gap-1 border-t pt-3">
          <dt className="text-subtle">{item.label}</dt>
          <dd className="font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

`components/sales/product-status.tsx` lists each product with a text status: "Receiving, last event <relative time>" if an event arrived in the last 30 days, "Quiet, last event <date>" if older, and "No events yet" if there are none. It uses a `<ul>` of plain text. Status words are always shown, and colour is optional on top.

`components/sales/subscriptions-table.tsx` and `components/sales/payments-table.tsx` use `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead` and `TableCell` from `components/_ui/table.tsx`, each with a `<caption className="sr-only">`.
- **Subscriptions columns:** Company, Product, Plan, Status (from `effectiveStatus`, as text), Amount (`formatMoney` plus " / month", " / quarter", " / 6 months" or " / year"), Renews or ends (date, or "—").
- **Payments columns:** Date, Company, Product, Amount, Status ("Paid" or "Failed" as text), Reference (in `<code>`).
- Format dates with `new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })`.
- Wrap each table in a container with `overflow-x-auto`, a `tabIndex={0}`, and `role="region"` with `aria-label` naming the table, so it is keyboard-scrollable at 320px.

- [ ] **Step 4: The three pages**

`app/(crm)/overview/page.tsx`:

```tsx
import type { Metadata } from "next";
import Figures from "@/components/sales/figures";
import PeriodForm from "@/components/sales/period-form";
import ProductStatus from "@/components/sales/product-status";
import { currenciesIn, overviewFigures } from "@/lib/crm/overview";
import { loadSales, periodFrom } from "@/lib/crm/sales-query";

export const metadata: Metadata = { title: "Overview · Sales CRM", robots: { index: false } };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { subscriptions, payments, products, lastEvent } = await loadSales();
  const currencies = currenciesIn(subscriptions, payments);
  const currency = params.currency && currencies.includes(params.currency) ? params.currency : (currencies[0] ?? "NGN");
  const product = products.some((p) => p.slug === params.product) ? params.product : undefined;
  const { from, to, label, key } = periodFrom(params);
  const figures = overviewFigures({ subscriptions, payments, from, to, now: new Date(), currency, product });
  const productName = products.find((p) => p.slug === product)?.name ?? "All products";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <h1>Overview</h1>
        <p className="text-subtle">
          {productName}, {label.toLowerCase()}, in {currency}. Amounts in other currencies are not added in.
        </p>
      </header>
      <PeriodForm period={key} product={product ?? ""} currency={currency} products={products} currencies={currencies.length ? currencies : ["NGN"]} />
      <section aria-labelledby="figures-heading" className="flex flex-col gap-4">
        <h2 id="figures-heading">Sales</h2>
        <Figures figures={figures} currency={currency} />
      </section>
      <section aria-labelledby="sources-heading" className="flex flex-col gap-4">
        <h2 id="sources-heading">Products sending data</h2>
        <ProductStatus products={products} lastEvent={lastEvent} />
      </section>
    </div>
  );
}
```

`app/(crm)/subscriptions/page.tsx` has the same shape:
- `h1` "Subscriptions".
- A `PeriodForm` with `statusOptions` Trial, Trial ended, Active, Past due, Cancelled. Period is ignored for this list, so pass the form a prop to hide the period select, or accept it as harmless.
- Rows filtered by product, currency and `effectiveStatus(row, now) === status`.
- A visible count line, "12 subscriptions", rendered as text above the table.
- The note "Plan changes are made in each product for now. Managing them from here comes in a later phase." with a link per product to `https://<host>`. This is the spec's "Managed in the product" label.

`app/(crm)/payments/page.tsx`:
- `h1` "Payments".
- A `PeriodForm` with `statusOptions` Paid and Failed.
- Rows filtered by period, product, currency and status, newest first.
- A count line, the cap note when 1,000 rows came back, and the payments table.

- [ ] **Step 5: Sidebar links**

In `sidebar-content.tsx`:
- Add a `SidebarSection` titled "Sales", after the first section, with:
  - `<SidebarNavItem icon={BarChartAltIcon} label="Overview" href="/overview" />`
  - `<SidebarNavItem icon={WalletIcon} label="Subscriptions" href="/subscriptions" />`
  - `<SidebarNavItem icon={ClipboardIcon} label="Payments" href="/payments" />`
- Work out `active` from `usePathname()`. `Companies` is active on `/`, and each new item is active on its own path.
- Remove the hard-coded `active` on Companies.
- Leave the other mock sections ("Team", "Reporting", "Pipelines") in place without counts. Tell the owner they are still placeholders, but do not remove them without asking.

- [ ] **Step 6: Check it by hand**

Send three local events with `scripts/send-event.mjs`: a Washcare sign-up, a Washcare yearly payment and a Bihub store. Then confirm:
- Overview shows revenue ₦10,800.00 and MRR ₦900.00 for the yearly payment.
- Product status reads "Receiving" for Washcare and Bihub, and "No events yet" for Lux.
- Every filter combination has its own URL.
- With a screen reader (VoiceOver), each page announces its `h1` and the table captions.
- At 320px nothing scrolls sideways except the table regions, and those scroll with arrow keys after Tab.
- `npm run lint` and `npx tsc --noEmit` are clean.

- [ ] **Step 7: Run the frontend gate and commit**

Run the `frontend-gate` skill on the changed UI files. Fix any P0 or P1 findings before committing.

```bash
git add app components lib
git commit -m "Add Overview, Subscriptions and Payments screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Washcare and Lux send events

**Repo:** `/Users/mac/Desktop/Presso` (washcare), then `/Users/mac/Desktop/Lux-Laundry`.

**Files (Presso):**
- Create: `src/lib/crm/send.ts`, `src/lib/crm/send.test.ts`, `src/lib/crm/announce.ts`
- Modify: `src/app/(presso)/actions.ts` (`startLaundry` around line 192, `finishLaundry` around line 264, `requestDemo` around line 343), `src/lib/presso/billing-webhook.ts` (return the tenant and option, read `reference`), `src/app/api/payments/webhook/route.ts`

**Interfaces:**
- Produces:
  - `crmProduct(env): "washcare" | "lux"`
  - `buildCrmRequest(input: CrmInput, env, nowMs): { url: string; init: RequestInit } | null`
  - `sendCrmEvent(input: CrmInput, env?, fetchImpl?): Promise<boolean>`, where `CrmInput = { type: "account.created" | "lead.captured" | "subscription.changed" | "payment.succeeded" | "payment.failed"; eventId: string; occurredAt?: string; data: Record<string, unknown> }`
  - `announceNewLaundry(admin, tenantId: number, owner: { name: string; email: string; phone: string }): Promise<void>`
  - `announceDemo(id: number | string, d: { name: string; laundryName: string; phone: string; email: string | null; city: string | null }): Promise<void>`
  - `announcePlanPayment(admin, p: { tenantId: number; reference: string; amountKobo: number; months: number; plan: string; paidAt: string }): Promise<void>`
- Env: `CRM_INGEST_URL` (the CRM base URL), `CRM_INGEST_SECRET` (equal to the CRM's `CRM_SECRET_WASHCARE` or `CRM_SECRET_LUX`), and `CRM_PRODUCT` (`lux` on the Lux deployment, unset on Washcare).

This replaces the spec's "reads `SOLE_TENANT_ID`". That flag exists only on Lux's `lux-on-presso` branch, not in Presso `main`. Task 13 updates the spec line.

- [ ] **Step 1: Branch and write the failing test**

```bash
cd /Users/mac/Desktop/Presso && git checkout main && git pull && git checkout -b feat/crm-events
```

`src/lib/crm/send.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildCrmRequest, crmProduct, sendCrmEvent } from "./send.ts";

const env = { CRM_INGEST_URL: "https://crm.example/", CRM_INGEST_SECRET: "s" } as NodeJS.ProcessEnv;
const input = { type: "lead.captured" as const, eventId: "demo:1", data: { account: { id: "demo:1", name: "Spin" } } };

test("nothing is built when the CRM is not configured", () => {
  assert.equal(buildCrmRequest(input, {} as NodeJS.ProcessEnv, 0), null);
});

test("the product defaults to washcare and is lux only when asked", () => {
  assert.equal(crmProduct({} as NodeJS.ProcessEnv), "washcare");
  assert.equal(crmProduct({ CRM_PRODUCT: "lux" } as NodeJS.ProcessEnv), "lux");
  assert.equal(crmProduct({ CRM_PRODUCT: "other" } as NodeJS.ProcessEnv), "washcare");
});

test("the request is signed the way the CRM checks it, and the id carries the product", () => {
  const now = 1_760_000_000_000;
  const req = buildCrmRequest(input, env, now)!;
  assert.equal(req.url, "https://crm.example/api/ingest/washcare");
  const headers = req.init.headers as Record<string, string>;
  const body = req.init.body as string;
  assert.equal(headers["x-crm-timestamp"], "1760000000");
  assert.equal(headers["x-crm-signature"], createHmac("sha256", "s").update(`1760000000.${body}`).digest("hex"));
  assert.equal(JSON.parse(body).event_id, "washcare:demo:1");
});

test("a CRM that is down returns false and never throws", async () => {
  const ok = await sendCrmEvent(input, env, async () => {
    throw new Error("ECONNREFUSED");
  });
  assert.equal(ok, false);
});

test("a CRM that hangs is given up on within the timeout", async () => {
  const started = Date.now();
  const ok = await sendCrmEvent(input, env, (_url, init) =>
    new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    50,
  );
  assert.equal(ok, false);
  assert.ok(Date.now() - started < 1000);
});
```

Run: `npm test` (expected: fails, module missing).

- [ ] **Step 2: Implement `src/lib/crm/send.ts`**

```ts
import { createHmac } from "node:crypto";

/**
 * Sends one event to the owner's sales CRM. Never throws and never waits
 * longer than the timeout: a sign-up or a payment must finish the same
 * whether the CRM is up or not. Call it inside `after()`.
 */

export type CrmEventType = "account.created" | "lead.captured" | "subscription.changed" | "payment.succeeded" | "payment.failed";
export type CrmInput = { type: CrmEventType; eventId: string; occurredAt?: string; data: Record<string, unknown> };

export function crmProduct(env: NodeJS.ProcessEnv = process.env): "washcare" | "lux" {
  return env.CRM_PRODUCT === "lux" ? "lux" : "washcare";
}

export function buildCrmRequest(input: CrmInput, env: NodeJS.ProcessEnv = process.env, nowMs = Date.now()) {
  const base = env.CRM_INGEST_URL?.trim();
  const secret = env.CRM_INGEST_SECRET?.trim();
  if (!base || !secret) return null;
  const product = crmProduct(env);
  const body = JSON.stringify({
    event_id: `${product}:${input.eventId}`,
    product,
    type: input.type,
    occurred_at: input.occurredAt ?? new Date(nowMs).toISOString(),
    data: input.data,
  });
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return {
    url: `${base.replace(/\/+$/, "")}/api/ingest/${product}`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", "x-crm-timestamp": timestamp, "x-crm-signature": signature },
      body,
    } satisfies RequestInit,
  };
}

export async function sendCrmEvent(
  input: CrmInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<boolean> {
  const req = buildCrmRequest(input, env);
  if (!req) return false;
  try {
    const res = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) console.error("crm event refused", res.status, input.type);
    return res.ok;
  } catch (cause) {
    console.error("crm event not sent", input.type, cause instanceof Error ? cause.message : cause);
    return false;
  }
}
```

Presso's code style uses explanatory comments. The CRM's no-comments rule applies only in sales-crm.

Run: `npm test` (expected: passes).

- [ ] **Step 3: Announcements**

`src/lib/crm/announce.ts`:

```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCrmEvent } from "./send.ts";

/**
 * What the sales CRM hears about. Each reads what it needs from our own
 * database and sends one event; the CRM never reads this database.
 */

export async function announceNewLaundry(
  admin: SupabaseClient,
  tenantId: number,
  owner: { name: string; email: string; phone: string },
) {
  const { data: t } = await admin
    .from("tenants")
    .select("id, name, status, plan, trial_ends_at, currency, created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (!t) return;
  await sendCrmEvent({
    type: "account.created",
    eventId: `tenant:${t.id}:created`,
    occurredAt: t.created_at,
    data: {
      account: { id: String(t.id), name: t.name },
      contact: owner,
      subscription: {
        plan: t.plan,
        status: t.status === "locked" ? "past_due" : t.status,
        amount_minor: 0,
        currency: t.currency,
        interval_months: 1,
        started_at: t.created_at,
        renews_at: t.trial_ends_at,
      },
    },
  });
}

export async function announceDemo(
  id: number | string,
  d: { name: string; laundryName: string; phone: string; email: string | null; city: string | null },
) {
  await sendCrmEvent({
    type: "lead.captured",
    eventId: `demo:${id}`,
    data: {
      account: { id: `demo:${id}`, name: d.laundryName, city: d.city ?? undefined },
      contact: { name: d.name, phone: d.phone, email: d.email ?? undefined },
    },
  });
}

export async function announcePlanPayment(
  admin: SupabaseClient,
  p: { tenantId: number; reference: string; amountKobo: number; months: number; plan: string; paidAt: string },
) {
  const { data: t } = await admin.from("tenants").select("id, name, currency").eq("id", p.tenantId).maybeSingle();
  if (!t) return;
  const renews = new Date(p.paidAt);
  renews.setUTCMonth(renews.getUTCMonth() + p.months);
  await sendCrmEvent({
    type: "payment.succeeded",
    eventId: `paystack:${p.reference}`,
    occurredAt: p.paidAt,
    data: {
      account: { id: String(t.id), name: t.name },
      payment: { reference: p.reference, amount_minor: p.amountKobo, currency: t.currency, provider: "paystack", paid_at: p.paidAt },
      subscription: {
        plan: p.plan,
        status: "active",
        amount_minor: p.amountKobo,
        currency: t.currency,
        interval_months: p.months,
        renews_at: renews.toISOString(),
      },
    },
  });
}
```

- [ ] **Step 4: Call sites**

In `src/app/(presso)/actions.ts`:
- Add `import { after } from "next/server";` and `import { announceDemo, announceNewLaundry } from "@/lib/crm/announce";`.
- In `startLaundry`, change `const { error: laundryError } = await admin.rpc("create_laundry", {` to `const { data: tenantId, error: laundryError } = await admin.rpc("create_laundry", {`.
- After the `if (laundryError) { … }` block, add:

```ts
  after(() => announceNewLaundry(admin, Number(tenantId), { name: input.name, email: input.email, phone: input.phone }));
```

- In `finishLaundry`, make the same `data: tenantId` change. After its error block, add:

```ts
  after(() => announceNewLaundry(admin, Number(tenantId), { name: input.name, email: user.email!, phone: input.phone }));
```

- In `requestDemo`, change the insert to `const { data: demo, error } = await admin.from("demo_requests").insert({ … }).select("id").single();`. After the error check, add:

```ts
  if (demo) {
    after(() =>
      announceDemo(demo.id, { name: d.name, laundryName: d.laundryName, phone: d.phone, email: d.email || null, city: d.city || null }),
    );
  }
```

Read the `after` guide (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`) in Presso to confirm it can be used in server actions and route handlers in 16.2.4. Every `after` call is placed before the `redirect()` that ends the action.

In `src/lib/presso/billing-webhook.ts`:
- Add `reference?: string;` and `paid_at?: string;` to `Event["data"]`.
- Change the return type of `applyPlanPayment` to `Promise<{ applied: boolean; reason: string; tenantId?: number; option?: BillingOption }>`.
- On success, return `{ applied: true, reason: …, tenantId, option }`.

In `src/app/api/payments/webhook/route.ts`, replace the plan branch's return with:

```ts
    const { tenantId, option, ...result } = await applyPlanPayment(admin, payload as Parameters<typeof applyPlanPayment>[1]);
    if (result.applied && tenantId && option) {
      const data = (payload as { data?: { reference?: string; paid_at?: string } }).data;
      after(() =>
        announcePlanPayment(admin, {
          tenantId,
          reference: data?.reference ?? `${tenantId}-${Date.now()}`,
          amountKobo: option.amountKobo,
          months: option.months,
          plan: option.plan,
          paidAt: data?.paid_at ?? new Date().toISOString(),
        }),
      );
    }
    return NextResponse.json({ received: true, ...result });
```

Import `after` from `next/server` and `announcePlanPayment` from `@/lib/crm/announce`.

- [ ] **Step 5: Verify Presso**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all pass, with existing tests unchanged.

Then, with the local CRM running (`npm run dev` in sales-crm on port 3000), set `CRM_INGEST_URL=http://localhost:3000` and `CRM_INGEST_SECRET=<CRM_SECRET_WASHCARE>` in Presso's `.env.local`. Run Presso on port 3001 (`npm run dev -- -p 3001`). Submit "Book a demo". Within seconds, the CRM shows a "Demo requested" company. Stop the CRM and submit again: Presso still shows its success message without delay.

- [ ] **Step 6: Commit (Presso)**

```bash
git add src/lib/crm src/app/'(presso)'/actions.ts src/lib/presso/billing-webhook.ts src/app/api/payments/webhook/route.ts
git commit -m "Send sign-ups, demo requests and plan payments to the sales CRM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Lux (ask the owner first)**

Show the owner the Presso diff and confirm before touching Lux. Then:

```bash
cd /Users/mac/Desktop/Lux-Laundry && git checkout lux-on-presso && git pull
git cherry-pick <the Presso commit from Step 6>
```

Resolve conflicts in favour of Lux's existing code, adding only the new lines. Read the cherry-picked diff and confirm it writes nothing to any table, especially tenant 1. It only reads `tenants` and sends. Run `npm test && npm run typecheck`.

Register Lux as a client once, from sales-crm, with a hand-written event file:

```json
{
  "event_id": "lux:client:lux-laundry",
  "product": "lux",
  "type": "account.created",
  "occurred_at": "2026-09-30T00:00:00.000Z",
  "data": { "account": { "id": "1", "name": "Lux Laundry" } }
}
```

Send it with `node --env-file=.env.local scripts/send-event.mjs <file> <crm-url>`.

Lux has sign-up and plan payment switched off (`SOLE_TENANT_ID`), so its live hooks will rarely fire in Plan A. Its customer-level data arrives with Plan C.

Commit on `lux-on-presso` with the same message. Do not push until the owner says so.

---

### Task 12: Bihub sends events

**Repo:** `/Users/mac/Desktop/Bihub-marketplace` (`apps/web`).

**Files:**
- Create: `apps/web/src/lib/crm.ts`, `apps/web/src/lib/crm.test.ts`
- Modify: `apps/web/src/app/api/onboarding/route.ts` (after the store insert around line 111), `apps/web/src/app/api/payments/upgrade/callback/route.ts` (after the successful update)

**Interfaces:**
- Produces: `buildCrmRequest`, `sendCrmEvent`, with the same contract as Task 11 but the product fixed to `bihub`. Env: `CRM_INGEST_URL`, `CRM_INGEST_SECRET` (equal to the CRM's `CRM_SECRET_BIHUB`).

The waitlist leads in `/api/leads` belong to a seller's customers, not to the owner's sales. They are not sent in Plan A, and they belong to the embedded CRM in Plan C.

- [ ] **Step 1: Branch from the default branch**

```bash
cd /Users/mac/Desktop/Bihub-marketplace
git stash list
git status
```

If there are uncommitted changes on `feat/android-merchant-app`, stop and ask the owner. Otherwise:

```bash
git fetch && git checkout -b feat/crm-events origin/HEAD
```

- [ ] **Step 2: Write the failing test**

`apps/web/src/lib/crm.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildCrmRequest, sendCrmEvent } from "./crm.ts";

const env = { CRM_INGEST_URL: "https://crm.example", CRM_INGEST_SECRET: "s" } as NodeJS.ProcessEnv;
const input = { type: "account.created" as const, eventId: "store:9:created", data: { account: { id: "9", name: "Ade Fabrics" } } };

test("not configured builds nothing", () => {
  assert.equal(buildCrmRequest(input, {} as NodeJS.ProcessEnv, 0), null);
});

test("signed for bihub with the product prefix", () => {
  const req = buildCrmRequest(input, env, 1_760_000_000_000)!;
  const body = req.init.body as string;
  assert.equal(req.url, "https://crm.example/api/ingest/bihub");
  assert.equal(JSON.parse(body).event_id, "bihub:store:9:created");
  assert.equal(
    (req.init.headers as Record<string, string>)["x-crm-signature"],
    createHmac("sha256", "s").update(`1760000000.${body}`).digest("hex"),
  );
});

test("a CRM that is down returns false and never throws", async () => {
  assert.equal(await sendCrmEvent(input, env, async () => { throw new Error("down"); }), false);
});
```

Run: `npm test --workspace @bihub/web` (expected: fails, module missing).

- [ ] **Step 3: Implement `apps/web/src/lib/crm.ts`**

This is the same code as Presso's `send.ts`, with `crmProduct` removed and the product fixed:

```ts
import { createHmac } from "node:crypto";
import { log } from "@bihub/core";

export type CrmEventType = "account.created" | "lead.captured" | "subscription.changed" | "payment.succeeded" | "payment.failed";
export type CrmInput = { type: CrmEventType; eventId: string; occurredAt?: string; data: Record<string, unknown> };

const PRODUCT = "bihub";

export function buildCrmRequest(input: CrmInput, env: NodeJS.ProcessEnv = process.env, nowMs = Date.now()) {
  const base = env.CRM_INGEST_URL?.trim();
  const secret = env.CRM_INGEST_SECRET?.trim();
  if (!base || !secret) return null;
  const body = JSON.stringify({
    event_id: `${PRODUCT}:${input.eventId}`,
    product: PRODUCT,
    type: input.type,
    occurred_at: input.occurredAt ?? new Date(nowMs).toISOString(),
    data: input.data,
  });
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return {
    url: `${base.replace(/\/+$/, "")}/api/ingest/${PRODUCT}`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", "x-crm-timestamp": timestamp, "x-crm-signature": signature },
      body,
    } satisfies RequestInit,
  };
}

export async function sendCrmEvent(
  input: CrmInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<boolean> {
  const req = buildCrmRequest(input, env);
  if (!req) return false;
  try {
    const res = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) log.error("crm.event_refused", { status: res.status, type: input.type });
    return res.ok;
  } catch (cause) {
    log.error("crm.event_not_sent", { cause, type: input.type });
    return false;
  }
}
```

If importing `@bihub/core` breaks the Node test runner, replace `log.error` with `console.error`. Check how other tested files in `src/lib` handle it.

Run: `npm test --workspace @bihub/web` (expected: passes).

- [ ] **Step 4: Call sites**

In `apps/web/src/app/api/onboarding/route.ts`, after `if (storeError) throw storeError;`:

```ts
    after(() =>
      sendCrmEvent({
        type: "account.created",
        eventId: `store:${store.id}:created`,
        occurredAt: store.created_at ?? undefined,
        data: {
          account: { id: String(store.id), name: store.name },
          contact: { name: name, email: cleanEmail },
          segment: store.category,
        },
      }),
    );
```

Add `import { after } from "next/server";` and `import { sendCrmEvent } from "@/lib/crm";`. Check the variable holding the owner's display name in that route. If the request has an owner name field, use it for `contact.name`. Otherwise use the store `name`.

In `apps/web/src/app/api/payments/upgrade/route.ts`, read what the upgrade charges (amount and whether it renews). Then, in `callback/route.ts`, after the successful `update`, before the success redirect, add:

```ts
    const { data: upgraded } = await supabaseAdmin.from("stores").select("id, name").eq("slug", storeSlug).single();
    if (upgraded) {
      after(() =>
        sendCrmEvent({
          type: "payment.succeeded",
          eventId: `paystack:${result.data.reference}`,
          occurredAt: result.data.paid_at,
          data: {
            account: { id: String(upgraded.id), name: upgraded.name },
            payment: {
              reference: result.data.reference,
              amount_minor: result.data.amount,
              currency: result.data.currency,
              provider: "paystack",
              paid_at: result.data.paid_at,
            },
            subscription: {
              plan: "pro",
              status: "active",
              amount_minor: result.data.amount,
              currency: result.data.currency,
              interval_months: 1,
            },
          },
        }),
      );
    }
```

Set `interval_months` to the term the upgrade route charges for (1, 3, 6 or 12). If the upgrade is a one-off payment that never renews, remove the `subscription` block entirely. The adapter still records the payment and moves the store to Pro. Tell the owner which case applied.

The callback can be hit twice, for example by a refresh. The `paystack:<reference>` event id makes the second one a duplicate in the CRM.

- [ ] **Step 5: Verify and commit**

```bash
npm test --workspace @bihub/web && npm run typecheck && npm run lint
git add apps/web/src/lib/crm.ts apps/web/src/lib/crm.test.ts apps/web/src/app/api/onboarding/route.ts apps/web/src/app/api/payments/upgrade/callback/route.ts
git commit -m "Send new stores and Pro upgrades to the sales CRM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Provision, deploy and record context (each step needs the owner's yes)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-11-sales-crm-product-integration-design.md` (section 3 line on `SOLE_TENANT_ID`)
- Create: vault notes (shown to the owner before saving)

- [ ] **Step 1: Correct the spec**

In section 3 of the spec, replace the bullet about `SOLE_TENANT_ID` with:

`- Washcare and Lux share one helper \`sendCrmEvent(type, payload)\`. It sends \`product: "lux"\` when the deployment sets \`CRM_PRODUCT=lux\`, and \`product: "washcare"\` otherwise. (\`SOLE_TENANT_ID\` exists only on Lux's branch, so it cannot drive shared code.)`

Commit it.

- [ ] **Step 2: Create the hosted database (ask first)**

Load the `vercel:marketplace` skill and the `supabase` skill. Propose two options to the owner and wait for a choice:
- (a) A Supabase project through the Vercel Marketplace, linked to a new Vercel project `sales-crm`.
- (b) A Supabase project made directly in the owner's Supabase organisation.

Then:
- Link the project with `supabase link --project-ref <ref>` and run `supabase db push`.
- In the hosted Auth settings, turn sign-up off.
- Create the owner user and run the two inserts from Task 7 Step 5 with the real user id.
- Run `get_advisors` (security and performance) through the Supabase MCP, and fix anything flagged before going on.

- [ ] **Step 3: Deploy the CRM (ask first)**

- Create or link the Vercel project with `vercel link`.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` for Production and Preview.
- Generate each secret with `openssl rand -hex 32` and set `CRM_SECRET_WASHCARE`, `CRM_SECRET_LUX` and `CRM_SECRET_BIHUB`.
- Ask the owner which domain the CRM should use, for example `crm.bihub.ng`. Add it.
- Deploy a preview, sign in, then promote to production on the owner's yes.

- [ ] **Step 4: Switch the products on (ask first, one at a time)**

For each of Presso, Lux and Bihub, set `CRM_INGEST_URL=<crm domain>` and `CRM_INGEST_SECRET=<that product's secret>`. On the Lux project, also set `CRM_PRODUCT=lux`.

Merge each product branch the way that repo normally ships, and only with the owner's yes. Then:
- Trigger one real event per product, such as a demo request on washcare.app or a test store on Bihub.
- Watch Overview's product status change to "Receiving".
- Send the Lux registration event from Task 11 Step 7 to production.

- [ ] **Step 5: Vault notes (show each before saving)**

- `~/Documents/Obsidian Vault/20-decisions/2026-10-11-sales-crm-internal-push-one-database.md` is the decision note the owner approved earlier. It has frontmatter `title`, `kind: decision`, `trigger: [crm, ingest, subscriptions, multi-tenant]`, `topic: [architecture, sales]` and `source: 2026-10-11 session`, and links `[[presso-platform-launch]]` and `[[2026-09-30-lux-becomes-a-presso-section]]`.
- `AI Context/Projects/sales-crm/memory/product-washcare.md`, `product-lux.md` and `product-bihub.md` each hold, in under 200 words: the events sent, the call sites (file and function), the env vars, and the stage mapping. Add one line per note to `AI Context/Projects/sales-crm/memory/MEMORY.md`.
- Add a one-line pointer in `AI Context/Projects/Presso/memory/` and `AI Context/Projects/bihub-marketplace/memory/` saying "Sends events to the sales CRM — see [[product-washcare]]" (or the Bihub equivalent). Add it to those folders' `MEMORY.md`.

- [ ] **Step 6: Final checks**

- Run `30-checklists/pre-launch.md` from the vault.
- Run `frontend-gate` on the whole CRM.
- Run `npm test`, `npm run test:db`, `npm run lint` and `npx tsc --noEmit`, all clean.
- Report to the owner what is live, what each product sends, and that Plan B (import, email, commands) is next.
