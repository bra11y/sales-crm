# Sales CRM: product integration, subscriptions and sales

Date: 2026-10-11 | Status: draft for review | Path: architectural

## 1. Purpose

One internal CRM that the owner (Bryan) uses to run sales across every product he owns. Products keep their own structure. The CRM receives what happened in each product, shows it in one place, and shows subscriptions and sales made.

**Success looks like:**
- A sign-up, lead, plan change or payment in any connected product shows in the CRM within seconds.
- The current CRM screens keep working, now with real data and a product switcher.
- The owner sees sales and subscriptions across all products on one overview.
- Adding a product means one profile row, one adapter file and one helper call in that product.

**Not in scope for v1:** email sending, importing history, embedding the CRM inside products for their own customers (a possible later stage), and any write to a product database.

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

| Table | Fields (summary) | Notes |
|---|---|---|
| `products` | slug, name, host, stages[], segments[], tag tones, deal-value rule, secret ref | The product profile |
| `events` | product, event_id (unique), type, payload, status, received_at | Duplicate event_id is ignored |
| `companies` | product, external_id, name, stage, segment, owner_id, pipeline_value, win_probability, last_interaction_at | Unique on (product, external_id) |
| `contacts` | company_id, name, email, phone | |
| `deals` | company_id, stage, value, status | |
| `activities` | company_id, kind, summary, at | Feeds last interaction and activity trend |
| `subscriptions` | company_id, product, plan, status (`trialing`, `active`, `past_due`, `cancelled`), amount, currency, interval, started_at, renews_at, cancelled_at | One current row per company and product, with history kept in `events` |
| `payments` | company_id, subscription_id, amount, currency, provider (`paystack`), reference (unique), status, paid_at | One row per successful or failed charge |
| `profiles` | user_id, name, role (`owner`, `member`) | |

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

**v2 — manage from the CRM (needs write-back):**
Actions such as extend a trial, change plan, cancel or reactivate must change the product, because the product owns billing and access. In Washcare, the plan and `active` status decide whether a laundry locks. In Bihub, `stores.plan` is set by the Paystack callback. So v2 adds one signed command endpoint in each product, `POST /api/crm-command`, that applies a small fixed list of actions. The CRM sends the command and then waits for the product's confirming `subscription.changed` event before it shows the change. Nothing is shown as done until the product confirms.

Until v2 ships, the Subscriptions screen shows a text label "Managed in the product" with a link to that product's admin.

## 7. Access and security

- Supabase Auth email login. Only the owner exists at first.
- Row-level security on every table. Signed-out requests read nothing.
- `owner` role: everything, including invites, product profiles and deletes. `member` role (later): reads all, edits companies where `owner_id` is theirs.
- Ingest runs server-side with the service-role key. That key never reaches the browser.
- One signing secret per product, stored in that product's Vercel environment and in the CRM's.
- v2 command endpoints use a separate secret from ingest, so receiving data and sending commands can be revoked independently.

## 8. UI changes

1. `STAGES` and `SEGMENTS` in `data/companies.ts` come from the selected product's profile, including the tag tones.
2. Product switcher in the sidebar, with an "All products" view.
3. Product tag on company rows.
4. `lib/companies.ts` reads Supabase. The filter, sort and CSV logic stay as they are.
5. New routes: Overview, Subscriptions, Payments.
6. Each product shows a text status, "Receiving" or "No events yet".

Follows `CONVENTIONS.md`: check the type scale in `app/globals.css` first, Tailwind only, the `Asset` component, `Button` with an explicit variant. Accessibility follows WCAG 2.2 AA: native elements, a live region for filter result counts, visible focus, and tables with real headers.

## 9. Context for future sessions

- One note per product at `AI Context/Projects/sales-crm/memory/product-<name>.md`: event contract, profile, call sites. Linked from that folder's `MEMORY.md`.
- One note in `20-decisions/` for "internal, push-based, one database", with triggers `crm`, `ingest`, `multi-tenant`, `subscriptions`.
- Each product repo's vault folder gets a pointer to its CRM note when its hook is added. The `Presso` and `Lux-Laundry` memory folders are empty today.

## 10. Testing

- Adapters: sample event in, expected rows out, for every event type and product.
- Idempotency: the same `event_id` twice makes no duplicates.
- Signature: bad signature and stale timestamp are rejected.
- Row-level security: signed-out reads nothing, and a member cannot edit another owner's company.
- Money: totals and MRR are computed from integer minor units, with a test for rounding and mixed intervals (monthly and yearly).
- Replay: fixing an adapter and replaying a failed event gives the correct rows.

## 11. Build order

1. CRM Supabase project, schema, row-level security, login.
2. Ingest endpoint, signature check, `events` table, adapter for Washcare.
3. UI reads real data, product switcher, profile-driven stages.
4. `sendCrmEvent` in Presso (covers Washcare and Lux).
5. Overview, Subscriptions and Payments screens.
6. Bihub adapter and helper.
7. v2 command endpoints and manage actions.

## 12. Open questions

- Which currencies appear besides NGN? Stored per row, but the Overview totals need one rule, either a currency switch or no cross-currency sum.
- Are plan prices defined in each product or should the CRM keep a price list? Default: the product sends the amount.
- Does the Lux Laundry owner (the client) need any view of this? Default: no, it is internal.
- Before pulling Presso updates into Lux, check that the new helper does not touch tenant 1 data. It only sends, so it should be safe.
