// Open-source tools worth using alongside the CRM, checked against the install rules:
// stars, last commit, open issues, licence. Checked 26 October 2026; re-check before installing.

export type Tool = { name: string; repo: string; what: string; use: string; stars: string; updated: string; licence: string; issues: number; verdict: "yes" | "maybe" | "no"; why?: string };

export const STUDY: Tool = {
  name: "DeepTutor",
  repo: "HKUDS/DeepTutor",
  what: "Upload your books, notes and past papers. It answers questions on them, makes quizzes and explains hard topics.",
  use: "Interview prep from your own books, study for certificates, and research for scholarship essays.",
  stars: "43k",
  updated: "19 Oct 2026",
  licence: "Apache-2.0",
  issues: 206,
  verdict: "yes",
};

export const LABS: Tool[] = [
  {
    name: "LiteRT-LM",
    repo: "google-ai-edge/LiteRT-LM",
    what: "Google's engine for running small AI models on a phone or laptop, with no cloud bill.",
    use: "Later: reading job screenshots or checking writing on the phone for free, offline.",
    stars: "6.7k",
    updated: "26 Oct 2026",
    licence: "Apache-2.0",
    issues: 718,
    verdict: "maybe",
    why: "Useful once the CRM has a phone app. Many open issues, so test it on one feature first.",
  },
  {
    name: "Diagram Design",
    repo: "cathrynlavery/diagram-design",
    what: "44 clean diagram types as HTML and SVG for AI coding tools.",
    use: "Clearer charts on the Goals and progress pages, and diagrams for your portfolio case studies.",
    stars: "61k",
    updated: "26 Oct 2026",
    licence: "MIT",
    issues: 46,
    verdict: "maybe",
    why: "A design helper for building pages, not something job seekers use directly.",
  },
  {
    name: "Skills by Matt Pocock",
    repo: "mattpocock/skills",
    what: "Instructions that make AI coding tools work like an experienced engineer.",
    use: "Faster, cleaner work when building the CRM itself.",
    stars: "303k",
    updated: "22 Oct 2026",
    licence: "MIT",
    issues: 207,
    verdict: "maybe",
    why: "Helps the builder, not the job seeker.",
  },
  {
    name: "OpenScreen",
    repo: "siddharthvaddem/openscreen",
    what: "Free screen recorder with zooms and annotations, like Screen Studio.",
    use: "Short demo videos of your work for your portfolio.",
    stars: "40k",
    updated: "17 Oct 2026",
    licence: "MIT",
    issues: 47,
    verdict: "no",
    why: "The project is archived: it gets no more fixes. Use it only if it works for you as it is.",
  },
];

export const NOT_USED = [
  {
    name: "ds2api and free-claude-code",
    why: "They pass free web accounts off as an API. That breaks the providers' terms, and your keys and data pass through strangers' code. The CRM already uses a free AI provider the proper way.",
  },
  { name: "hackingtool", why: "A bundle of hacking tools. It has nothing to do with jobs or scholarships." },
  { name: "rea", why: "It takes apps apart to see how they work. Only allowed on apps you own or have permission for, so it can't be used to copy Notion." },
];
