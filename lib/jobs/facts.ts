export type Track = { label: string; title: string; titleOk: RegExp; words: string[]; profile: string; hook: string; story: string };
export type Facts = {
  person: Record<string, string>;
  tracks: Record<string, Track>;
  skills: { group: string; items: { label: string; aliases: string[] }[] }[];
  proofs: Record<string, string>;
  gaps: string[];
  jobs: { title: Record<string, string>; dates: string; org: string; max: number; bullets: { text: string; tags: string[] }[] }[];
  projects: { text: string; tracks: string[] }[];
  certifications: string[];
  education: { degree: string; dates: string; school: string };
  development: string[];
  services: unknown[];
};

type StoredTrack = Omit<Track, "titleOk"> & { titleOk: string };
export type StoredFacts = Omit<Facts, "tracks"> & { tracks: Record<string, StoredTrack> };

export function storeFacts(facts: Facts): StoredFacts {
  const tracks: Record<string, StoredTrack> = {};
  for (const [id, t] of Object.entries(facts.tracks)) tracks[id] = { ...t, titleOk: t.titleOk.source };
  return { ...structuredClone({ ...facts, tracks: {} }), tracks };
}

function safeRegex(source: string): RegExp {
  try {
    return new RegExp(source, "i");
  } catch {
    return /$^/;
  }
}

export function hydrateFacts(stored: StoredFacts): Facts {
  const tracks: Record<string, Track> = {};
  for (const [id, t] of Object.entries(stored.tracks)) tracks[id] = { ...t, titleOk: safeRegex(String(t.titleOk ?? "")) };
  return { ...stored, tracks };
}

export function blankFacts(seed: Facts): Facts {
  const tracks: Record<string, Track> = {};
  for (const [id, t] of Object.entries(seed.tracks)) tracks[id] = { ...t, profile: "", hook: "", story: "" };
  const person = Object.fromEntries(Object.keys(seed.person).map((k) => [k, ""]));
  return { ...seed, person, tracks, skills: seed.skills.map((g) => ({ group: g.group, items: [] })), proofs: {}, jobs: [], projects: [], certifications: [], education: { degree: "", dates: "", school: "" }, development: [] };
}

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const strs = (v: unknown, max: number, each: number) => (Array.isArray(v) ? v : []).map((x) => str(x, each).trim()).filter(Boolean).slice(0, max);

export function cleanFacts(input: unknown, base: StoredFacts): StoredFacts {
  const f = (input ?? {}) as Partial<StoredFacts>;
  const person: Record<string, string> = {};
  for (const k of Object.keys(base.person)) person[k] = str(f.person?.[k] ?? base.person[k], 300).trim();

  const tracks: StoredFacts["tracks"] = {};
  for (const [id, t] of Object.entries(base.tracks)) {
    const n = (f.tracks?.[id] ?? {}) as Partial<StoredFacts["tracks"][string]>;
    const titleOk = String(n.titleOk ?? t.titleOk)
      .split("|")
      .map((w) => w.replace(/[\\^$.*+?()[\]{}]/g, "").replace(/^\s+/, "").replace(/\s+/g, " ").slice(0, 60))
      .filter((w) => w.trim())
      .slice(0, 40)
      .join("|");
    tracks[id] = { ...t, title: str(n.title ?? t.title, 200), titleOk: titleOk || t.titleOk, profile: str(n.profile ?? t.profile, 1500), hook: str(n.hook ?? t.hook, 600), story: str(n.story ?? t.story, 900) };
  }

  const skills = (Array.isArray(f.skills) ? f.skills : base.skills).slice(0, 12).map((g) => ({
    group: str(g?.group, 60) || "Skills",
    items: (Array.isArray(g?.items) ? g.items : []).slice(0, 60).map((it) => {
      const label = str(it?.label, 60).trim();
      const aliases = strs(it?.aliases, 12, 60).map((a) => a.toLowerCase());
      return { label, aliases: aliases.length ? aliases : [label.toLowerCase()] };
    }).filter((it) => it.label),
  }));

  const jobs = (Array.isArray(f.jobs) ? f.jobs : base.jobs).slice(0, 10).map((j) => {
    const title: Record<string, string> = {};
    for (const id of Object.keys(base.tracks)) title[id] = str(j?.title?.[id] ?? Object.values(j?.title ?? {})[0], 120);
    return {
      title,
      dates: str(j?.dates, 40),
      org: str(j?.org, 200),
      max: Math.min(Math.max(Number(j?.max) || 3, 1), 8),
      bullets: (Array.isArray(j?.bullets) ? j.bullets : []).slice(0, 15).map((b) => ({ text: str(b?.text, 400).trim(), tags: strs(b?.tags, 20, 40).map((t) => t.toLowerCase()) })).filter((b) => b.text),
    };
  });

  return {
    ...base,
    person,
    tracks,
    skills,
    gaps: strs(f.gaps ?? base.gaps, 80, 40).map((g) => g.toLowerCase()),
    jobs,
    projects: (Array.isArray(f.projects) ? f.projects : base.projects).slice(0, 12).map((p) => ({ text: str(p?.text, 300), tracks: strs(p?.tracks, 3, 30) })).filter((p) => p.text),
    certifications: strs(f.certifications ?? base.certifications, 12, 300),
    education: { degree: str(f.education?.degree ?? base.education.degree, 120), dates: str(f.education?.dates ?? base.education.dates, 40), school: str(f.education?.school ?? base.education.school, 160) },
    development: strs(f.development ?? base.development, 12, 300),
  };
}
