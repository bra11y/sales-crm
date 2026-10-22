# Apply by email: setup, free AI, and how it works

Last checked: 22 October 2026.

## What one click does

1. On **Jobs**, open a job and press **Apply**.
2. The app writes your application in about 3 seconds:
   - **CV**: picked from your Profile by plain rules. Your best lines for this job go first. It costs nothing.
   - **Cover letter**: also from your Profile, plus 2 sentences on "why this company". A small AI model writes those 2 sentences, and code checks every name and number against the job post and your Profile. If the AI invents anything, the app uses a plain sentence instead.
3. What happens next depends on the job:
   - **The post gives an apply email** ("Apply by email" in the table): check the email, press **Send application**. It goes from your own Gmail with the CV as a PDF. Two follow-ups are booked for 5 and 10 days later. They are cancelled as soon as the employer replies.
   - **The post uses a form** (most jobs): you get an apply kit. Download the CV, copy each answer, and open the form. Press **I sent it on their form** when done.
4. Every application is saved in the CRM under Applications, stage Applied.
5. The **Outbox** shows what is waiting, what was sent, replies, and jobs with no reply.

### Proof of work (what keeps it free of AI filler)

Profile → **Proof of work** holds real things an employer can open: a title, what you did, the measured result, and a link. For each job the app picks the best 2 or 3 by matching their tags to the post. They go into:

- the email, as "Work you can check:" with links, just before the sign-off
- follow-up 1, which links one piece of work
- form answers like "Tell us about a project you're proud of" and "Anything else?"

Nothing in this block is written by AI. Add a link to every item you can. Items without one show "Add a link" in the Apply panel.

**Saved answers** (Profile) hold answers forms ask again and again: notice period, salary, visa, years of experience. Fill each once. The extension pastes them, and it lists any question you haven't answered yet.

### The Chrome extension (form jobs)

1. In Chrome, go to `chrome://extensions` and turn on Developer mode.
2. Press **Load unpacked** and choose the `extension` folder in this project.
3. In Profile → **Chrome extension**, press **Make a connection code**. Paste the code into the extension once.
4. On an application form, open the extension and press **Fill this form**.

It fills your name, email, phone, location, LinkedIn and portfolio. It uploads the tailored CV into the box named Resume or CV, and opens and fills a typed cover letter box. It answers questions from your saved answers and your proof. It outlines every box it filled in blue and lists what you must check yourself. **It never presses Submit.** Then press "I sent it: mark as applied" in the extension or the CRM.

It was tested on live Greenhouse (Level Access), Lever (Spotify) and Ashby (Supabase) forms on 22 October 2026. It doesn't fill passport or citizenship boxes, because your Profile doesn't say what passport you hold. City lists that come from Google search are flagged for you to pick.

### Why most jobs can't be sent in one click

- Greenhouse, Lever and Ashby only accept applications through the employer's own secret key, so no outside app can submit to them.
- Their forms have CAPTCHAs and custom questions.
- On 22 October, only 17 of 269 job posts named any email address. Most of those were for privacy, security or interview adjustments. The app never uses those.

The Chrome extension (project 4) fills the forms in your own browser. That's the path to sending far more applications.

### Indeed and LinkedIn

Both ban scraping and block bots, and an account that scrapes them can be banned. The safe path is to turn on **job alert emails** on both sites. A later step can read those alert emails from your Gmail and add the jobs to the Jobs page.

## Setup (once)

### 1. Database

From the project folder, run:

```
supabase db push
```

### 2. Server secrets (Vercel and GitHub)

Run each line on its own. The key is made and stored without being shown.

```
openssl rand -base64 32 | tr -d '\n' | vercel env add MAIL_ENCRYPTION_KEY production
S=$(openssl rand -hex 32); printf %s "$S" | vercel env add AUTOMATION_SECRET production; gh secret set AUTOMATION_SECRET --body "$S" --repo bra11y/sales-crm; unset S
```

Never change `MAIL_ENCRYPTION_KEY` after you connect Gmail. A new key can't unlock the stored password, so you would need to connect Gmail again.

### 3. Gmail

1. In your Google account, turn on 2-Step Verification.
2. Open [Google app passwords](https://myaccount.google.com/apppasswords), name it "Sales CRM", and press Create.
3. In the app, go to **Profile → Sending applications**. Paste the 16-letter password and press **Connect Gmail**.
4. Press **Send me a test email**. Applications unlock after the test.
5. Check that IMAP is on: in Gmail, open Settings → Forwarding and POP/IMAP.

### 4. AI Gateway

In the Vercel dashboard, open **AI Gateway** and make sure it's on. Every team gets **$5 of free credit each month**. At about 0.03 US cents per letter, that covers well over 10,000 letters a month. Buying credit ends the free monthly $5, so don't top up unless you need to.

## Making the AI cost zero

The app only uses AI for 2 sentences per application. It tries a free provider first if you set one, then the Gateway, then plain rules. You can also turn AI off in Profile.

Every provider below speaks the same OpenAI-style format. Set three values in Vercel, one line each:

```
printf %s "<base url>" | vercel env add FREE_AI_BASE_URL production
printf %s "<model>" | vercel env add FREE_AI_MODEL production
vercel env add FREE_AI_API_KEY production
```

The last line asks you to paste the key, so it never appears in your shell history.

| Provider | FREE_AI_BASE_URL | FREE_AI_MODEL (check the provider's list) | Free limit (reported, Oct 2026) | Watch out for |
|---|---|---|---|---|
| **Groq** (recommended) | `https://api.groq.com/openai/v1` | `openai/gpt-oss-20b` | About 1,000 requests a day | Llama 3.3 70B was retired on 16 Aug 2026. |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | the current Flash or Flash-Lite model in AI Studio | Flash models are free | Outside the EEA, UK and Switzerland, free prompts may be used to train Google's models, and your CV facts go in the prompt. |
| **OpenRouter** | `https://openrouter.ai/api/v1` | any model ending in `:free` | 50 requests a day (1,000 after a $10 top-up) | Free models can be slow or busy. |
| **Mistral** | `https://api.mistral.ai/v1` | `mistral-small-latest` | Free "Experiment" plan | Needs phone verification. |
| **xAI Grok** | `https://api.x.ai/v1` | the current Grok model in the xAI console | About $25 promo credit for new accounts; no lasting free tier | The data-sharing credit program has changed. Check the console. |
| **Cerebras** | `https://api.cerebras.ai/v1` | see their model list | Reports say the free tier ended in July 2026 | Needs a card. |

**Recommendation:** Groq first, with the Vercel Gateway as backup. At 40 applications a day, both stay free. Before you pick a provider, read its data policy, because your Profile facts go in the prompt.

To check which provider is active, open **Profile → Sending applications**. The line under the AI switch names it. No key is ever shown.

## Limits and safety

- At most **40 emails a day**, counting follow-ups, with at least 15 seconds between them.
- Emails only send **8:00 to 18:00 on weekdays** in the employer's time zone, guessed from the job location. Outside those hours, the app queues the email. You can tick "Send now anyway".
- The app password is locked with AES-256-GCM. Your browser can never read it, and neither can the database's public API.
- The app never sends to an address it guessed. It only uses an address found in the post's "apply" sentence, or one you typed.
- Replies are checked every hour by the GitHub workflow, once a day by the Vercel cron, and whenever you open the Outbox.

## Local testing

Set `MAIL_DROP_DIR` to a folder. Each email is then saved as an `.eml` file there, and nothing is sent or read from Gmail. It only works outside production.
