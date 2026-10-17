// The Apply engine: reads a job post and builds a CV, cover letter or
// proposal from facts.js. Plain matching rules, no AI, so it costs nothing
// to run. Works in the browser page and in Node.

(function (root) {
  // ---------- matching ----------

  const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

  // Finds a whole word or phrase, so "ada" never matches "Canada".
  function find(lower, term) {
    const re = new RegExp("(^|[^a-z0-9])(" + esc(term.toLowerCase()) + ")(?![a-z0-9])");
    const m = re.exec(lower);
    return m ? m.index + m[1].length : -1;
  }

  function countHits(lower, words) {
    return words.reduce((n, w) => n + (find(lower, w) >= 0 ? 1 : 0), 0);
  }

  function analyze(jd, facts) {
    const lower = jd.toLowerCase();

    const scores = {};
    for (const [id, t] of Object.entries(facts.tracks)) scores[id] = countHits(lower, t.words);
    const track = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];

    // Each skill you have that the post asks for, with the post's own wording.
    const matched = [];
    for (const g of facts.skills) {
      for (const item of g.items) {
        for (const alias of [item.label, ...item.aliases]) {
          const at = find(lower, alias);
          if (at >= 0) {
            matched.push({ label: item.label, group: g.group, said: jd.slice(at, at + alias.length), at });
            break;
          }
        }
      }
    }
    matched.sort((a, b) => a.at - b.at);

    const gaps = facts.gaps.filter(g => find(lower, g) >= 0);
    const namesGap = line => gaps.some(g => find(line.toLowerCase(), g) >= 0);

    // Bullet and numbered lines are usually the requirements. A brief written
    // as paragraphs falls back to its "we need" / "we want" sentences.
    const bullets = jd.split(/\n/)
      .map(l => l.trim())
      .filter(l => /^([-*•●▪◦]|\d+[.)])\s+/.test(l))
      .map(l => l.replace(/^([-*•●▪◦]|\d+[.)])\s+/, "").trim())
      .filter(l => l.length >= 12 && l.length <= 220);
    const requirements = bullets.length ? bullets : jd.split(/(?<=[.!?])\s+|\n/)
      .map(l => l.trim())
      .filter(l => /\b(we need|we want|we're looking|we are looking|looking for|must|need to|want to|you will|responsible for)\b/i.test(l))
      .map(l => l.replace(/^(we|and)\s+(also\s+)?(need|want)\s+(to\s+)?/i, "").replace(/^./, c => c.toUpperCase()).replace(/[.!]$/, ""))
      .filter(l => l.length >= 12 && l.length <= 220);
    // A brief line naming a tool you lack is left out of the proposal, so it never reads as a promise.
    const skipped = requirements.filter(namesGap);
    const promised = requirements.filter(l => !namesGap(l)).slice(0, 10);

    const contractWords = ["contract", "contractor", "freelance", "freelancer", "proposal", "rfp", "request for proposal",
      "scope of work", "statement of work", "quote", "budget", "fixed price", "fixed-price", "hourly rate", "deliverables", "upwork", "project-based"];
    const contract = countHits(lower, contractWords) >= 2;

    // Up to 6 services the brief asks for, listed in the order the work happens.
    const services = facts.services
      .map((s, i) => ({ s, i, hits: s.words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0) }))
      .filter(x => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 6)
      .sort((a, b) => a.i - b.i)
      .map(x => x.s);

    const naira = /₦|\bnaira\b|\bngn\b|nigeria|abuja|lagos|port harcourt|ibadan/.test(lower) && !/\$|\busd\b/.test(lower);

    return { track, scores, matched, gaps, requirements: promised, skipped, contract, services, currency: naira ? "ngn" : "usd",
      guess: guessNames(jd) };
  }

  function guessNames(jd) {
    const first = jd.split(/\n/).map(l => l.trim()).find(l => l.length > 2) || "";
    const role = first.length <= 80 ? first.replace(/^(job title|role|position)\s*[:-]\s*/i, "") : "";
    const name = "([A-Z][A-Za-z0-9&.'-]+(?:[ \\t]+[A-Z][A-Za-z0-9&.'-]+){0,3})";
    const m = jd.match(new RegExp("\\b(?:[Aa]t|[Jj]oin|[Aa]bout)[ \\t]+" + name))
      || jd.match(new RegExp(name + "[ \\t]+(?:is hiring|is looking|seeks|is seeking)"));
    return { role, company: m ? m[1].replace(/[.,]$/, "") : "" };
  }

  // ---------- helpers ----------

  const list = a => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  const uniq = a => [...new Set(a)];
  const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const mdSafe = s => s.replace(/([*_`[\]])/g, "\\$1");

  function contactLine(p, withBehance) {
    return [p.location, p.remote, p.email, p.phone, `[LinkedIn](${p.linkedin})`, `[Portfolio](${p.portfolio})`]
      .concat(withBehance ? [`[Behance](${p.behance})`] : []).join(" | ");
  }

  // Level words are dropped: the CV never claims a seniority the years can't back.
  const LEVEL = /\b(senior|sr\.?|lead|principal|staff|head of|chief|director|manager|junior|jr\.?|intern)\b\s*/gi;
  // Drops "(Contract)", "(Remote)" and "- Remote" style notes from a job title.
  const cleanRole = role => (role || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+[-|]\s+(remote|hybrid|contract|freelance|part[- ]time|full[- ]time).*$/i, "").trim();
  const plainRole = role => cleanRole(role).replace(LEVEL, "").replace(/\s+/g, " ").trim();

  function headline(track, role, facts) {
    const t = facts.tracks[track];
    const r = plainRole(role);
    if (r && t.titleOk.test(r)) return /cpacc/i.test(r) ? r : `${r} (CPACC)`;
    return t.title;
  }

  // ---------- CV ----------

  function makeCV(a, o, facts) {
    const p = facts.person, t = facts.tracks[a.track];
    const lower = (o.jd || "").toLowerCase();
    const matchedLabels = new Set(a.matched.map(m => m.label));
    const out = [];

    out.push("<!-- kind: cv | paper: Letter -->", "", `# ${p.name}`, "", headline(a.track, o.role, facts), "",
      contactLine(p, a.track === "design"), "", "## Profile", "");

    // The profile stays as written: tailoring happens in skill order and bullet choice.
    out.push(t.profile, "", "## Core Skills", "");

    const groups = facts.skills
      .map((g, i) => ({ g, i, hits: g.items.filter(it => matchedLabels.has(it.label)).length }))
      .sort((x, y) => y.hits - x.hits || x.i - y.i)
      .slice(0, 6);
    for (const { g } of groups) {
      const items = [...g.items].sort((x, y) => (matchedLabels.has(y.label) ? 1 : 0) - (matchedLabels.has(x.label) ? 1 : 0));
      out.push(`- **${g.group}:** ${items.slice(0, 8).map(it => it.label).join(", ")}`);
    }

    out.push("", "## Professional Experience", "");
    for (const job of facts.jobs) {
      const scored = job.bullets.map((b, i) => ({
        b, i,
        score: b.tags.filter(tag => lower.includes(tag)).length
          + [...matchedLabels].filter(l => b.text.toLowerCase().includes(l.toLowerCase())).length,
      }));
      const best = Math.max(0, ...scored.map(s => s.score));
      const take = best === 0 && job.max <= 2 ? 1 : job.max;
      const chosen = [...scored].sort((x, y) => y.score - x.score || x.i - y.i).slice(0, take);
      out.push(`### ${job.title[a.track]} | ${job.dates}`, "", job.org, "");
      for (const c of chosen) out.push(`- ${c.b.text}`);
      out.push("");
    }

    const projects = facts.projects.filter(pr => pr.tracks.includes(a.track));
    if (projects.length) {
      out.push(a.track === "design" ? "## Selected Design Work" : "## Selected Projects", "");
      for (const pr of projects) out.push(`- ${pr.text}`);
      out.push("");
    }

    out.push("## Certifications", "");
    for (const c of facts.certifications) out.push(`- ${c}`);
    out.push("", "## Education", "", `### ${facts.education.degree} | ${facts.education.dates}`, "", facts.education.school, "");
    if (a.track === "accessibility") {
      out.push("## Professional Development", "");
      for (const d of facts.development) out.push(`- ${d}`);
    }
    return out.join("\n") + "\n";
  }

  // ---------- cover letter ----------

  function makeCover(a, o, facts) {
    const p = facts.person, t = facts.tracks[a.track];
    const role = cleanRole(o.role) || "[role title]";
    const company = o.company || "[Company]";
    // Names and numbers that make a sentence specific. Two shared ones = the same claim twice.
    const marks = s => new Set((s.match(/\b(?:\d[\d.,%]*\w*|[A-Za-z]*[A-Z][A-Za-z.]*[A-Z0-9][A-Za-z0-9.]*|NVDA|JAWS|Figma|Lotus|Bihub|WashCare|Pinpoint|Liquid|Supabase)\b/g) || []));
    const repeats = (s, used) => [...marks(s)].filter(m => used.has(m)).length >= 2;

    const intro = {
      accessibility: "I'm a CPACC-certified accessibility engineer. I test with NVDA, JAWS and VoiceOver, write the fix, and ship it in React, Next.js, Shopify or WordPress.",
      frontend: "I ship production code in React, Next.js and Shopify Liquid. Every component I build works with a keyboard and a screen reader, which saves your team a round of fixes later.",
      design: "I'm a CPACC-certified product designer who runs the full loop: research, wireframes, Figma prototypes, usability testing and production code.",
    }[a.track];

    // Up to 3 proof sentences for the skills the post names, none repeating the hook, intro or story.
    const used = marks([t.hook, intro, t.story].join(" "));
    const picks = [];
    for (const m of a.matched) {
      const proof = facts.proofs[m.label];
      if (!proof || picks.some(p => p.proof === proof) || repeats(proof, used)) continue;
      picks.push({ proof });
      for (const x of marks(proof)) used.add(x);
      if (picks.length === 3) break;
    }
    // The skills named are your own labels, in the order the post mentions them.
    const asked = uniq(a.matched.filter(m => m.group !== "Working style").map(m => m.label)).slice(0, 4);
    const matchLine = asked.length
      ? `Your post asks for ${list(asked)}.${picks.length ? " " + picks.map(p => p.proof).join(" ") : ""}`
      : "";

    const lines = [
      "<!-- kind: letter | paper: Letter -->", "",
      `# ${p.name}`, "",
      `${p.email} | ${p.phone} | [Portfolio](${p.portfolio}) | [LinkedIn](${p.linkedin})`, "",
      today(), "",
      `Hi ${o.manager || (o.company ? o.company + " team" : "[Hiring manager name]")},`, "",
      `${t.hook} I'd like to bring that work to the ${role} role at ${company}.`, "",
      matchLine ? `${intro} ${matchLine}` : intro, "",
      t.story, "",
      o.why ? o.why : `[One true, specific reason you want to work at ${company}. Name their product, users or mission.]`, "",
      "I'm based in Abuja, Nigeria, and I work US and EU hours. My work is at bryanonyen.vercel.app. I'd be glad to talk next week.", "",
      "Warm regards,",
      `${p.name} (${p.brand})`,
      p.cpacc,
    ];
    return lines.join("\n") + "\n";
  }

  // ---------- contract proposal ----------

  function money(n, cur) {
    return cur === "ngn" ? "₦" + n.toLocaleString("en-US") : "$" + n.toLocaleString("en-US");
  }

  function makeProposal(a, o, facts) {
    const p = facts.person;
    const cur = a.currency;
    const company = o.company || "[Client name]";
    const project = cleanRole(o.role) || "Accessibility work";
    const services = a.services.length ? a.services : facts.services.filter(s => s.id === "audit");

    const out = [
      `<!-- kind: proposal | eyebrow: Bihub Technology - Proposal | paper: ${cur === "ngn" ? "A4" : "Letter"} -->`, "",
      `# ${project} for ${company}`, "",
      "A clear plan, a fixed scope and a price, built from your brief.", "",
      `**Prepared for:** ${o.manager ? o.manager + ", " : ""}${company}`,
      `**Prepared by:** ${p.name} (${p.brand}), ${p.cpacc}`,
      `**Date:** ${today()} - valid for 14 days`, "",
      "## What you asked for", "",
    ];
    if (a.requirements.length) for (const r of a.requirements) out.push(`- ${mdSafe(r)}`);
    else out.push("- [Sum up the client's brief in 3 to 5 bullets]");

    out.push("", "## How I'll deliver it", "");
    for (const s of services) out.push(`### ${s.name}`, "", s.what, "");

    out.push("## Proof", "",
      "- Cut a Shopify store's load time from 12.41s to 0.79s (94%), every Core Web Vital red to green.",
      "- Delivered 100% PDF/UA-compliant documents (0 failures, 163 tags) for Lotus, a TIME Best Invention.",
      "- Built a 36-page healthcare website to WCAG 2.2 AA, checked with Axe DevTools and NVDA.", "",
      "## Investment and timeline", "",
      "| Service | Timeline | Price |", "|---|---|---|");
    for (const s of services) out.push(`| ${s.name} | ${s.time} | ${s.unit === "from" ? "from " : ""}${money(cur === "ngn" ? s.ngn : s.usd, cur)}${s.unit !== "from" && s.unit !== "fixed price" ? " " + s.unit : ""} |`);
    out.push("", "The final price is confirmed after a 20-minute scoping call.", "",
      "## Terms", "",
      "- 50% deposit to start, 50% on delivery. Monthly work is billed in advance.",
      cur === "ngn" ? "- Payment by bank transfer to Moniepoint MFB, account name Bihub Technology, or Paystack."
        : "- Payment by bank transfer, Wise or Payoneer.",
      "- An audit lowers legal risk. It is a test against WCAG 2.2 AA and is not a legal guarantee.", "",
      "## Next step", "",
      "Reply \"Let's start\" and I'll send the invoice and book the scoping call this week.", "",
      `**${p.name}** - ${p.business}`,
      `${p.email} - [${p.portfolio.replace("https://", "")}](${p.portfolio})`);
    return out.join("\n") + "\n";
  }

  // ---------- checks ----------

  // The slop check: flags what makes writing read as machine-made.
  const TELLS = ["passionate", "seamless", "seamlessly", "leverage", "elevate", "unlock", "dive into", "delve",
    "game-changer", "game changer", "testament", "cutting-edge", "robust", "pivotal", "tapestry", "synergy",
    "spearhead", "holistic", "meticulous", "furthermore", "moreover", "in today's", "fast-paced",
    "ever-evolving", "landscape of", "i am writing to", "i'm writing to", "thrilled", "excited to apply",
    "i hope this", "dynamic team", "results-driven", "go-getter", "think outside the box", "proven track record",
    "hard-working", "detail-oriented", "team player", "wealth of experience", "plays a vital role"];

  function lint(md) {
    const body = md.replace(/^<!--[\s\S]*?-->/, "");
    const lines = body.split("\n").filter(l => l && !/^(#|\||- |\d+\.|\*\*|<)/.test(l.trim()) && !l.includes(" | "));
    const prose = lines.join(" ");
    const sentences = lines.flatMap(l => l.split(/(?<=[.!?])\s+/)).filter(x => x.split(" ").length > 3);
    const w = [];

    const holes = body.match(/\[[^\]\n]+\](?!\()/g) || [];
    if (holes.length) w.push(`Fill ${holes.length} [bracket] gap${holes.length > 1 ? "s" : ""}: ${uniq(holes).slice(0, 3).join(", ")}`);
    if (/—/.test(body)) w.push("Remove em dashes (use -).");
    if (/\bnot (just|only|merely)\b|isn't just|aren't just|\bnot about\b|it's not [^.]{1,40}, it's/i.test(body))
      w.push('Cut the "not X, it\'s Y" line. Say what it is.');
    const tells = TELLS.filter(x => body.toLowerCase().includes(x));
    if (tells.length) w.push("AI-sounding words: " + tells.join(", ") + ".");
    const long = sentences.filter(x => x.split(" ").length > 32);
    if (long.length) w.push(`${long.length} sentence${long.length > 1 ? "s run" : " runs"} over 32 words. Split ${long.length > 1 ? "them" : "it"}.`);
    const openers = {};
    for (const x of sentences) { const k = x.split(" ")[0].toLowerCase(); openers[k] = (openers[k] || 0) + 1; }
    const same = Object.entries(openers).filter(([k, n]) => n >= 4 && k !== "i");
    if (same.length) w.push(`${same.map(([k, n]) => `${n} sentences start with "${k}"`).join("; ")}. Vary them.`);
    if (sentences.length >= 6 && (openers.i || 0) / sentences.length > 0.5) w.push('Over half the sentences start with "I". Lead some with the result.');
    const triplets = (prose.match(/\b\w+(ly)?, \w+(ly)?,? and \w+\b/g) || []).length;
    if (triplets > 3) w.push(`${triplets} lists of three. Cut some to one or two items.`);
    return w;
  }

  function slug(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  const API = { analyze, makeCV, makeCover, makeProposal, lint, slug };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.ApplyEngine = API;
})(this);
