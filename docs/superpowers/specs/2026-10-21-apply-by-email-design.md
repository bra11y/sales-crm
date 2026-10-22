# Apply by email: AI tailoring, one-click send, reply tracking, auto follow-up

Date: 21 October 2026. Project 2 of 6 in the job-application app inside the Sales CRM.
Builds on project 1 (Jobs, Profile, Apply). Owner and first user: Bryan Onyenghan.

## Why

Tailoring a CV and cover letter to each job post by hand takes time, and sending them takes more. Employers often never reply (55% of job seekers name ghosting as their top frustration, Resume Genius 2026). The goal is to send many good, true, tailored applications a day with one click each, then follow up and track replies without manual work.

Success looks like this: a strong match found in the morning is tailored, checked, sent and tracked in under 2 minutes of Bryan's time, and nobody is left un-followed-up.

## Goals

1. **AI tailoring.** From the exact job post, write a tailored CV and cover letter using only the facts in the user's Profile.
2. **One-click send.** Email the application from the user's own Gmail, with the CV attached as a PDF and the cover letter as the email body.
3. **Reply tracking.** Detect replies in the same Gmail inbox, link them to the application and suggest a stage.
4. **Auto follow-up.** Two follow-ups, 5 days apart, then stop. Any reply cancels the follow-ups still to come.

## Non-goals

- Filling job application forms (project 4, the Chrome extension).
- WhatsApp alerts and control (project 3). This project only leaves hooks for them.
- Finding or guessing employer email addresses, buying contact lists, or scraping LinkedIn.
- Sign-up for other users (project 6). Everything here is still scoped per user.

## Anti-goals (failure even if it "works")

- Any sentence in a sent CV, letter or follow-up that isn't backed by the Profile. That includes invented results, tools the user hasn't used, and seniority claims.
- Any email sent without the user seeing it first, except follow-ups that were listed in "Sending tomorrow" and not cancelled.
- The user's Gmail flagged as spam, or the account locked.
- The app password readable in the database, the logs or the browser.

## Decisions Bryan made

- Send from and read replies at **bryanonyenghan@gmail.com**.
- Follow-ups: **2, 5 days apart, then stop.**
- AI through **Vercel AI Gateway**. There is no separate Anthropic key.
- Nothing is missing from the playback of 21 October.

## Calls made by Claude (Bryan can change any of these)

1. **Gmail app password**, not Google OAuth. It sends over SMTP (`smtp.gmail.com:465`) and reads over IMAP (`imap.gmail.com:993`). Google's OAuth for unverified apps expires refresh tokens every 7 days. Revisit in project 6.
2. **Model:** `anthropic/claude-haiku-5.5` on the Gateway, at $0.10 per million input tokens and $0.50 per million output tokens (gateway price list, 21 October 2026). That's about 0.25 US cents per application. It signs in to the Gateway with Vercel OIDC (`VERCEL_OIDC_TOKEN`, already in `.env.local`).
3. **The AI picks and rewords; it never adds facts.** The model gets the job post and the Profile as JSON. It returns structured output (a schema, not free text). That output is a profile summary, an ordered list of skill labels, chosen result IDs with light rewording, and the cover letter paragraphs. Code then assembles the CV markdown from that output plus the Profile.
4. **Checks after the AI:** every draft runs the existing `E.lint` quality gate. Two new checks are added:
   - **Fact check:** every number, proper noun and tool named in the AI text must appear in the Profile. A miss fails the draft.
   - **Gap check:** no tool from the Profile's "Tools you have not used" list may appear.

   If the draft fails, the code makes one retry that names the failure. If it fails again, the app uses the existing rule-based draft and shows why.
5. **Recipient:** only an email address found in the job post, or typed by the user. A found address is shown with the sentence it came from. Nothing is sent without a recipient the user can see.
6. **Limits:** at most 25 sends a day, counting applications and follow-ups. A minimum of 60 seconds between sends. The first send ever after connecting Gmail goes to the user's own address as a test.
7. **Send window:** 08:00 to 18:00 on weekdays, in the employer's time zone. The time zone is guessed from the job location: US, UK, a named EU country, or a region. Otherwise it uses Abuja time. One-click sends outside the window are queued, with a clear "Sends at 08:10 New York time" note and a "Send now anyway" option.
8. **Scheduling:** the Vercel Hobby plan allows one cron run a day. A GitHub Actions workflow runs every hour, for free, and calls `/api/jobs/tick` with its own secret, `AUTOMATION_SECRET`. Each tick checks replies, sends due follow-ups and sends queued applications. The daily Vercel cron stays for the job search. Opening the Outbox also checks replies, at most once every 5 minutes.
9. **Secret storage:** the app password is encrypted with AES-256-GCM using `MAIL_ENCRYPTION_KEY`, a 32-byte key kept in Vercel env, and decrypted only in server code. It's never sent to the browser, and only "Connected as …" is shown.
10. **Follow-up content:** follow-ups are written by the AI at tailoring time and stored, so the user can read them before they send. Each is 3 to 4 lines in the same thread (`In-Reply-To` and `References` headers, with "Re:" in the subject). They mention the role and one true result. Follow-up 2 adds a polite close: "If the role is filled, no need to reply."
11. **Reply stage suggestion:** keyword rules, not AI.
    - "interview", "schedule", "call", "next step" suggest **Interview**.
    - "unfortunately", "not moving forward", "other candidates" suggest **Closed**.
    - Anything else suggests **Replied**.

    The user confirms with one click. Auto-replies ("out of office", "automatic reply") are ignored.
12. **CRM record:** sending an application calls the same path as "Save application". It creates the company under Applications at the Applied stage, with the job post and the exact documents sent. A confirmed reply stage moves that CRM stage too.
13. **New job statuses:** `new`, `saved`, `applied`, `replied`, `no_reply`, `dismissed`. The CRM application stage keeps moving on its own (Applied → Interview → Offer …).

## What the user sees

- **Job side panel:** "Tailor with AI" shows a progress status, then the CV and cover letter in editable boxes, with the check notes. The recipient field is pre-filled when an address was found. Then "Send application" or "Download" (the existing Word and PDF buttons).
- **Outbox** (new tab on Jobs, or `/outbox`) has four lists:
  - **Sending soon:** follow-ups and queued sends, each with Edit, Cancel and Send now.
  - **Sent:** waiting for a reply, with the follow-up dates.
  - **Replied:** with the reply snippet and the suggested stage.
  - **No reply:** both follow-ups sent and 5 days passed.
- **Profile → Gmail section** has:
  - Steps to create an app password, linking to `myaccount.google.com/apppasswords` and noting it needs 2-Step Verification.
  - A password field with paste allowed, then **Connect**. Connecting tests SMTP and IMAP before saving.
  - A "Send me a test email" button.
  - "Connected as bryanonyenghan@gmail.com · Disconnect".
- **Profile email:** the CV contact line uses the connected Gmail address unless the user sets another.

Accessibility follows the global WCAG 2.2 AA rules. Every async step (tailoring, sending, reply check) announces through a polite live region, and errors go in `role="alert"` and name the fix.

## Data (new migration)

- `mail_accounts`:
  - `user_id` (primary key), `email`
  - `secret_ciphertext`, `secret_iv`, `secret_tag`
  - `connected_at`, `last_checked_at`, `last_uid` (IMAP), `test_sent_at`
  - RLS: the owner can select `email` and the timestamps only (column grants). Writes happen in server actions with the admin client.
- `applications_outbox`, one row per email:
  - `id`, `user_id`, `job_id`
  - `kind` (`application`, `follow_up_1`, `follow_up_2`), `to_email`, `subject`, `body`, `attachments` (CV markdown, rendered to PDF at send)
  - `status` (`draft`, `queued`, `sent`, `cancelled`, `failed`), `send_after`, `sent_at`
  - `message_id`, `thread_ref`, `error`
- `application_replies`:
  - `id`, `user_id`, `job_id`, `outbox_id`
  - `from_email`, `received_at`, `snippet` (500 characters), `suggested_stage`, `confirmed`
- `job_posts.status`: add `replied` and `no_reply`. Add `contact_email` and `contact_source`, the sentence the address was found in.

Every table is RLS-scoped to `user_id = auth.uid()`, with pgTAP tests like `job-finder.test.sql`.

## Server pieces

- `lib/apply/ai.ts`: Gateway call (AI SDK `generateObject`), prompt, output schema, fact check and fallback. Pure helpers are unit-tested with a fake model.
- `lib/mail/crypto.ts`, `lib/mail/send.ts` (nodemailer), `lib/mail/inbox.ts` (imapflow): match replies by `In-Reply-To`/`References` to stored `message_id`s, with the sender's domain as a backup.
- `lib/mail/schedule.ts`: pure functions for the send window, daily cap, follow-up due dates and cancel-on-reply. These are fully unit-tested.
- `lib/pdf/cv.ts`: renders the CV markdown to a PDF server-side. The builder picks the library. The existing browser print path isn't available on the server.
- `app/api/jobs/tick/route.ts`: protected by `AUTOMATION_SECRET`, idempotent, and safe to run twice.

New dependencies (`ai`, `nodemailer`, `imapflow` and a PDF library) must be vetted for licence, maintenance and install scripts before they're added, under rule 3 of Bryan's `CLAUDE.md`.

## Setup the user must do (cannot be done for them)

1. Turn on Google 2-Step Verification if it's off. Create an app password named "Sales CRM".
2. Paste the app password into Profile → Gmail.
3. Approve adding `MAIL_ENCRYPTION_KEY` and `AUTOMATION_SECRET` in Vercel, and `AUTOMATION_SECRET` in the GitHub repository's secrets. The commands are given in the same form as `CRON_SECRET`.
4. Make sure AI Gateway is turned on for the Vercel team (Dashboard → AI Gateway).

## Testing

- Unit tests: output schema parsing, the fact check (with planted invented claims), the gap check, fallback, send window and time-zone guess, daily cap, follow-up timing, cancel-on-reply, reply matching and stage suggestion, and email extraction from job posts.
- DB tests: RLS on the three new tables, and the owner can't read the ciphertext columns.
- End to end, locally: a fake SMTP and IMAP server (the local Supabase Mailpit for SMTP, and an in-memory IMAP fake), so no real email is sent.
- First live test: send to the user's own address only, after the user approves.

## Left to the builder

The PDF library, the prompt wording (inside the rules above), the Outbox layout details within the house UI, and how often the Outbox list refreshes.

## Changes made during the build (22 October 2026)

- **AI writes only the 2 "why this company" sentences.** The CV and the rest of the letter stay rule-based, and the follow-ups use templates. That brings the cost from about 0.25 cents to about 0.03 cents per application. It falls back to a plain sentence when AI is off, unreachable or fails the checks.
- **Any OpenAI-style provider.** A free provider (`FREE_AI_*`) is tried first, then the Gateway. Profile has an AI on/off switch. See `docs/guides/apply-setup.md`.
- **Limits:** 40 a day, 15 seconds apart, so one hourly tick can send a batch.
- **Most jobs use forms.** Only about 6% of posts name any email, and most of those aren't for applying. So Apply gives an apply kit for form jobs: the CV PDF, copyable answers, the form link, and "I sent it on their form". The address finder only takes an email from a sentence that says to apply, and it rejects privacy, security, accommodation and help addresses.
- **The first send must be a test to yourself**, made with "Send me a test email" in Profile.
- **The cover letter quotes the post's own words** when a skill was matched by another word (e.g. "payments" for Paystack), so it never claims the post asked for something it didn't.
- **The CRM stage move on a confirmed reply is not built yet.** Confirming a reply changes the job status only.
