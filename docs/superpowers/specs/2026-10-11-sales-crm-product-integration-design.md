# Sales CRM: product integration, subscriptions and sales

Date: 2026-10-11 | Status: approved 2026-10-11, with the later phases brought into scope | Path: architectural

## 1. Purpose

One internal CRM that the owner (Bryan) uses to run sales across every product he owns. Products keep their own structure. The CRM receives what happened in each product, shows it in one place, and shows subscriptions and sales made.

**Success looks like:**
- A sign-up, lead, plan change or payment in any connected product shows in the CRM within seconds.
- The current CRM screens keep working, now with real data and a product switcher.
- The owner sees sales and subscriptions across all products on one overview.
- Adding a product means one profile row, one adapter file and one helper call in that product.

**In scope as later phases (section 7):** email sending, importing history, managing products from the CRM, and embedding the CRM inside products for their own customers. They are built after the core in the order in section 12.

**Still never done:** a direct write from the CRM into a product database. Every change to a product goes through that product's own signed command endpoint, so each product keeps control of its billing, access and data rules.

## 2. Decisions already made

| Decision | Choice | Reason |
|---|---|---|
| Who uses the CRM | Internal. The owner now, team members later | Sells the owner's own products |
| How data arrives | Push. Each product sends signed events to the CRM | Products' databases and structure stay untouched |
| First products | Washcare (washcare.app) and Lux Laundry through one shared hook, then Bihub (bihub.ng) | Lux runs Presso's code (vault, 2026-09-30) |
| Database | New Supabase project owned by the CRM | Isolation from every product |

## 3. Architecture

```
Products ── POST /api/ingest/<product> (HMAC-signed) ──► events (raw, idempotent)
                                                              │ adapter per product
                                                              ▼
                       companies · contacts · deals · activities · subscriptions · payments
                                                              ▲
                                  CRM UI reads only these tables (row-level security on)
```

- The CRM never writes to a product database. Products never read the CRM.
- Raw events are kept so a faulty adapter can be fixed and replayed.
- Washcare and Lux share one helper `sendCrmEvent(type, payload)`. It sends `product: "lux"` when `SOLE_TENANT_ID` is set, and `product: "washcare"` with the tenant id otherwise.

## 4. Data model

All money is stored as integer minor units (kobo for NGN) with a currency code.

Every table below except `products` carries a `workspace_id`. The owner's internal CRM is workspace 1. Embedded CRMs (section 7.4) are further workspaces. Adding this column now costs little. Adding it later would mean migrating every table and every row-level security rule.

| Table | Fields (summary) | Notes |
|---|---|---|
| `workspaces` | id, name, kind (`internal`, `embedded`), product, external_tenant_id | One per CRM user group |
| `workspace_members` | workspace_id, user_id, role (`owner`, `member`) | Replaces a global role. One person can belong to several workspaces |
| `products` | slug, name, host, stages[], segments[], tag tones, deal-value rule, secret ref | The product profile |
| `events` | product, event_id (unique), type, payload, status, received_at | Duplicate event_id is ignored |
| `companies` | product, external_id, name, stage, segment, owner_id, pipeline_value, win_probability, last_interaction_at | Unique on (product, external_id) |
| `contacts` | company_id, name, email, phone | |
| `deals` | company_id, stage, value, status | |
| `activities` | company_id, kind, summary, at | Feeds last interaction and activity trend |
| `subscriptions` | company_id, product, plan, status (`trialing`, `active`, `past_due`, `cancelled`), amount, currency, interval, started_at, renews_at, cancelled_at | One current row per company and product, with history kept in `events` |
| `payments` | company_id, subscription_id, amount, currency, provider (`paystack`), reference (unique), status, paid_at | One row per successful or failed charge |
| `profiles` | user_id, name | Role lives in `workspace_members` |
| `emails` | company_id, contact_id, to, subject, body, status (`draft`, `sent`, `delivered`, `bounced`, `failed`), provider_message_id, sent_by, sent_at | Section 7.1 |
| `suppressions` | email, reason (`unsubscribed`, `bounced`, `complained`, `manual`), at | Checked before every send. Also used by sub-project 2 |
| `commands` | product, company_id, action, params, status (`pending`, `confirmed`, `failed`, `expired`), sent_by, sent_at, confirmed_at | Section 7.3 |
| `imports` | product, started_at, finished_at, events_sent, events_failed, cursor | Section 7.2. A cursor lets a stopped import resume |

## 5. Event contract (v1)

Every event: `event_id`, `product`, `type`, `occurred_at`, `data`. Signed with HMAC-SHA256 over timestamp and body. Requests older than 5 minutes are rejected.

| Type | Sent when | Creates or updates |
|---|---|---|
| `account.created` | Sign-up or store or laundry created | company, contact |
| `lead.captured` | Waitlist, contact form | company or contact, activity |
| `subscription.changed` | Trial start, upgrade, downgrade, cancel, lock | subscription, deal stage |
| `payment.succeeded` / `payment.failed` | Paystack webhook handled in the product | payment, activity, subscription status |

Each product sends these from 3 to 5 server-side call sites. No schema change in any product.

## 6. Subscriptions and sales (answers "can I manage subscriptions and see sales?")

**v1 — see everything, read-only:**
- New **Overview** screen with sales for a chosen period (today, 7 days, 30 days, custom), split by product.
- Figures: revenue collected, new paid accounts, monthly recurring revenue (MRR), active subscriptions, trials ending in the next 7 days, failed payments, cancellations.
- A **Subscriptions** list: company, product, plan, status, amount, renews on. Filter by product and status.
- A **Payments** list with the Paystack reference.
- Each company page shows its subscription and payment history.
- Every chart has a text table or figure beside it, and status is never shown by colour alone.

**v2 — manage from the CRM:** see section 7.3.

Until v2 ships, the Subscriptions screen shows a text label "Managed in the product" with a link to that product's admin.

## 7. Later phases (in scope)

### 7.1 Email sending

- The owner writes and sends one-to-one emails from a company page. Templates have fields such as the company name and plan, filled at send time.
- Provider: Resend, already used by Bihub. Sent from a verified domain per product, so the email matches the brand the person signed up with, for example `hello@washcare.app` and `hello@bihub.ng`.
- Every send checks `suppressions` first. Every email has an unsubscribe link and the sender's business address.
- Delivery, bounce and complaint webhooks from Resend update `emails.status`. A bounce or complaint adds a suppression.
- Each sent email is logged as an activity, so "last interaction" stays true.
- No bulk or automated sequences in this phase. Each send is a person's action. Sequences belong with sub-project 3.

### 7.2 Importing history

- A one-off import per product sends that product's past sign-ups, subscriptions and payments as ordinary events through the same ingest endpoint. There is one code path for live and past data, so the adapters are tested once.
- The import runs as a script inside the product repo, reading the product's own database with its own credentials. The CRM never gets product database credentials.
- `event_id` is built from the product's own row id (for example `washcare:payment:<id>`), so running the import twice creates no duplicates and live events never clash with imported ones.
- `imports` records progress and a cursor, so a stopped import resumes where it left off.
- Lux is imported with `product: "lux"` from Lux's own Supabase. The import only reads, so tenant 1 data is safe.

### 7.3 Managing products from the CRM (subscriptions and accounts)

- Each product adds one signed endpoint, `POST /api/crm-command`, with its own secret, separate from the ingest secret.
- Fixed action list: `extend_trial` (days), `change_plan` (plan), `cancel` (at period end or now), `reactivate`, `lock`, `unlock`. A product rejects any action it does not support.
- The CRM writes a `commands` row as `pending`, calls the product, and marks the command `confirmed` only when the product's matching `subscription.changed` event arrives. If none arrives within 10 minutes, the command shows as `expired`, with the reason in text.
- Destructive actions (`cancel` now, `lock`) need a confirmation dialog that names the company and the effect. Only the workspace `owner` role can send commands.
- Every command records who sent it, so changes can be traced.
- Washcare: commands change the tenant's plan and status, which decides locking. Lux is excluded from `lock` and `cancel`, because its status is fixed as `active` (vault, 2026-09-30). Bihub: commands change `stores.plan`.

### 7.4 Embedding the CRM inside products

- The same CRM code serves product customers as their own workspace. For example, a laundry owner on Washcare sees their own customers and orders, and a Bihub seller sees buyers and waitlist leads.
- Each product tenant maps to one `workspaces` row (`kind: embedded`, `external_tenant_id`). Row-level security limits every query to the user's workspace memberships.
- Sign-in: the product hands the signed-in user to the CRM with a short-lived signed token. The CRM creates or matches the user and their membership. No second password.
- Shown inside the product at a route such as `/crm`, on the CRM's own domain, with the product's name and tag tones from its profile. The product keeps its own navigation.
- Data: the product sends customer-level events (`customer.created`, `order.completed`, `lead.captured`) tagged with the tenant id. They land in that tenant's workspace only.
- Plan gating: the product decides which plans include the CRM and sends that in the token. The CRM does not sell plans itself.
- The owner's internal workspace never shows embedded workspaces' customer data. Only account-level figures (plan, payments) reach workspace 1, as now.
- Before this phase is built, it gets a short addendum covering the token format and the customer event payloads per product. The rest of this design stands.

## 8. Access and security

- Supabase Auth email login. Only the owner exists at first.
- Row-level security on every table. Signed-out requests read nothing.
- Roles are per workspace. `owner`: everything in that workspace, including invites, product profiles, commands and deletes. `member` (later): reads all, edits companies where `owner_id` is theirs, sends email, no commands.
- Ingest runs server-side with the service-role key. That key never reaches the browser.
- One signing secret per product, stored in that product's Vercel environment and in the CRM's.
- Command endpoints use a separate secret from ingest, so receiving data and sending commands can be revoked independently.
- Embedded sign-in tokens use a third secret per product and expire within 5 minutes.

## 9. UI changes

1. `STAGES` and `SEGMENTS` in `data/companies.ts` come from the selected product's profile, including the tag tones.
2. Product switcher in the sidebar, with an "All products" view.
3. Product tag on company rows.
4. `lib/companies.ts` reads Supabase. The filter, sort and CSV logic stay as they are.
5. New routes: Overview, Subscriptions, Payments.
6. Each product shows a text status, "Receiving" or "No events yet".
7. Company page: an email composer, and a "Manage" menu with the command actions and each command's status in text.
8. Settings: products and secrets status, imports with progress, suppressions list, and workspace members.

Follows `CONVENTIONS.md`: check the type scale in `app/globals.css` first, Tailwind only, the `Asset` component, `Button` with an explicit variant. Accessibility follows WCAG 2.2 AA: native elements, a live region for filter result counts, visible focus, and tables with real headers.

## 10. Context for future sessions

- One note per product at `AI Context/Projects/sales-crm/memory/product-<name>.md`: event contract, profile, call sites. Linked from that folder's `MEMORY.md`.
- One note in `20-decisions/` for "internal, push-based, one database", with triggers `crm`, `ingest`, `multi-tenant`, `subscriptions`.
- Each product repo's vault folder gets a pointer to its CRM note when its hook is added. The `Presso` and `Lux-Laundry` memory folders are empty today.

## 11. Testing

- Adapters: sample event in, expected rows out, for every event type and product.
- Idempotency: the same `event_id` twice makes no duplicates.
- Signature: bad signature and stale timestamp are rejected.
- Row-level security: signed-out reads nothing, a member cannot edit another owner's company, and a user in one workspace reads nothing from another.
- Money: totals and MRR are computed from integer minor units, with a test for rounding and mixed intervals (monthly and yearly).
- Replay: fixing an adapter and replaying a failed event gives the correct rows.
- Email: a suppressed address is never sent to, and a bounce webhook adds a suppression.
- Import: running an import twice gives the same rows, and a stopped import resumes from its cursor.
- Commands: a command stays `pending` until its confirming event, expires after 10 minutes without one, and a member cannot send one. Lux rejects `lock` and `cancel`.
- Embedding: an expired or wrongly signed token is refused, and an embedded user never sees workspace 1.

## 12. Build order

1. CRM Supabase project, schema with `workspace_id` throughout, row-level security, login.
2. Ingest endpoint, signature check, `events` table, adapter for Washcare.
3. UI reads real data, product switcher, profile-driven stages.
4. `sendCrmEvent` in Presso (covers Washcare and Lux).
5. Overview, Subscriptions and Payments screens.
6. Bihub adapter and helper.
7. History import for Washcare, Lux and Bihub (7.2).
8. Email sending (7.1).
9. Command endpoints and manage actions (7.3).
10. Embedded CRM, after its addendum (7.4).

## 13. Later sub-projects (each gets its own spec)

Agreed on 2026-10-11. This spec covers sub-project 1 only.

| # | Sub-project | Summary | Needs from this spec |
|---|---|---|---|
| 2 | Prospecting engine | Finds businesses through official sources (such as the Google Places API), audits their sites with the existing `accessiscan` engine, finds a public or provider-supplied contact, and adds them to the CRM as Prospects. A person sends the first message. Targets: accessibility audits and fixes, websites (Bihub Tech), Washcare for laundries, Bihub storefronts, and the owner's other apps | `companies.source`, a Prospect stage in each product profile, an `audits` table, a suppression list |
| 3 | Marketing hub | Drafts, schedules and tracks free organic posts (Google Business Profile, Meta Pages and Instagram, LinkedIn, YouTube), attributes leads to channels with tracking links, and later connects Google Ads and Meta Ads for paid campaigns with a spending cap | Lead attribution fields on `companies` and `events` |

Ad platforms charge for ad delivery, so paid ads stay paid. The hub manages and measures them. It does not avoid the cost.

Scraping rules for sub-project 2, fixed now: respect `robots.txt`, rate-limit, keep only business contact data with its source URL, honour opt-outs, and never automate bulk first contact.

## 14. Defaults until the owner says otherwise

- Currency: amounts are stored with their currency. The Overview shows one currency at a time with a currency switch, and never adds different currencies together.
- Prices: each product sends the amount. The CRM keeps no price list.
- Lux Laundry's owner (the client) gets no view of the internal CRM. They can get the embedded CRM in 7.4 like any Washcare laundry.
- Before pulling Presso updates into Lux, check that the new helper and command endpoint do not write tenant 1 data outside the allowed actions.
