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
      guess: { ...guessNames(jd), contact: guessContact(jd) } };
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
  const cleanRole = role => (role || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+[-|]\s+(remote|hybrid|contract|freelance|part[- ]time|full[- ]time).*$/i, "").replace(/,?\s+(temp(orary)?[- ]to[- ]perm(anent)?|contract[- ]to[- ]hire)$/i, "").trim();
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
      // Measured results first when the fit is equal: numbers are what recruiters skim for.
      const measured = b => (/\d/.test(b.text) ? 1 : 0);
      const chosen = [...scored].sort((x, y) => y.score - x.score || measured(y.b) - measured(x.b) || x.i - y.i).slice(0, take);
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

  // The same job always gets the same letter; a different job gets a different shape and wording.
  // `seed` in the options asks for another version of the same letter.
  function seedOf(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pick = (arr, n) => arr[n % arr.length];

  // Letter shapes with evidence behind them: the short hook-why-proof letter, the
  // T-letter (their needs beside your proof), the problem ("pain") letter that opens
  // on the problem the post names, and a short note (short emails get more replies).
  const SHAPES = {
    classic: "Hook, why them, proof",
    match: "Their needs, your proof (T-letter)",
    problem: "Their problem first",
    short: "Short note",
  };
  const PROBLEM = /\b(fix|improv|struggl|backlog|legacy|audit|lawsuit|complian|scal|slow|rebuild|migrat|redesign|overhaul|remediat|reduce|speed)\w*/i;

  function letterShape(a, o) {
    if (o.shape && SHAPES[o.shape]) return o.shape;
    const fits = ["classic", "short"];
    if (a.requirements.length >= 3 && a.matched.length >= 3) fits.push("match");
    if (a.requirements.some(r => PROBLEM.test(r))) fits.push("problem");
    return pick(fits, seedOf(`${o.company}|${o.role}|${o.seed || 0}`));
  }

  // A name the post gives for the recruiter or hiring manager, so the letter can greet them.
  function guessContact(jd) {
    const NAME = "((?:Mr|Ms|Mrs|Miss|Dr)\\.?\\s+)?([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?(?:\\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?){0,2})";
    const cues = [
      "(?:recruiter|hiring manager|hiring contact|contact person|talent (?:acquisition )?(?:partner|specialist|lead|manager)|point of contact)\\s*(?:is|:|-|–)\\s*",
      "(?:contact|reach out to|email|send (?:your )?(?:cv|resume|application)[^.\\n]{0,30}?\\bto)\\s+",
      "(?:posted by|meet the hiring team\\s*\\n+\\s*)",
      "(?:report(?:ing)? to|you(?:'ll| will) report to)\\s+",
    ];
    const skip = /^(Our|The|Us|We|You|Your|Team|Hr|Human|Recruitment|Careers|Jobs|Hiring|Talent|Head|Director|Manager|Senior|Lead|Chief|Remote|Apply|Please)$/;
    for (const cue of cues) {
      const m = jd.match(new RegExp(cue + NAME, "i"));
      if (!m) continue;
      const name = m[2].trim();
      const first = name.split(/\s+/)[0];
      // The cue is matched without case; the name itself must be capitalised like a name.
      if (!/^[A-Z]/.test(first) || skip.test(first)) continue;
      const title = (m[1] || "").replace(/\.?\s+$/, "");
      const last = name.split(/\s+/).slice(-1)[0];
      return { name, first, greet: title && last !== first ? `${title} ${last}` : first };
    }
    return null;
  }

  // Some posts ask you to prove you read them: "mention the word BLOOM and tag RMzQu... when applying".
  // Found by pattern, no AI. The tag can be built from whoever opened the page, so the
  // person checks it against the post in their own browser before it goes in.
  function readCheck(jd) {
    const t = (jd || "").replace(/\*\*|__/g, "");
    const sentences = t.split(/(?<=[.!?])\s+|\n+/);
    const ask = /\b(mention|include|use|write|add|put|say|start (?:your (?:application|message|email|cover letter) )?with|begin (?:your (?:application|message|email) )?with)\s+(?:the\s+)?(word|phrase|keyword|code ?word|code)\s+["\u201c'\u2018]?([A-Za-z0-9][\w-]{1,30})["\u201d'\u2019]?/i;
    const tagRe = /\btag\s+#?([A-Za-z0-9+/=]{8,})/i;
    for (const sentence of sentences) {
      const w = sentence.match(ask);
      const g = sentence.match(tagRe);
      if (!w && !g) continue;
      return { word: w ? w[3] : "", tag: g ? g[1] : "", subject: /subject/i.test(sentence), sentence: sentence.trim().slice(0, 300) };
    }
    return null;
  }

  function makeCover(a, o, facts) {
    const p = facts.person, t = facts.tracks[a.track];
    const role = cleanRole(o.role) || "[role title]";
    const company = o.company || "[Company]";
    const shape = letterShape(a, o);
    const n = seedOf(`${company}|${role}|${o.seed || 0}`);
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
      if (!proof || picks.some(x => x.proof === proof) || repeats(proof, used)) continue;
      picks.push({ proof, said: m.said, label: m.label });
      for (const x of marks(proof)) used.add(x);
      if (picks.length === 3) break;
    }
    // The skills named in the order the post mentions them. When the post used other
    // words ("payments" for Paystack), its own words are quoted, so the line stays true.
    const asked = uniq(a.matched.filter(m => m.group !== "Working style")
      .map(m => m.said.toLowerCase() === m.label.toLowerCase() ? m.label : m.said)).slice(0, 4);
    const matchLine = asked.length
      ? `Your post asks for ${list(asked)}.${picks.length ? " " + picks.map(x => x.proof).join(" ") : ""}`
      : "";

    // A name typed in wins; else the recruiter the post names. First names for "Hi", titles kept.
    const typed = (o.manager || "").trim();
    const contact = typed ? { greet: /^(Mr|Ms|Mrs|Miss|Dr)\b/.test(typed) ? typed : typed.split(/\s+/)[0] } : (a.guess && a.guess.contact) || null;
    const greeting = `${pick(["Hi", "Hello"], n)} ${contact ? contact.greet : o.company ? o.company + " team" : "[Hiring manager name]"},`;
    const why = o.why ? o.why : `[One true, specific reason you want to work at ${company}. Name their product, users or mission.]`;
    const where = pick([
      "I'm based in Abuja, Nigeria, and I work US and EU hours.",
      "I work from Abuja, Nigeria, on US and EU hours.",
      "I'm in Abuja, Nigeria, and my working day overlaps US and EU hours.",
    ], n >>> 3);
    // The link ends its sentence, so the email's "portfolio: https://..." reads cleanly.
    const ask = pick([
      `You can see my work in my [portfolio](${p.portfolio}). Could we talk for 20 minutes next week?`,
      `The full case studies are in my [portfolio](${p.portfolio}). I'd welcome a 20-minute call next week.`,
      `You'll find the case studies in my [portfolio](${p.portfolio}). I can walk you through one on a short call next week.`,
    ], n >>> 5);
    const signoff = pick(["Warm regards,", "Best regards,", "Thank you,", "Best,"], n >>> 7);

    let middle;
    if (shape === "match") {
      // T-letter: each need from the post, then the proof for it. Plain lines, no bold labels.
      const rows = picks.length ? picks : a.matched.slice(0, 3).map(m => ({ said: m.said, proof: facts.proofs[m.label] || "" })).filter(x => x.proof);
      middle = [
        `${pick(["I'm applying for", "This is my application for"], n >>> 9)} the ${role} role at ${company}.${asked.length ? ` Your post asks for ${list(asked)}.` : ""} Here is where I've done that work.`, "",
        ...rows.map(x => `- ${x.said.charAt(0).toUpperCase() + x.said.slice(1)}. ${x.proof}`), "",
        why, "",
        intro, "",
      ];
    } else if (shape === "problem") {
      const need = (a.requirements.find(r => PROBLEM.test(r)) || "").replace(/[.;:]+$/, "");
      const lower = need.charAt(0).toLowerCase() + need.slice(1);
      middle = [
        `Your post says the ${role} will ${/^(to|be)\b/i.test(lower) ? lower.replace(/^to\s+/i, "") : lower.replace(/^(you will|you'll)\s+/i, "")}. ${pick(["I've done that work before.", "That's work I've already done."], n >>> 9)}`, "",
        t.story, "",
        why, "",
        matchLine ? `${intro} ${matchLine}` : intro, "",
      ];
    } else if (shape === "short") {
      middle = [
        `${t.hook} ${pick([`I'd like to bring that work to the ${role} role at ${company}.`, `That's the work I want to do as your ${role}.`], n >>> 9)}`, "",
        why, "",
        `${intro}${asked.length ? ` Your post asks for ${list(asked.slice(0, 2))}.` : ""}${picks[0] ? ` ${picks[0].proof}` : ""}`, "",
      ];
    } else {
      middle = [
        // Hook, why them, proof, close: the short letter recruiters say they read.
        `${t.hook} ${pick([`I'd like to bring that work to the ${role} role at ${company}.`, `That's the work I want to do as your ${role} at ${company}.`], n >>> 9)}`, "",
        why, "",
        matchLine ? `${intro} ${matchLine}` : intro, "",
        t.story, "",
      ];
    }

    const lines = [
      `<!-- kind: letter | paper: Letter | shape: ${shape} -->`, "",
      `# ${p.name}`, "",
      `${p.email} | ${p.phone} | [Portfolio](${p.portfolio}) | [LinkedIn](${p.linkedin})`, "",
      today(), "",
      greeting, "",
      ...middle,
      `${where} ${ask}`, "",
      signoff,
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

  // The slop check: flags what makes writing read as machine-made. Built from Wikipedia's
  // "Signs of AI writing" field guide plus the cover-letter cliches recruiters name.
  const TELLS = ["passionate", "seamless", "seamlessly", "leverage", "elevate", "unlock", "dive into", "delve",
    "game-changer", "game changer", "testament", "cutting-edge", "robust", "pivotal", "tapestry", "synergy",
    "spearhead", "holistic", "meticulous", "furthermore", "moreover", "in today's", "fast-paced",
    "ever-evolving", "landscape of", "i am writing to", "i'm writing to", "thrilled", "excited to apply",
    "i hope this", "dynamic team", "results-driven", "go-getter", "think outside the box", "proven track record",
    "hard-working", "detail-oriented", "team player", "wealth of experience", "plays a vital role",
    "underscore", "underscores", "showcasing", "intricate", "interplay", "multifaceted", "foster", "fostering",
    "garner", "bolster", "realm", "embark", "endeavor", "paramount", "commendable", "noteworthy", "invaluable",
    "valuable insights", "key turning point", "setting the stage", "enduring legacy", "indelible", "nestled",
    "vibrant", "in the heart of", "renowned", "unparalleled", "best-in-class", "world-class", "state-of-the-art",
    "resonate with", "resonates with", "align with my", "aligns with my", "navigate the", "ever-changing",
    "please do not hesitate", "i am confident that", "perfect fit", "ideal candidate"];
  // Wikipedia: "serves as" and "stands as" in place of a plain "is".
  const COPULA = /\b(serves as|serve as|stands as|stand as|boasts an?|acts as a)\b/i;
  // Wikipedia: a trailing "-ing" phrase that adds vague importance.
  const TRAILING = /,\s+(highlighting|underscoring|emphasizing|emphasising|showcasing|reflecting|demonstrating|solidifying|cementing|contributing to|paving the way)\b/i;
  // Wikipedia: unnamed authorities.
  const VAGUE = /\b(experts (say|agree|argue|believe)|studies (show|suggest)|research shows|industry reports|observers (note|say)|many believe|it is widely)\b/i;

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
    const low = body.toLowerCase();
    const tells = TELLS.filter(x => new RegExp("(^|[^a-z])" + esc(x) + "(?![a-z])").test(low));
    if (tells.length) w.push("AI-sounding words: " + tells.join(", ") + ". Use the plain word.");
    const cop = body.match(COPULA);
    if (cop) w.push(`"${cop[0]}" reads as machine-made. Say "is" or "has".`);
    const trail = body.match(TRAILING);
    if (trail) w.push(`Cut the tacked-on ", ${trail[1]} ..." phrase. End the sentence at the fact.`);
    const vague = body.match(VAGUE);
    if (vague) w.push(`"${vague[0]}" names no one. Name the source or cut it.`);
    if (/\p{Extended_Pictographic}/u.test(body)) w.push("Remove the emoji.");
    // Human writing mixes short and long sentences; machine text keeps them all alike.
    const lens = sentences.map(x => x.split(" ").length);
    if (lens.length >= 6) {
      const mean = lens.reduce((x, y) => x + y, 0) / lens.length;
      const sd = Math.sqrt(lens.reduce((x, y) => x + (y - mean) ** 2, 0) / lens.length);
      if (sd < 3) w.push("Every sentence is about the same length. Mix in a short one.");
    }
    const long = sentences.filter(x => x.split(" ").length > 32);
    if (long.length) w.push(`${long.length} sentence${long.length > 1 ? "s run" : " runs"} over 32 words. Split ${long.length > 1 ? "them" : "it"}.`);
    const openers = {};
    for (const x of sentences) { const k = x.split(" ")[0].toLowerCase(); openers[k] = (openers[k] || 0) + 1; }
    const same = Object.entries(openers).filter(([k, n]) => n >= 4 && k !== "i");
    if (same.length) w.push(`${same.map(([k, n]) => `${n} sentences start with "${k}"`).join("; ")}. Vary them.`);
    if (sentences.length >= 6 && (openers.i || 0) / sentences.length > 0.5) w.push('Over half the sentences start with "I". Lead some with the result.');
    const kind = (md.match(/kind:\s*(\w+)/) || [])[1];
    if (kind === "letter") {
      const start = body.search(/^(Hi|Dear|Hello)\b/m);
      const words = (start >= 0 ? body.slice(start) : body).split(/\s+/).filter(Boolean).length;
      if (words > 400) w.push(`The letter is ${words} words. Cut it to under 400: recruiters skim.`);
      else if (words < 90) w.push(`The letter is only ${words} words. Add one measured result that matches their top need.`);
    }
    if (kind === "cv") {
      const bullets = body.split("\n").filter(l => /^- /.test(l.trim()) && !/^- \*\*/.test(l.trim()));
      const bare = bullets.filter(l => !/\d/.test(l));
      if (bullets.length >= 6 && bare.length / bullets.length > 0.5) w.push(`${bare.length} of ${bullets.length} bullets have no number. Add a result: time saved, %, users, money.`);
    }
    const triplets = (prose.match(/\b\w+(ly)?, \w+(ly)?,? and \w+\b/g) || []).length;
    if (triplets > 3) w.push(`${triplets} lists of three. Cut some to one or two items.`);
    return w;
  }

  function slug(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  const API = { analyze, makeCV, makeCover, makeProposal, lint, slug, guessContact, letterShape, SHAPES, seedOf, readCheck };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.ApplyEngine = API;
})(this);
