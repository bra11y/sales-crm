# REA report: job board sources for the Job Finder

Method: `~/Downloads/rea-analyst.md` (evidence first, clean-room rebuild, tests from real observations).
Analysed: 21 October 2026. Provider: website (network observation with curl and Node fetch). The REA CLI was not installed. Its install script was not vetted, and public JSON APIs need no binary analysis.

## 0. Scope and authorisation (Gate 0)

- **Targets:** the public job APIs and feeds of Remotive, Remote OK, Himalayas, Jobicy, We Work Remotely, Arbeitnow, Greenhouse, Ashby and Lever.
- **Feature:** "list current remote jobs with title, company, location limits, pay and post date."
- **Authorisation:** every target publishes these endpoints for public use. The terms below were read from each response. No login, paywall or anti-bot measure is bypassed.
- **Rebuilt behaviour:** one shared job shape (`JobPost` in `lib/jobs/sources.ts`), filled from each board.

## 1. Executive summary

Nine sources work today and give about 1,100 posts per search, about 980 after removing duplicates. After the fit rules, about 60 to 70 are in the user's field, open to a person in Abuja and over the pay floor. A full search takes 9 to 13 seconds with 6 requests at a time.

## 2. Evidence log

### F-1: Remotive limits use and asks for credit
- Confidence: proven
- Evidence: the `0-legal-notice` field in the response. It asks for a link back and credit, and at most 4 calls a day. It also bans showing its jobs in order to collect sign-ups.
- Location: `GET https://remotive.com/api/remote-jobs?category=software-dev&limit=100`
- Effect on the build: Remotive waits 6 hours between fetches (`minHoursBetween: 6`), and every job shows "via Remotive" with a link. **Before other users sign up (project 6), reread these terms.** Showing Remotive jobs to collect sign-ups breaks them.

### F-2: Remote OK puts a legal notice in row 0 and asks for a followed link back
- Confidence: proven
- Evidence: element `[0]` has `legal` and no `id`. Jobs start at `[1]`. `salary_min` and `salary_max` are yearly USD, with `0` meaning not listed.
- Location: `GET https://remoteok.com/api` (a browser-like user agent is needed)

### F-3: Himalayas search works, with pay and country limits as structured fields
- Confidence: proven
- Evidence: `/jobs/api/search?q=` returns `jobs[]` with `minSalary`, `maxSalary`, `currency`, `salaryPeriod`, `locationRestrictions[]` and `pubDate` (Unix seconds). An empty `locationRestrictions` means worldwide. `comments` says cursor paging replaces offset paging.

### F-4: Jobicy gives a region string and asks that Apply buttons go to its own job URL
- Confidence: proven
- Evidence: `friendlyNotice`. `jobGeo` values include "Anywhere", "EMEA" and country lists. The `geo` query parameter did not filter in testing, so the app filters regions itself.

### F-5: We Work Remotely is RSS, with "Company: Title" in `<title>`
- Confidence: proven
- Evidence: `<region>Anywhere in the World</region>`, and the description is HTML-escaped.

### F-6: Arbeitnow returns 300 jobs a page, mostly on-site in Germany
- Confidence: proven
- Evidence: the `remote` field is a boolean. Only `remote: true` posts are kept.

### F-7: Greenhouse content is HTML escaped twice and has no pay field
- Confidence: proven
- Evidence: `content` starts `&lt;div class=&quot;content-intro&quot;&gt;`. Pay only appears in the text, so it is read with `parsePay`.

### F-8: Ashby and Lever need the exact company slug; a wrong slug gives 404
- Confidence: proven
- Evidence: `api.lever.co/v0/postings/netflix` returned 404, and `.../spotify` returned 200. Ashby's `isListed: false` posts are hidden. Linear's oldest post is from 2021 and is still open, which is why the "always-open pipeline post" flag exists.

### F-9: Remotive tags describe the company, not the job
- Confidence: proven
- Evidence: "Remote Office Assistant" carried the tags CSS3, Shopify and WordPress, and matched 8 skills. The fit rule now requires the job title to be in the user's field.

### F-10: Many parallel requests fail on a slow connection
- Confidence: proven (seen in run 2 on 21 October: 25 of 28 requests failed; curl to the same hosts succeeded 1 minute later)
- Effect on the build: 6 requests at a time, one retry on network errors, never on HTTP errors.

## 3. Unknowns and limits

- Rate limits for Himalayas, Jobicy and Arbeitnow are not published. Each waits 3 hours between fetches.
- The Clearbit autocomplete endpoint used for company lookup is undocumented and may stop working. The lookup still gives LinkedIn, Glassdoor and news links without it.
- LinkedIn and Indeed are not sources. Their terms forbid scraping, and an account that scrapes can be banned.

## 4. Verification

`lib/jobs/jobs.test.ts` runs each adapter on a trimmed real response saved in `lib/jobs/fixtures/` (taken 21 October 2026). It also covers the salary formats seen live, location rules, ghost-post flags, dedupe, retries, company lookup safety and profile cleaning. Database rules are covered by `supabase/tests/database/job-finder.test.sql`.

## 5. Self-check

1. **Missing in the chain:** Lever's `salaryRange` field is mapped from documentation, not from a live post. None of the fixtures carried pay (guessed).
2. **Proven or plausible:** each F-entry above was seen in a live response.
3. **Pseudocode mistaken for behaviour:** not applicable. Only real responses were used.
4. **Same test cases:** yes. The fixtures are real responses.
5. **Next update:** each board's format sits behind one `parse` function in `SOURCES`. A board that changes breaks only its own test.
6. **Licence:** jobs are shown with credit and a link to the original post. See F-1 before the app is opened to other users.
7. **What would change my mind:** a board returning 403 or 429 to the app's user agent. Check `job_runs.errors` after the first week.
