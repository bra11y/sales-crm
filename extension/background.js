// Follows one application from the CRM's Apply button to the thank-you page.
// Each time the tab loads a page it looks: thank-you page, form, or listing.
// A form gets filled, a listing gets its Apply button pressed (up to 3 times),
// and the thank-you page marks the job as applied in the CRM. Submit is yours.

const MAX_HOPS = 3;
const BOARD_HOSTS = /(^|\.)(linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|seek\.com\.au|seek\.co\.nz)$/;
const key = (tabId) => `run:${tabId}`;
const timers = new Map();
// Chrome stops this worker after about 30 idle seconds and clears its memory. The job's
// details and CV are kept in session storage instead, so a page that loads later does not
// fetch them again, and a sleeping worker does not lose them.
const kitKey = (jobId) => `kit:${jobId}`;
const cvKey = (jobId) => `cv:${jobId}`;
const TIMEOUT_MS = 15000;

async function settings() {
  return (await chrome.storage.local.get("settings")).settings || null;
}
async function getRun(tabId) {
  return (await chrome.storage.session.get(key(tabId)))[key(tabId)] || null;
}
async function setRun(tabId, run) {
  await chrome.storage.session.set({ [key(tabId)]: run });
}
async function dropRun(tabId) {
  await chrome.storage.session.remove(key(tabId));
}

async function api(path, init = {}) {
  const s = await settings();
  if (!s) throw new Error("Not connected yet. Click the extension in your toolbar and paste the code from your CRM Profile.");
  let res;
  try {
    res = await fetch(`${s.server}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { ...(init.headers || {}), authorization: `Bearer ${s.code}` } });
  } catch (e) {
    throw new Error(e && e.name === "TimeoutError" ? "Your CRM is slow to answer. Press “Fill this page” to try again." : "Your CRM can't be reached. Check your internet, then press “Fill this page”.");
  }
  if (res.status === 401) throw new Error("Your connection code no longer works. Make a new one in your CRM Profile and paste it in the extension.");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Your CRM had a problem (${res.status}). Try again in a minute.`);
  }
  return res;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function kitFor(jobId) {
  const saved = (await chrome.storage.session.get(kitKey(jobId)))[kitKey(jobId)];
  if (saved) return saved;
  const kit = await (await api(`/api/ext/kit?job=${encodeURIComponent(jobId)}`)).json();
  await chrome.storage.session.set({ [kitKey(jobId)]: kit });
  return kit;
}

// The CV is only needed when a form has a file box, so it is fetched then, once per job.
async function cvFor(jobId, kit) {
  const saved = (await chrome.storage.session.get(cvKey(jobId)))[cvKey(jobId)];
  if (saved) return saved;
  const pdf = await (await api(`/api/ext/cv?job=${encodeURIComponent(jobId)}`)).arrayBuffer();
  const cv = { name: kit.cvName, base64: toBase64(pdf) };
  await chrome.storage.session.set({ [cvKey(jobId)]: cv }).catch(() => {});
  return cv;
}

// Adds the helper's scripts only to frames that do not have them yet. Injecting into every
// frame (ads included) on every page load was the main cause of the lag.
async function inject(tabId) {
  const have = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => Boolean(window.__salesCrmDetect) });
  const missing = have.filter((f) => !f.result).map((f) => f.frameId);
  if (missing.length) await chrome.scripting.executeScript({ target: { tabId, frameIds: missing }, files: ["match.js", "fill.js"] });
  if (missing.includes(0)) await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ["panel.js"] });
}

async function panel(tabId, state) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: (s) => window.__salesCrmPanel && window.__salesCrmPanel.show(s), args: [state] });
  } catch {
    // Chrome pages and the Web Store cannot be scripted; nothing to show there.
  }
}

async function markApplied(tabId, run, auto) {
  try {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    await api("/api/ext/applied", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job: run.jobId, url: tab?.url || "", filled: run.filled, auto }) });
    await setRun(tabId, { ...run, done: true });
    await panel(tabId, { job: run.job, step: "success", tone: "good", message: auto ? "Application sent. The CRM saved the thank-you page as proof and moved the job to Applied. Replies in your Gmail move it on by themselves." : "Saved in your CRM as applied." });
  } catch (e) {
    await panel(tabId, { job: run.job, step: "error", tone: "bad", message: e.message });
  }
}

async function step(tabId, { force = false } = {}) {
  let run = await getRun(tabId);
  if (!run || (run.done && !force)) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !/^https?:/.test(tab.url || "")) return;

  try {
    await inject(tabId);
  } catch {
    return; // A page we may not touch (or it navigated away mid-way); the next load tries again.
  }

  let kit;
  try {
    kit = await kitFor(run.jobId);
  } catch (e) {
    await panel(tabId, { job: run.job, step: "error", tone: "bad", message: e.message });
    return;
  }
  run.job = { title: kit.job.title, company: kit.job.company };

  // Job boards that ban automation: the helper waits for you to press their Apply.
  if (BOARD_HOSTS.test(new URL(tab.url).hostname)) {
    await setRun(tabId, run);
    return panel(tabId, {
      job: run.job,
      step: "nothing",
      message: "This site doesn't allow helpers to click for you. Press its Apply button (not Easy Apply). The company's form fills in by itself when it opens.",
    });
  }

  const frames = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => window.__salesCrmDetect && window.__salesCrmDetect() });
  const seen = frames.map((f) => f.result).filter(Boolean);
  const fields = seen.reduce((n, d) => n + d.fields, 0);
  const top = frames.find((f) => f.frameId === 0)?.result || {};

  if (fields < 2 && seen.some((d) => d.success)) {
    if (run.filled > 0) return markApplied(tabId, run, true);
    await setRun(tabId, run);
    return panel(tabId, { job: run.job, step: "nothing", maybeApplied: true, message: "This looks like a thank-you page. If you sent it, mark it as applied." });
  }

  if (fields >= 2) {
    await panel(tabId, { job: run.job, step: "finding", message: "Filling the form…" });
    let cv = null;
    if (!run.cvSent) {
      try {
        cv = await cvFor(run.jobId, kit);
      } catch {
        cv = null; // The boxes still get filled; the panel asks you to attach the CV.
      }
    }
    const runs = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: (k, c) => window.__salesCrmFill && window.__salesCrmFill(k, c), args: [kit, cv] });
    const reports = runs.map((r) => r.result).filter(Boolean);
    const filled = reports.flatMap((r) => r.filled.map((f) => f.label));
    const resume = reports.some((r) => r.resume);
    run = { ...run, filled: run.filled + filled.length, cvSent: run.cvSent || resume };
    await setRun(tabId, run);
    return panel(tabId, {
      job: run.job,
      step: "filled",
      message: filled.length
        ? `Filled ${filled.length} ${filled.length === 1 ? "box" : "boxes"} (outlined in blue). Check them, then press Submit or Next yourself.${!run.cvSent && !cv ? " Attach your CV by hand: it could not be fetched." : ""}`
        : "This page is already filled. Check it, then press Submit or Next.",
      filled,
      check: [...new Set(reports.flatMap((r) => r.check))],
      needs: [...new Set(reports.flatMap((r) => r.needs))],
    });
  }

  // A post that takes applications by email: read the address the page shows you, save it
  // to the job in the CRM, and send from there (with your CV, from your Gmail).
  if (!run.emailSaved) {
    const [found] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: emailsOnPage }).catch(() => [{}]);
    const mail = found?.result;
    if (mail?.emails?.length) {
      try {
        const r = await (await api("/api/ext/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job: run.jobId, email: mail.emails[0], sentence: mail.sentence, url: tab.url }) })).json();
        if (!r.ok) throw new Error(r.error || "The address could not be saved.");
        run = { ...run, emailSaved: true, crm: r.crm };
        await setRun(tabId, run);
        const others = mail.emails.length > 1 ? ` The post also names ${mail.emails.slice(1).join(", ")}; the CRM uses the first.` : "";
        return panel(tabId, { job: run.job, step: "email", tone: "good", message: `This job takes applications by email: ${r.email}. It's saved in your CRM.${others} Send it from the CRM with your CV.` });
      } catch {
        // Not this job's page, or the CRM said no: carry on with the form as usual.
        run = { ...run, emailSaved: true };
        await setRun(tabId, run);
      }
    }
  }

  if (top.apply && run.hops < MAX_HOPS) {
    run = { ...run, hops: run.hops + 1 };
    await setRun(tabId, run);
    await panel(tabId, { job: run.job, step: "opening", message: `Opening the form (pressing “${top.apply}”)…` });
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: () => window.__salesCrmGoApply && window.__salesCrmGoApply() });
    return;
  }

  await setRun(tabId, run);
  return panel(tabId, {
    job: run.job,
    step: "nothing",
    message: "No form here yet. If the site asks you to sign in or press a button, do that. The form fills in when it appears.",
  });
}

// Runs in the page: the emails under "How to Apply" or "Method of Application", as the browser
// shows them. Same rules as lib/apply/page-contact.ts.
function emailsOnPage() {
  const BOARD = /@(hotnigerianjobs\.com|myjobmag\.com|jobberman\.com|ngcareers\.com)$/i;
  const text = document.body ? document.body.innerText : "";
  const at = text.search(/method of application|how to apply|to apply,? (please )?send|send (your|their) (cv|applications?|resume)/i);
  if (at < 0) return { emails: [], sentence: "" };
  const part = text.slice(at, at + 1200);
  const emails = [...new Set((part.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) || []).map((e) => e.toLowerCase()))].filter((e) => !BOARD.test(e));
  const sentence = (part.match(/[^.\n]*@[^.\n]*(\.[a-z]{2,}[^.\n]*)*/i) || [""])[0].trim();
  return { emails, sentence };
}

// Pages load in bursts; wait for the page to settle before looking.
function schedule(tabId, delay = 1200) {
  clearTimeout(timers.get(tabId));
  timers.set(tabId, setTimeout(() => step(tabId), delay));
}

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete" && !info.url) return;
  if (await getRun(tabId)) schedule(tabId);
});

// Some Apply buttons open the form in a new tab: the helper follows it there.
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.openerTabId) return;
  const run = await getRun(tab.openerTabId);
  if (run && !run.done) await setRun(tab.id, { ...run, hops: run.hops + 1 });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
  dropRun(tabId);
});

async function start(jobId, openerTabId) {
  const kit = await kitFor(jobId);
  if (!kit.job.applyUrl) throw new Error("This job has no application link. Apply by email from the CRM instead.");
  // The address comes from the CRM's record of the job, never from the page that asked.
  const tab = await chrome.tabs.create({ url: kit.job.applyUrl, openerTabId });
  await setRun(tab.id, { jobId, hops: 0, filled: 0, cvSent: false, done: false, job: { title: kit.job.title, company: kit.job.company } });
  // A fast page can finish loading before the line above; look once anyway.
  schedule(tab.id, 1500);
}

// The writing check: only on request, in the tab you are on. Needs no CRM connection.
async function checkWriting(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ["engine.js", "write-check.js"] });
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: () => window.__crmWriteCheck && window.__crmWriteCheck() });
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "check-writing" && tab?.id) await checkWriting(tab.id).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = msg.tabId ?? sender.tab?.id;
  (async () => {
    if (msg.type === "start") {
      if (!/^[0-9a-f-]{36}$/i.test(msg.jobId || "")) throw new Error("That job id is not valid.");
      await start(msg.jobId, sender.tab?.id);
    } else if (msg.type === "popup-fill") {
      // From the toolbar popup: help on the page you are on, for the job it matches.
      const s = await settings();
      if (!s) throw new Error("Not connected yet. Paste the code from your CRM Profile first.");
      const tab = await chrome.tabs.get(tabId);
      const kit = await (await api(`/api/ext/kit?url=${encodeURIComponent(tab.url || "")}`)).json();
      await chrome.storage.session.set({ [kitKey(kit.job.id)]: kit });
      const run = (await getRun(tabId)) || { hops: 0, filled: 0, cvSent: false, done: false };
      await setRun(tabId, { ...run, jobId: kit.job.id, done: false, job: { title: kit.job.title, company: kit.job.company } });
      await step(tabId, { force: true });
    } else if (msg.type === "page-changed") {
      schedule(tabId, 300);
    } else if (msg.type === "fill-now") {
      await step(tabId, { force: true });
    } else if (msg.type === "open-crm") {
      const run = await getRun(tabId);
      const s = await settings();
      if (run?.crm && s) await chrome.tabs.create({ url: `${s.server}${run.crm}` });
    } else if (msg.type === "mark-applied") {
      const run = await getRun(tabId);
      if (run) await markApplied(tabId, run, false);
    } else if (msg.type === "stop") {
      await dropRun(tabId);
      await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: () => window.__salesCrmPanel && window.__salesCrmPanel.remove() }).catch(() => {});
    } else if (msg.type === "write-check") {
      await checkWriting(tabId);
    } else if (msg.type === "status") {
      return { connected: Boolean(await settings()) };
    }
    return { ok: true };
  })().then(
    (r) => reply(r),
    (e) => reply({ ok: false, error: e.message }),
  );
  return true;
});
