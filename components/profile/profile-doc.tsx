"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/_ui/button";
import { saveProfile } from "@/app/(crm)/profile/actions";
import type { StoredFacts } from "@/lib/jobs/facts";
import type { Preferences } from "@/lib/jobs/preferences";
import { Chips, FIELD, Lines, Property, Section, TextBlock } from "./editors";

type Props = { facts: StoredFacts; preferences: Preferences; updatedAt: string; sources: { id: string; name: string }[] };

const PERSON: { key: string; label: string; type?: string; autoComplete?: string }[] = [
  { key: "brand", label: "Known as" },
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { key: "location", label: "Location", autoComplete: "address-level2" },
  { key: "remote", label: "Remote note" },
  { key: "linkedin", label: "LinkedIn", type: "url", autoComplete: "url" },
  { key: "portfolio", label: "Portfolio", type: "url", autoComplete: "url" },
  { key: "behance", label: "Behance", type: "url" },
  { key: "cpacc", label: "Certificate line" },
  { key: "business", label: "Business" },
];

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function ProfileDoc({ facts: initialFacts, preferences: initialPrefs, updatedAt, sources }: Props) {
  const [facts, setFacts] = useState(initialFacts);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text: string }>({ kind: "idle", text: `Saved at ${time(updatedAt)}` });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ facts: StoredFacts; preferences: Preferences } | null>(null);

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
      setState(r.ok ? { kind: "saved", text: `Saved at ${time(r.savedAt)}` } : { kind: "error", text: r.error });
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
          onChange={(e) => edit((f) => ((f.person.name = e.target.value), f))}
          className={`${FIELD} -mx-2 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em]`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-soft leading-normal">Every CV, cover letter and job match is built only from this page. Keep each line true.</p>
          <p role="status" aria-live="polite" className="caption-style text-soft">
            {state.kind === "error" ? "Not saved" : state.text}
          </p>
        </div>
        <p role="alert" className="text-danger empty:hidden">
          {state.kind === "error" ? state.text : ""}
        </p>
      </header>

      <div className="flex flex-col gap-1">
        {PERSON.filter((p) => p.key in facts.person).map((p) => (
          <Property key={p.key} label={p.label} type={p.type} autoComplete={p.autoComplete} value={facts.person[p.key] ?? ""} onChange={(v) => edit((f) => ((f.person[p.key] = v), f))} />
        ))}
      </div>

      <Section id="find" title="Jobs to find" hint="The job finder uses these rules. Jobs that break them are hidden, and the reason is shown on the Jobs page.">
        <Property
          label="Lowest pay a month (USD)"
          type="number"
          value={String(prefs.minMonthlyUsd)}
          onChange={(v) => editPrefs({ minMonthlyUsd: Math.max(0, Number(v) || 0) })}
          hint="Jobs that list pay under this are hidden. Jobs with no pay listed are kept."
        />
        <fieldset className="flex flex-col gap-1 px-2">
          <legend className="text-soft pb-1 text-[14px]">Where you can work</legend>
          <label className="flex min-h-11 items-center gap-3 text-[14px]">
            <input type="checkbox" checked={prefs.remoteOnly} onChange={(e) => editPrefs({ remoteOnly: e.target.checked })} className="accent-primary size-5" />
            Remote only, unless the job is in my city or offers a visa
          </label>
          <label className="flex min-h-11 items-center gap-3 text-[14px]">
            <input type="checkbox" checked={prefs.visa} onChange={(e) => editPrefs({ visa: e.target.checked })} className="accent-primary size-5" />
            Show jobs abroad that offer visa sponsorship or relocation
          </label>
        </fieldset>
        <Chips label="Your cities" items={prefs.cities} onChange={(cities) => editPrefs({ cities })} placeholderHint="Type a city, then press Enter. On-site jobs here are kept." />
        <h3 className="px-2 pt-2 font-medium">Search words</h3>
        <Chips label="Search words" items={prefs.searches} onChange={(searches) => editPrefs({ searches })} placeholderHint="Words sent to Himalayas and Jobicy, such as accessibility or react." />
        <fieldset className="flex flex-col gap-1 px-2 pt-2">
          <legend className="text-soft pb-1 text-[14px]">Job boards to search</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {sources.map((s) => (
              <label key={s.id} className="flex min-h-11 items-center gap-3 text-[14px]">
                <input
                  type="checkbox"
                  checked={prefs.sources.includes(s.id as Preferences["sources"][number])}
                  onChange={(e) => {
                    const id = s.id as Preferences["sources"][number];
                    editPrefs({ sources: e.target.checked ? [...prefs.sources, id] : prefs.sources.filter((x) => x !== id) });
                  }}
                  className="accent-primary size-5"
                />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
        <h3 className="px-2 pt-2 font-medium">Company career pages</h3>
        <p className="text-soft px-2 leading-normal">
          Add a company by the name in its careers link. For jobs.ashbyhq.com/<strong>linear</strong>, add <strong>linear</strong> under Ashby.
        </p>
        {(["greenhouse", "ashby", "lever"] as const).map((b) => (
          <div key={b} className="flex flex-col gap-1">
            <h4 className="text-soft px-2 pt-1 font-normal capitalize">{b}</h4>
            <Chips label={`${b} companies`} items={prefs.boards[b]} onChange={(list) => editPrefs({ boards: { ...prefs.boards, [b]: list.map((x) => x.toLowerCase()) } })} placeholderHint="Lower case, no spaces." />
          </div>
        ))}
      </Section>

      <Section id="skills" title="Skills" hint="Skills you really have. Job posts are matched against these, and your CV lists them in the order the post asks.">
        {facts.skills.map((g, gi) => (
          <div key={g.group} className="flex flex-col gap-1">
            <h3 className="px-2 font-medium">{g.group}</h3>
            <Chips
              label={`${g.group} skills`}
              items={g.items.map((i) => i.label)}
              onChange={(labels) =>
                edit((f) => {
                  const old = f.skills[gi].items;
                  f.skills[gi].items = labels.map((label) => old.find((i) => i.label === label) ?? { label, aliases: [label.toLowerCase()] });
                  return f;
                })
              }
              placeholderHint="Type a skill, then press Enter. Separate several with commas."
            />
          </div>
        ))}
      </Section>

      <Section id="gaps" title="Tools you have not used" hint="When a job post names one of these, you are warned and it never goes in your CV. Move a tool to Skills once you have used it.">
        <Chips label="Tools you have not used" items={facts.gaps} onChange={(gaps) => edit((f) => ((f.gaps = gaps.map((g) => g.toLowerCase())), f))} placeholderHint="Type a tool, then press Enter." />
      </Section>

      <Section id="experience" title="Experience" hint="Each line is a true result. Tags are the words that make a line relevant, so the best lines for each job go first.">
        {facts.jobs.map((job, ji) => (
          <div key={ji} className="border-line-strong flex flex-col gap-2 rounded-xl border p-3">
            <Property label="Organisation" value={job.org} onChange={(v) => edit((f) => ((f.jobs[ji].org = v), f))} />
            <Property label="Dates" value={job.dates} onChange={(v) => edit((f) => ((f.jobs[ji].dates = v), f))} />
            {trackIds.map((t) => (
              <Property key={t} label={`Title (${facts.tracks[t].label})`} value={job.title[t] ?? ""} onChange={(v) => edit((f) => ((f.jobs[ji].title[t] = v), f))} />
            ))}
            <h3 className="px-2 pt-2 font-medium">Results</h3>
            <ol className="flex flex-col gap-3">
              {job.bullets.map((b, bi) => (
                <li key={bi} className="flex flex-col gap-1">
                  <TextBlock label={`Result ${bi + 1}`} rows={2} value={b.text} onChange={(v) => edit((f) => ((f.jobs[ji].bullets[bi].text = v), f))} />
                  <Property
                    label="Tags"
                    value={b.tags.join(", ")}
                    onChange={(v) => edit((f) => ((f.jobs[ji].bullets[bi].tags = v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)), f))}
                  />
                  <Button variant="ghost" size="md" className="text-soft h-11 self-start px-3" onClick={() => edit((f) => (f.jobs[ji].bullets.splice(bi, 1), f))}>
                    Remove result {bi + 1}
                  </Button>
                </li>
              ))}
            </ol>
            <Button variant="secondary" size="md" className="h-11 self-start px-4" onClick={() => edit((f) => (f.jobs[ji].bullets.push({ text: "", tags: [] }), f))}>
              Add a result
            </Button>
          </div>
        ))}
      </Section>

      <Section id="tracks" title="Role types" open={false} hint="Each role type has its own profile text for the CV and cover letter. Job titles that count decide which jobs are in your field.">
        {trackIds.map((t) => {
          const track = facts.tracks[t];
          return (
            <div key={t} className="border-line-strong flex flex-col gap-2 rounded-xl border p-3">
              <h3 className="px-2 font-medium">{track.label}</h3>
              <Property label="CV headline" value={track.title} onChange={(v) => edit((f) => ((f.tracks[t].title = v), f))} />
              <TextBlock
                label="Job titles that count"
                rows={2}
                value={track.titleOk.split("|").join(", ")}
                hint="Separate with commas. A job is in your field when its title starts a word with one of these."
                onChange={(v) => edit((f) => ((f.tracks[t].titleOk = v.split(",").map((w) => w.replace(/^\s+/, "")).filter((w) => w.trim()).join("|")), f))}
              />
              <TextBlock label="CV profile" rows={4} value={track.profile} onChange={(v) => edit((f) => ((f.tracks[t].profile = v), f))} />
              <TextBlock label="Cover letter opening" rows={2} value={track.hook} onChange={(v) => edit((f) => ((f.tracks[t].hook = v), f))} />
              <TextBlock label="Cover letter story" rows={3} value={track.story} onChange={(v) => edit((f) => ((f.tracks[t].story = v), f))} />
            </div>
          );
        })}
      </Section>

      <Section id="more" title="Certifications and education" open={false}>
        <Lines label="Certifications" items={facts.certifications} onChange={(list) => edit((f) => ((f.certifications = list), f))} />
        <Property label="Degree" value={facts.education.degree} onChange={(v) => edit((f) => ((f.education.degree = v), f))} />
        <Property label="School" value={facts.education.school} onChange={(v) => edit((f) => ((f.education.school = v), f))} />
        <Property label="Dates" value={facts.education.dates} onChange={(v) => edit((f) => ((f.education.dates = v), f))} />
        <Lines label="Professional development" items={facts.development} onChange={(list) => edit((f) => ((f.development = list), f))} />
      </Section>
    </article>
  );
}
