"use client";

import { useEffect, useRef, useState } from "react";
import { LEVEL_LABEL, LEVELS } from "@/lib/jobs/level";
import Button from "@/components/_ui/button";
import { saveProfile, writeSummary } from "@/app/(crm)/profile/actions";
import type { StoredFacts } from "@/lib/jobs/facts";
import { type Preferences, WIDE_SEARCHES } from "@/lib/jobs/preferences";
import ExtensionSection, { type ExtensionState } from "./extension-section";
import MailSection, { type MailState } from "./mail-section";
import { Chips, FIELD, Lines, Property, Section, TextBlock } from "./editors";

type Props = {
  facts: StoredFacts;
  preferences: Preferences;
  updatedAt: string;
  sources: { id: string; name: string }[];
  mail: MailState;
  extension: ExtensionState;
  aiProvider: string;
  view?: "profile" | "settings";
  top?: React.ReactNode;
};

// Plain names and a line on what each is for. The ones most people never need sit under
// "More about you", so the first screen asks only for what every CV has.
const PERSON: { key: string; label: string; type?: string; autoComplete?: string; hint: string; more?: boolean }[] = [
  { key: "email", label: "Email", type: "email", autoComplete: "email", hint: "Where employers reply. It goes at the top of your CV." },
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel", hint: "With your country code, like +234 803 000 0000." },
  { key: "location", label: "City and country", autoComplete: "address-level2", hint: "Like Lagos, Nigeria. Employers use it to check time zones." },
  { key: "linkedin", label: "LinkedIn link", type: "url", autoComplete: "url", hint: "Your LinkedIn profile address. Leave empty if you have none." },
  { key: "portfolio", label: "Link to your work", type: "url", autoComplete: "url", hint: "A website, Google Drive folder or page that shows your work. Optional." },
  { key: "remote", label: "Where you can work", hint: "One line, like: Open to remote work worldwide. Optional.", more: true },
  { key: "brand", label: "Name people know you by", hint: "A nickname or brand you use at work, shown after your name in letters. Optional.", more: true },
  { key: "cpacc", label: "Your main certificate", hint: "One certificate with its number, shown under your name in letters. Optional.", more: true },
  { key: "behance", label: "Design portfolio (Behance)", type: "url", hint: "Only for designers: a link to Behance or Dribbble. Leave empty otherwise.", more: true },
  { key: "business", label: "Your registered business", hint: "If you run a business, its name and number. Optional.", more: true },
];

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ProfileDoc({
  facts: initialFacts,
  preferences: initialPrefs,
  updatedAt,
  sources,
  mail,
  extension,
  aiProvider,
  view = "profile",
  top,
}: Props) {
  const [facts, setFacts] = useState(initialFacts);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [state, setState] = useState<{
    kind: "idle" | "saving" | "saved" | "error";
    text: string;
  }>({ kind: "idle", text: `Saved at ${time(updatedAt)}` });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{
    facts: StoredFacts;
    preferences: Preferences;
  } | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void saveProfile(pending.current);
    },
    [],
  );

  function queue(next: { facts: StoredFacts; preferences: Preferences }) {
    pending.current = next;
    setState({ kind: "saving", text: "Saving…" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const body = pending.current;
      pending.current = null;
      if (!body) return;
      const r = await saveProfile(body);
      setState(
        r.ok
          ? { kind: "saved", text: `Saved at ${time(r.savedAt)}` }
          : { kind: "error", text: r.error },
      );
    }, 900);
  }

  function edit(fn: (f: StoredFacts) => StoredFacts) {
    const next = fn(structuredClone(facts));
    setFacts(next);
    queue({ facts: next, preferences: prefs });
  }
  function editPrefs(patch: Partial<Preferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    queue({ facts, preferences: next });
  }

  const trackIds = Object.keys(facts.tracks);

  return (
    <article aria-labelledby="profile-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        {view === "settings" ? (
          <h1
            id="profile-title"
            className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em]"
          >
            Settings
          </h1>
        ) : (
          <>
            <h1 id="profile-title" className="sr-only">
              Profile
            </h1>
            <label htmlFor="profile-name" className="sr-only">
              Your full name
            </label>
            <input
              id="profile-name"
              value={facts.person.name ?? ""}
              autoComplete="name"
              placeholder="Your full name"
              onChange={(e) =>
                edit((f) => ((f.person.name = e.target.value), f))
              }
              className={`${FIELD} -mx-2 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em]`}
            />
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-soft leading-normal">
            {view === "settings"
              ? "How jobs are found and how applications are sent. Changes save by themselves."
              : "Every CV, cover letter and job match is built only from this page. Keep each line true. Job rules, Gmail and the extension are in Settings."}
          </p>
          <p
            role="status"
            aria-live="polite"
            className="caption-style text-soft"
          >
            {state.kind === "error" ? "Not saved" : state.text}
          </p>
        </div>
        <p role="alert" className="text-danger empty:hidden">
          {state.kind === "error" ? state.text : ""}
        </p>
      </header>
      {top}

      {view === "profile" && (
        <>
          <div className="flex flex-col gap-1">
            {PERSON.filter((p) => !p.more).map((p) => (
              <Property key={p.key} label={p.label} type={p.type} autoComplete={p.autoComplete} hint={p.hint} value={facts.person[p.key] ?? ""} onChange={(v) => edit((f) => ((f.person[p.key] = v), f))} />
            ))}
            <details open={PERSON.some((p) => p.more && facts.person[p.key]?.trim())} className="pt-1">
              <summary className="focus-visible:ring-ring text-soft min-h-11 cursor-pointer content-center rounded px-2 text-[14px] font-medium outline-none focus-visible:ring-2">More about you (optional)</summary>
              <div className="flex flex-col gap-1 pt-2">
                {PERSON.filter((p) => p.more).map((p) => (
                  <Property key={p.key} label={p.label} type={p.type} autoComplete={p.autoComplete} hint={p.hint} value={facts.person[p.key] ?? ""} onChange={(v) => edit((f) => ((f.person[p.key] = v), f))} />
                ))}
              </div>
            </details>
          </div>
        </>
      )}

      {view === "settings" && (
        <>
          <Section
            id="applying"
            title="Sending applications"
            hint="Applications send from your own Gmail, at most 40 a day, inside the employer's work hours. Two follow-ups go 5 days apart, and stop when they reply."
          >
            <MailSection mail={mail} suggested={facts.person.email ?? ""} />
            <div className="border-line-strong flex flex-col gap-2 border-t pt-3">
              <label className="flex min-h-11 items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={prefs.ai === "on"}
                  onChange={(e) =>
                    editPrefs({ ai: e.target.checked ? "on" : "off" })
                  }
                  className="accent-primary size-5"
                  aria-describedby="profile-ai-hint"
                />
                Let AI write the &ldquo;why this company&rdquo; lines
              </label>
              <p
                id="profile-ai-hint"
                className="caption-style text-soft leading-normal"
              >
                {aiProvider}. Everything else in your CV and letter comes from
                this page by plain rules, at no cost. Turn this off to keep
                every application free.
              </p>
            </div>
            <div className="border-line-strong flex flex-col gap-2 border-t pt-3">
              <label className="flex min-h-11 items-center gap-2 text-[14px] font-medium">
                <input
                  type="checkbox"
                  checked={prefs.autoApply.on}
                  onChange={(e) =>
                    editPrefs({
                      autoApply: { ...prefs.autoApply, on: e.target.checked },
                    })
                  }
                  className="accent-primary size-5"
                  aria-describedby="profile-auto-hint"
                />
                Auto-apply to jobs that need nothing from me
              </label>
              <p
                id="profile-auto-hint"
                className="caption-style text-soft leading-normal"
              >
                Only strong fits you can apply to by email, with every ready
                check passing, no question in the post and no gap in the letter.
                Each one waits 2 hours in the Outbox, marked Auto-applied, so
                you can cancel it. Then it sends from your Gmail inside the
                employer&rsquo;s work hours. Jobs with a form are left for you.
              </p>
              {prefs.autoApply.on && (
                <div className="flex items-center gap-3 px-2">
                  <label htmlFor="profile-auto-per-day" className="text-[14px]">
                    Most a day
                  </label>
                  <select
                    id="profile-auto-per-day"
                    value={prefs.autoApply.perDay}
                    onChange={(e) =>
                      editPrefs({
                        autoApply: {
                          ...prefs.autoApply,
                          perDay: Number(e.target.value),
                        },
                      })
                    }
                    className="border-line-strong bg-secondary focus-visible:ring-ring h-11 rounded-lg border px-3 text-[15px] outline-none focus-visible:ring-2"
                  >
                    {[1, 3, 5, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </Section>
        </>
      )}

      {view === "settings" && (
        <>
          <Section
            id="find"
            title="Jobs to find"
            hint="The job finder uses these rules. Jobs that break them are hidden, and the reason is shown on the Jobs page."
          >
            <Property
              label="Lowest pay a month (USD)"
              type="number"
              value={String(prefs.minMonthlyUsd)}
              onChange={(v) =>
                editPrefs({ minMonthlyUsd: Math.max(0, Number(v) || 0) })
              }
              hint="Jobs that list pay under this are hidden. Jobs with no pay listed are kept."
            />
            <fieldset className="flex flex-col gap-1 px-2">
              <legend className="text-soft pb-1 text-[14px]">
                Where you can work
              </legend>
              <label className="flex min-h-11 items-center gap-3 text-[14px]">
                <input
                  type="checkbox"
                  checked={prefs.remoteOnly}
                  onChange={(e) => editPrefs({ remoteOnly: e.target.checked })}
                  className="accent-primary size-5"
                />
                Remote only, unless the job is in my city or offers a visa
              </label>
              <label className="flex min-h-11 items-center gap-3 text-[14px]">
                <input
                  type="checkbox"
                  checked={prefs.visa}
                  onChange={(e) => editPrefs({ visa: e.target.checked })}
                  className="accent-primary size-5"
                />
                Show jobs abroad that offer visa sponsorship or relocation
              </label>
            </fieldset>
            <Chips
              label="Your cities"
              items={prefs.cities}
              onChange={(cities) => editPrefs({ cities })}
              placeholderHint="Type a city, then press Enter. On-site jobs here are kept."
            />
            <h3 className="px-2 pt-2 font-medium">Job titles you want</h3>
            <p className="caption-style text-soft px-2 leading-normal">
              Like Virtual Assistant, Customer Support or Bookkeeper. When you add titles, only jobs with these titles (or other names for them) are shown, and they are what the boards search for, a few each day in turn. Leave empty to use your role types instead.
            </p>
            <Chips label="Job titles you want" items={prefs.titles} onChange={(titles) => editPrefs({ titles })} placeholderHint="Type a job title, then press Enter." />
            <h3 className="px-2 pt-2 font-medium">Search words</h3>
            <Chips
              label="Search words"
              items={prefs.searches}
              onChange={(searches) => editPrefs({ searches })}
              placeholderHint="Words sent to the job boards that take a search, such as accessibility or react."
            />
            <label className="flex min-h-11 items-start gap-3 px-2 text-[14px] leading-normal">
              <input
                type="checkbox"
                checked={prefs.wideSearch}
                onChange={(e) => editPrefs({ wideSearch: e.target.checked })}
                className="accent-primary mt-0.5 size-5 shrink-0"
              />
              <span>
                Also search the wider computer science roles:{" "}
                {WIDE_SEARCHES.join(", ")}
              </span>
            </label>
            <h3 className="px-2 pt-2 font-medium">Sites to skip</h3>
            <Chips
              label="Sites to skip"
              items={prefs.blockedSites}
              onChange={(blockedSites) => editPrefs({ blockedSites })}
              placeholderHint="Type a site such as example.com, then press Enter. Its jobs are hidden and it is never searched, for example sites that ask you to pay before you apply."
            />
            <fieldset className="flex flex-col gap-1 px-2 pt-2">
              <legend className="text-soft pb-1 text-[14px]">
                Job levels you want
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3">
                {LEVELS.map((l) => (
                  <label
                    key={l}
                    className="flex min-h-11 items-center gap-3 text-[14px]"
                  >
                    <input
                      type="checkbox"
                      checked={prefs.levels.includes(l)}
                      onChange={(e) => {
                        const levels = e.target.checked
                          ? [...prefs.levels, l]
                          : prefs.levels.filter((x) => x !== l);
                        if (levels.length) editPrefs({ levels });
                      }}
                      className="accent-primary size-5"
                    />
                    {LEVEL_LABEL[l]}
                  </label>
                ))}
              </div>
              <p className="text-soft text-[13px] leading-normal">
                Jobs at other levels are hidden, with the reason shown. Keep at
                least one ticked.
              </p>
            </fieldset>
            <fieldset className="flex flex-col gap-1 px-2 pt-2">
              <legend className="text-soft pb-1 text-[14px]">
                Job boards to search
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {sources.map((s) => (
                  <label
                    key={s.id}
                    className="flex min-h-11 items-center gap-3 text-[14px]"
                  >
                    <input
                      type="checkbox"
                      checked={prefs.sources.includes(
                        s.id as Preferences["sources"][number],
                      )}
                      onChange={(e) => {
                        const id = s.id as Preferences["sources"][number];
                        editPrefs(
                          e.target.checked
                            ? {
                                sources: [...prefs.sources, id],
                                sourcesOff: prefs.sourcesOff.filter(
                                  (x) => x !== id,
                                ),
                              }
                            : {
                                sources: prefs.sources.filter((x) => x !== id),
                                sourcesOff: [...prefs.sourcesOff, id],
                              },
                        );
                      }}
                      className="accent-primary size-5"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-11 items-center gap-3 px-2 pt-2 text-[14px]">
              <input
                type="checkbox"
                checked={prefs.bigCompanies}
                onChange={(e) => editPrefs({ bigCompanies: e.target.checked })}
                className="accent-primary size-5"
              />
              Also search big companies: Stripe, OpenAI, Cloudflare, GitLab,
              Figma, Notion and 19 more
            </label>
            <h3 className="px-2 pt-2 font-medium">Company career pages</h3>
            <p className="text-soft px-2 leading-normal">
              Add a company by the name in its careers link. For
              jobs.ashbyhq.com/<strong>linear</strong>, add{" "}
              <strong>linear</strong> under Ashby.
            </p>
            {(["greenhouse", "ashby", "lever"] as const).map((b) => (
              <div key={b} className="flex flex-col gap-1">
                <h4 className="text-soft px-2 pt-1 font-normal capitalize">
                  {b}
                </h4>
                <Chips
                  label={`${b} companies`}
                  items={prefs.boards[b]}
                  onChange={(list) =>
                    editPrefs({
                      boards: {
                        ...prefs.boards,
                        [b]: list.map((x) => x.toLowerCase()),
                      },
                    })
                  }
                  placeholderHint="Lower case, no spaces."
                />
              </div>
            ))}
          </Section>
        </>
      )}

      {view === "profile" && (
        <>
          <Section
            id="skills"
            title="Skills"
            hint="Skills you really have. Job posts are matched against these, and your CV lists them in the order the post asks."
          >
            {facts.skills.map((g, gi) => (
              <div key={g.group} className="flex flex-col gap-1">
                <h3 className="px-2 font-medium">{g.group}</h3>
                <Chips
                  label={`${g.group} skills`}
                  items={g.items.map((i) => i.label)}
                  onChange={(labels) =>
                    edit((f) => {
                      const old = f.skills[gi].items;
                      f.skills[gi].items = labels.map(
                        (label) =>
                          old.find((i) => i.label === label) ?? {
                            label,
                            aliases: [label.toLowerCase()],
                          },
                      );
                      return f;
                    })
                  }
                  placeholderHint="Type a skill, then press Enter. Separate several with commas."
                />
              </div>
            ))}
          </Section>
        </>
      )}

      {view === "profile" && (
        <>
          <Section
            id="gaps"
            title="Tools you have not used"
            hint="When a job post names one of these, you are warned and it never goes in your CV. Move a tool to Skills once you have used it."
          >
            <Chips
              label="Tools you have not used"
              items={facts.gaps}
              onChange={(gaps) =>
                edit((f) => ((f.gaps = gaps.map((g) => g.toLowerCase())), f))
              }
              placeholderHint="Type a tool, then press Enter."
            />
          </Section>
        </>
      )}

      {view === "profile" && (
        <>
          <Section
            id="experience"
            title="Experience"
            hint="Each line is a true result. Tags are the words that make a line relevant, so the best lines for each job go first."
          >
            {facts.jobs.map((job, ji) => (
              <div
                key={ji}
                className="border-line-strong flex flex-col gap-2 rounded-xl border p-3"
              >
                <Property
                  label="Organisation"
                  value={job.org}
                  onChange={(v) => edit((f) => ((f.jobs[ji].org = v), f))}
                />
                <Property
                  label="Dates"
                  value={job.dates}
                  onChange={(v) => edit((f) => ((f.jobs[ji].dates = v), f))}
                />
                {trackIds.map((t) => (
                  <Property
                    key={t}
                    label={`Title (${facts.tracks[t].label})`}
                    value={job.title[t] ?? ""}
                    onChange={(v) =>
                      edit((f) => ((f.jobs[ji].title[t] = v), f))
                    }
                  />
                ))}
                <h3 className="px-2 pt-2 font-medium">Results</h3>
                <ol className="flex flex-col gap-3">
                  {job.bullets.map((b, bi) => (
                    <li key={bi} className="flex flex-col gap-1">
                      <TextBlock
                        label={`Result ${bi + 1}`}
                        rows={2}
                        value={b.text}
                        onChange={(v) =>
                          edit((f) => ((f.jobs[ji].bullets[bi].text = v), f))
                        }
                      />
                      <Property
                        label="Tags"
                        value={b.tags.join(", ")}
                        onChange={(v) =>
                          edit(
                            (f) => (
                              (f.jobs[ji].bullets[bi].tags = v
                                .split(",")
                                .map((x) => x.trim().toLowerCase())
                                .filter(Boolean)),
                              f
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="md"
                        className="text-soft h-11 self-start px-3"
                        onClick={() =>
                          edit((f) => (f.jobs[ji].bullets.splice(bi, 1), f))
                        }
                      >
                        Remove result {bi + 1}
                      </Button>
                    </li>
                  ))}
                </ol>
                <Button
                  variant="secondary"
                  size="md"
                  className="h-11 self-start px-4"
                  onClick={() =>
                    edit(
                      (f) => (
                        f.jobs[ji].bullets.push({ text: "", tags: [] }),
                        f
                      ),
                    )
                  }
                >
                  Add a result
                </Button>
              </div>
            ))}
          </Section>
        </>
      )}

      {view === "profile" && (
        <>
          <Section
            id="proof"
            title="Proof of work"
            hint="Real work an employer can open and check. The best 2 or 3 for each job go into your email, your form answers and your follow-up. A link makes a claim believable, so add one wherever you can."
          >
            <ul className="flex flex-col gap-3">
              {(facts.work ?? []).map((w, wi) => (
                <li
                  key={wi}
                  className="flex flex-col gap-1 rounded-2xl bg-white/[0.035] p-3"
                >
                  <Property
                    label="Title"
                    value={w.title}
                    onChange={(v) => edit((f) => ((f.work[wi].title = v), f))}
                  />
                  <TextBlock
                    label="What you did"
                    rows={2}
                    value={w.what}
                    onChange={(v) => edit((f) => ((f.work[wi].what = v), f))}
                  />
                  <TextBlock
                    label="Result (a number if you have one)"
                    rows={2}
                    value={w.result}
                    onChange={(v) => edit((f) => ((f.work[wi].result = v), f))}
                  />
                  <Property
                    label="Link"
                    type="url"
                    value={w.url}
                    hint={
                      w.url
                        ? "Employers can open this."
                        : "No link yet. Add a live site, case study or repo starting with https://."
                    }
                    onChange={(v) =>
                      edit((f) => ((f.work[wi].url = v.trim()), f))
                    }
                  />
                  <Property
                    label="Tags"
                    value={w.tags.join(", ")}
                    hint="Words in a job post that make this relevant."
                    onChange={(v) =>
                      edit(
                        (f) => (
                          (f.work[wi].tags = v
                            .split(",")
                            .map((x) => x.trim().toLowerCase())
                            .filter(Boolean)),
                          f
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="md"
                    className="text-soft h-11 self-start px-3"
                    onClick={() => edit((f) => (f.work.splice(wi, 1), f))}
                  >
                    Remove {w.title || `proof ${wi + 1}`}
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size="md"
              className="h-11 self-start rounded-xl px-4"
              onClick={() =>
                edit(
                  (f) => (
                    (f.work = [
                      ...(f.work ?? []),
                      { title: "", what: "", result: "", url: "", tags: [] },
                    ]),
                    f
                  ),
                )
              }
            >
              Add proof of work
            </Button>
          </Section>
        </>
      )}

      {view === "profile" && (
        <>
          <Section
            id="answers"
            title="Saved answers"
            hint="Answers to questions forms ask again and again. Fill each once and the Chrome extension pastes it whenever a form asks. Words are what a form's question might say."
          >
            <ul className="flex flex-col gap-3">
              {(facts.answers ?? []).map((a, ai) => (
                <li
                  key={ai}
                  className="flex flex-col gap-1 rounded-2xl bg-white/[0.035] p-3"
                >
                  <Property
                    label="Question"
                    value={a.question}
                    onChange={(v) =>
                      edit((f) => ((f.answers[ai].question = v), f))
                    }
                  />
                  <TextBlock
                    label="Your answer"
                    rows={2}
                    value={a.answer}
                    hint={
                      a.answer
                        ? undefined
                        : "Empty. Forms that ask this will be listed for you to fill."
                    }
                    onChange={(v) =>
                      edit((f) => ((f.answers[ai].answer = v), f))
                    }
                  />
                  <Property
                    label="Words"
                    value={a.words.join(", ")}
                    onChange={(v) =>
                      edit(
                        (f) => (
                          (f.answers[ai].words = v
                            .split(",")
                            .map((x) => x.trim().toLowerCase())
                            .filter(Boolean)),
                          f
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="md"
                    className="text-soft h-11 self-start px-3"
                    onClick={() => edit((f) => (f.answers.splice(ai, 1), f))}
                  >
                    Remove the {a.question || `answer ${ai + 1}`} answer
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size="md"
              className="h-11 self-start rounded-xl px-4"
              onClick={() =>
                edit(
                  (f) => (
                    (f.answers = [
                      ...(f.answers ?? []),
                      { question: "", words: [], answer: "" },
                    ]),
                    f
                  ),
                )
              }
            >
              Add an answer
            </Button>
          </Section>
        </>
      )}

      {view === "settings" && (
        <>
          <Section
            id="extension"
            title="Chrome extension"
            hint="Press Apply on a job here and it opens the job, finds the form on any careers site and fills it from this page. It never presses Submit."
          >
            <ExtensionSection extension={extension} />
          </Section>
        </>
      )}

      {view === "profile" && (
        <>
          <Section
            id="tracks"
            title="Your CV summary"
            open={!Object.values(facts.tracks).some((tr) => tr.profile.trim())}
            hint="The short text at the top of your CV and the first lines of your letters. There is one for each kind of job, and each letter uses the one that fits the job."
          >
            {(() => {
              const order = prefs.titles.length ? ["general", ...trackIds.filter((t) => t !== "general")] : trackIds.filter((t) => t !== "general");
              const main = order.filter((t, i) => i === 0 || facts.tracks[t]?.profile.trim());
              const rest = order.filter((t) => !main.includes(t));
              const card = (t: string) => <TrackCard key={t} id={t} track={facts.tracks[t]} titles={prefs.titles} onEdit={edit} />;
              return (
                <>
                  {main.map(card)}
                  {rest.length > 0 && (
                    <details className="pt-1">
                      <summary className="focus-visible:ring-ring text-soft min-h-11 cursor-pointer content-center rounded px-2 text-[14px] font-medium outline-none focus-visible:ring-2">
                        More kinds of job ({rest.map((t) => facts.tracks[t]?.label).join(", ")})
                      </summary>
                      <div className="flex flex-col gap-3 pt-2">{rest.map(card)}</div>
                    </details>
                  )}
                </>
              );
            })()}
          </Section>
        </>
      )}

      {view === "profile" && (
        <>
          <Section id="more" title="Certifications and education" open={false}>
            <Lines
              label="Certifications"
              items={facts.certifications}
              onChange={(list) => edit((f) => ((f.certifications = list), f))}
            />
            <Property
              label="Degree"
              value={facts.education.degree}
              onChange={(v) => edit((f) => ((f.education.degree = v), f))}
            />
            <Property
              label="School"
              value={facts.education.school}
              onChange={(v) => edit((f) => ((f.education.school = v), f))}
            />
            <Property
              label="Dates"
              value={facts.education.dates}
              onChange={(v) => edit((f) => ((f.education.dates = v), f))}
            />
            <Lines
              label="Professional development"
              items={facts.development}
              onChange={(list) => edit((f) => ((f.development = list), f))}
            />
          </Section>
        </>
      )}
    </article>
  );
}

function TrackCard({ id, track, titles, onEdit }: { id: string; track: StoredFacts["tracks"][string]; titles: string[]; onEdit: (fn: (f: StoredFacts) => StoredFacts) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const name = id === "general" ? (titles.length ? `Your field: ${titles.slice(0, 3).join(", ")}` : "Your field") : track.label;

  async function write() {
    if (busy) return;
    setBusy(true);
    setProblem("");
    setNote("Writing it from your Profile…");
    const r = await writeSummary(id);
    setBusy(false);
    if (!r.ok) {
      setNote("");
      return setProblem(r.error);
    }
    onEdit((f) => ((f.tracks[id] = { ...f.tracks[id], profile: r.profile, hook: r.hook || f.tracks[id].hook, story: r.story || f.tracks[id].story }), f));
    setNote("Written from your Profile. Read it and change anything that does not sound like you.");
  }

  return (
    <div className="border-line-strong flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2">
        <h3 className="font-medium">{name}</h3>
        <Button variant={track.profile.trim() ? "ghost" : "secondary"} size="md" className="h-11 rounded-xl px-4" aria-disabled={busy} onClick={write}>
          {busy ? "Writing…" : track.profile.trim() ? "Write it again" : "Write it for me"}
          <span className="sr-only"> for {name}</span>
        </Button>
      </div>
      <p role="status" aria-live="polite" className="caption-style text-soft px-2 empty:hidden">
        {note}
      </p>
      {problem && (
        <p role="alert" className="text-danger px-2 text-[14px]">
          {problem}
        </p>
      )}
      <Property label="Headline under your name" value={track.title} hint="Usually the job title you want, like Virtual Assistant. Left empty, the job's own title is used." onChange={(v) => onEdit((f) => ((f.tracks[id].title = v), f))} />
      <TextBlock label="Summary at the top of your CV" rows={4} value={track.profile} hint="Two or three true sentences: who you are and your best result." onChange={(v) => onEdit((f) => ((f.tracks[id].profile = v), f))} />
      <TextBlock label="First line of your letters" rows={2} value={track.hook} hint="One sentence with your strongest true result, so the letter opens with proof." onChange={(v) => onEdit((f) => ((f.tracks[id].hook = v), f))} />
      <TextBlock label="A short true story for letters" rows={3} value={track.story} hint="One real example from your work and what came of it." onChange={(v) => onEdit((f) => ((f.tracks[id].story = v), f))} />
      {id !== "general" && (
        <details className="px-2">
          <summary className="focus-visible:ring-ring text-soft min-h-11 cursor-pointer content-center rounded text-[13px] outline-none focus-visible:ring-2">Advanced: which job titles count as this kind of job</summary>
          <TextBlock
            label="Job titles that count"
            rows={2}
            value={track.titleOk.split("|").join(", ")}
            hint="Separate with commas. Used only when you have not set the job titles you want in Settings."
            onChange={(v) =>
              onEdit(
                (f) => (
                  (f.tracks[id].titleOk = v
                    .split(",")
                    .map((w) => w.replace(/^\s+/, ""))
                    .filter((w) => w.trim())
                    .join("|")),
                  f
                ),
              )
            }
          />
        </details>
      )}
    </div>
  );
}
