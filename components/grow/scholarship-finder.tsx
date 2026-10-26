"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/_ui/sheet";
import { dismissLead, findScholarshipsNow, saveScholarshipPrefs, startApplication, trackLead } from "@/app/(crm)/grow-actions";
import { DOC_LABEL, type DocKind } from "@/lib/grow/documents";
import { dueText } from "@/lib/grow/grow";
import { LEVEL_CHOICES, type ScholarshipPrefs } from "@/lib/scholarships/fit";

export type FoundItem = {
  id: string;
  title: string;
  url: string;
  place: string | null;
  eligible: string | null;
  level: string | null;
  benefits: string[];
  needs: DocKind[];
  deadline: string | null;
  deadline_text: string | null;
  source: string;
  fully_funded: boolean;
  summary: string | null;
  tracked_id: string | null;
  score: number;
  band: "strong" | "good" | "maybe";
  hidden: string | null;
  reasons: string[];
};

const BAND = { strong: { label: "Strong", tone: "green" }, good: { label: "Good", tone: "blue" }, maybe: { label: "Maybe", tone: "neutral" } } as const;
const CONTROL = "h-11 rounded-lg border border-line-strong bg-secondary px-3 text-[15px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

export default function ScholarshipFinder({
  items,
  have,
  prefs,
  sources,
  now,
  lastFound,
}: {
  items: FoundItem[];
  have: DocKind[];
  prefs: ScholarshipPrefs;
  sources: Record<string, string>;
  now: string;
  lastFound: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  const [searching, startSearch] = useTransition();

  const hiddenCount = items.filter((i) => i.hidden).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) => (showHidden || !i.hidden) && (!fit || (fit === "strong" ? i.band === "strong" : i.band !== "maybe")) && (!q || `${i.title} ${i.place ?? ""} ${i.level ?? ""}`.toLowerCase().includes(q)),
    );
  }, [items, query, fit, showHidden]);
  const open = items.find((i) => i.id === openId) ?? null;

  function search() {
    if (searching) return;
    startSearch(async () => {
      setAlert("");
      setStatus("Searching four scholarship sites… this takes up to a minute.");
      const r = await findScholarshipsNow();
      if (!r.ok) {
        setStatus("");
        setAlert(r.error);
        return;
      }
      setStatus(`${r.added ? `${r.added} new scholarships found.` : "No new scholarships since the last search."}${r.errors.length ? ` Some sites did not answer: ${r.errors.join("; ")}.` : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-soft text-[14px]">
          {lastFound
            ? `Newest find: ${new Date(lastFound).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. It also searches every morning.`
            : "It searches every morning. Press the button to search now."}
        </p>
        <Button variant="primary" size="md" className="h-11 px-4" onClick={search} aria-disabled={searching}>
          {searching ? "Searching…" : "Find scholarships now"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-soft min-h-5 empty:hidden">
        {status}
      </p>
      {alert && (
        <p role="alert" className="text-danger">
          {alert}
        </p>
      )}

      <Prefs prefs={prefs} />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-q`} className="caption-style text-soft">
            Search by name, country or level
          </label>
          <input id={`${id}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={`${CONTROL} w-full`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-fit`} className="caption-style text-soft">
            Fit
          </label>
          <select id={`${id}-fit`} value={fit} onChange={(e) => setFit(e.target.value)} className={CONTROL}>
            <option value="">All fits</option>
            <option value="good">Strong and good</option>
            <option value="strong">Strong only</option>
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-primary size-5" />
          Show hidden ({hiddenCount})
        </label>
      </div>

      <h2 className="caption-style text-soft font-normal" aria-live="polite">
        {shown.length} scholarship{shown.length === 1 ? "" : "s"}, best fit first
      </h2>
      {shown.length === 0 ? (
        <p className="text-soft rounded-2xl bg-white/[0.04] p-5 leading-normal">
          {items.length ? "Nothing matches these filters." : "No scholarships yet. Press Find scholarships now, or import a WhatsApp group on the Add tab."}
        </p>
      ) : (
        <div className="border-line-strong overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[46em] border-collapse text-left text-[14px]">
            <caption className="sr-only">Scholarships that fit you, best fit first. Select a name to see details.</caption>
            <thead className="text-soft caption-style">
              <tr className="border-line-strong border-b">
                <th scope="col" className="w-24 px-4 py-3 font-normal">
                  Fit
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  Scholarship
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  Deadline
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  Documents
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const ready = i.needs.filter((k) => have.includes(k)).length;
                return (
                  <tr key={i.id} className="border-line-strong border-b last:border-b-0 hover:bg-white/3">
                    <td className="px-4 py-3 align-top">
                      <Tag tone={BAND[i.band].tone} size="sm">
                        {BAND[i.band].label}
                      </Tag>
                      <span className="sr-only">, {i.score} out of 100</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => setOpenId(i.id)}
                        className="focus-visible:ring-ring -mx-1 -my-0.5 rounded-md px-1 py-0.5 text-left font-medium break-words outline-none hover:underline focus-visible:ring-2"
                      >
                        {i.title}
                      </button>
                      <div className="text-soft caption-style mt-1 break-words">
                        {[i.place, i.level, i.fully_funded && "Fully funded"].filter(Boolean).join(" · ")} · via {sources[i.source] ?? i.source}
                        {i.tracked_id && (
                          <>
                            {" "}
                            · <span className="text-foreground">Tracking</span>
                          </>
                        )}
                      </div>
                      {i.hidden && <div className="caption-style mt-1 text-(--tag-amber-text)">Hidden: {i.hidden}</div>}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap tabular-nums">{i.deadline ? dueText(i.deadline, new Date(now)) : i.deadline_text || "Not given"}</td>
                    <td className="px-4 py-3 align-top tabular-nums">{i.needs.length ? `${ready} of ${i.needs.length} ready` : "Not listed"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent
          side="right"
          className="bg-background/92 contrast-more:bg-background [@media(prefers-reduced-transparency:reduce)]:bg-background max-w-[40em] supports-[backdrop-filter]:backdrop-blur-xl motion-reduce:animate-none [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none"
          aria-describedby={open ? "sch-peek-where" : undefined}
        >
          {open && <Peek key={open.id} i={open} have={have} source={sources[open.source] ?? open.source} now={now} onDone={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Peek({ i, have, source, now, onDone }: { i: FoundItem; have: DocKind[]; source: string; now: string; onDone: () => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, close = false) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? ok : (r.error ?? "Not saved."));
      if (r.ok) {
        router.refresh();
        if (close) onDone();
      }
    });
  const missing = i.needs.filter((k) => !have.includes(k));
  const rows: [string, string][] = [
    ["Where", i.place || "Not given"],
    ["Who can apply", i.eligible || "Check the page"],
    ["Level", i.level || "Not given"],
    ["Funding", i.fully_funded ? "Fully funded" : i.benefits[0] || "Check the page"],
    [
      "Deadline",
      i.deadline
        ? `${new Date(`${i.deadline}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} (${dueText(i.deadline, new Date(now)).toLowerCase()})`
        : i.deadline_text || "Not given",
    ],
  ];
  return (
    <>
      <SheetHeader className="h-auto min-h-14 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <SheetTitle className="text-[18px] leading-tight font-semibold tracking-[-0.01em] break-words">{i.title}</SheetTitle>
          <SheetDescription id="sch-peek-where" className="text-soft">
            via {source}
          </SheetDescription>
        </div>
      </SheetHeader>
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={BAND[i.band].tone} size="md">
            {BAND[i.band].label} fit
          </Tag>
          <span className="text-soft text-[14px] tabular-nums">{i.score} out of 100</span>
        </div>
        {i.hidden && <p className="rounded-xl bg-(--tag-amber-bg) px-3 py-2 text-[14px] text-(--tag-amber-text)">Hidden because it is {i.hidden}.</p>}
        {i.reasons.length > 0 && (
          <ul aria-label="Why it fits" className="flex list-disc flex-col gap-1 pl-5 text-[14px]">
            {i.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-soft">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {i.benefits.length > 1 && (
          <section aria-labelledby="sch-benefits" className="flex flex-col gap-1">
            <h3 id="sch-benefits" className="font-semibold">
              What it gives
            </h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px]">
              {i.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="sch-docs" className="flex flex-col gap-2">
          <h3 id="sch-docs" className="font-semibold">
            Documents it asks for
          </h3>
          {i.needs.length ? (
            <ul className="flex flex-col gap-1 text-[14px]">
              {i.needs.map((k) => (
                <li key={k} className="flex flex-wrap items-center gap-2">
                  <span className={have.includes(k) ? "text-success font-medium" : "font-medium text-(--tag-amber-text)"}>{have.includes(k) ? "Ready" : "Missing"}</span>
                  <span>{DOC_LABEL[k]}</span>
                  {!have.includes(k) && (
                    <a href={`/documents?need=${k}`} className="underline underline-offset-2">
                      Upload<span className="sr-only"> your {DOC_LABEL[k].toLowerCase()}</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-soft text-[14px]">The listing names none. Most ask for your passport, transcript, CV and two recommendation letters.</p>
          )}
          {missing.length > 1 && (
            <a href={`/documents?need=${missing[0]}`} className="self-start text-[14px] underline underline-offset-2">
              Open Documents to upload the {missing.length} missing
            </a>
          )}
        </section>
        {i.summary && <p className="text-soft text-[14px] leading-relaxed break-words">{i.summary}</p>}
        <div className="flex flex-wrap gap-2">
          <a
            href={i.url}
            target="_blank"
            rel="noopener"
            className="bg-secondary focus-visible:ring-ring border-line-strong inline-flex h-11 items-center rounded-xl border px-4 text-[15px] outline-none focus-visible:ring-2"
          >
            Open the listing<span className="sr-only"> (opens in a new tab)</span>
          </a>
          {i.tracked_id ? (
            <a href="/scholarships?view=tracking" className="inline-flex h-11 items-center px-2 text-[15px] underline underline-offset-2">
              Tracking it: see your checklist
            </a>
          ) : (
            <>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="h-11 rounded-xl px-4"
                aria-disabled={pending}
                onClick={() => !pending && run(() => startApplication({ leadId: i.id }), "Application started. Your checklist and a statement draft are on the Tracking tab.")}
              >
                Start my application
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="h-11 rounded-xl px-4"
                aria-disabled={pending}
                onClick={() => !pending && run(() => trackLead(i.id), "Added to Tracking, with a checklist.")}
              >
                Only track it
              </Button>
            </>
          )}
          {!i.tracked_id && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="text-soft h-11 px-3"
              aria-disabled={pending}
              onClick={() => !pending && run(() => dismissLead(i.id), "Hidden from your list.", true)}
            >
              Not for me
            </Button>
          )}
        </div>
        <p className="text-soft text-[13px] leading-normal">The listing site links to the official page. Always apply on the official site, and never pay a fee to apply.</p>
        <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
          {msg}
        </p>
      </div>
    </>
  );
}

// What you are looking for. Changing it re-scores every scholarship at once.
function Prefs({ prefs }: { prefs: ScholarshipPrefs }) {
  const id = useId();
  const router = useRouter();
  const [levels, setLevels] = useState(prefs.levels);
  const [funded, setFunded] = useState(prefs.fundedOnly);
  const [places, setPlaces] = useState(prefs.places.join(", "));
  const [country, setCountry] = useState(prefs.country);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const r = await saveScholarshipPrefs({ levels, fundedOnly: funded, places, country });
      setMsg(r.ok ? "Saved. Every scholarship is scored again." : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <details className="group rounded-2xl bg-white/[0.04]">
      <summary className="focus-visible:ring-ring flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl px-5 outline-none focus-visible:ring-2">
        <span>
          <span className="font-medium">What you&rsquo;re looking for:</span>{" "}
          <span className="text-soft">
            {levels.length ? levels.join(", ") : "any level"}
            {funded ? ", fully funded only" : ""}
            {prefs.places.length ? `, in ${prefs.places.join(", ")}` : ""}
          </span>
        </span>
        <span aria-hidden className="text-soft transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-5 pb-5">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[15px] font-medium">Levels</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {LEVEL_CHOICES.map((l) => (
              <label key={l} className="flex min-h-11 items-center gap-3 text-[15px]">
                <input type="checkbox" checked={levels.includes(l)} onChange={(e) => setLevels((x) => (e.target.checked ? [...x, l] : x.filter((y) => y !== l)))} className="accent-primary size-5" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" checked={funded} onChange={(e) => setFunded(e.target.checked)} className="accent-primary size-5" />
          Fully funded only
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-places`} className="text-[15px] font-medium">
              Places you want to study
            </label>
            <input id={`${id}-places`} value={places} onChange={(e) => setPlaces(e.target.value)} placeholder="UK, Germany, Canada" aria-describedby={`${id}-places-hint`} className={CONTROL} />
            <p id={`${id}-places-hint`} className="text-soft text-[13px]">
              Separate with commas. Leave empty for anywhere.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-country`} className="text-[15px] font-medium">
              Your nationality
            </label>
            <input id={`${id}-country`} value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" className={CONTROL} />
          </div>
        </div>
        <Button type="button" variant="secondary" size="md" className="h-11 self-start rounded-xl px-4" aria-disabled={pending} onClick={() => !pending && save()}>
          {pending ? "Saving…" : "Save and re-score"}
        </Button>
        <p role="status" aria-live="polite" className="text-soft text-[14px] empty:hidden">
          {msg}
        </p>
      </div>
    </details>
  );
}
