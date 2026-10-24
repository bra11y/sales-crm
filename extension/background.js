// Follows one application from the CRM's Apply button to the thank-you page.
// Each time the tab loads a page it looks: thank-you page, form, or listing.
// A form gets filled, a listing gets its Apply button pressed (up to 3 times),
// and the thank-you page marks the job as applied in the CRM. Submit is yours.

const MAX_HOPS = 3;
const BOARD_HOSTS = /(^|\.)(linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+)$/;
const key = (tabId) => `run:${tabId}`;
const kits = new Map(); // jobId -> { kit, cv } for this browser session
const timers = new Map();

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
  if (!s) throw new Error("Connect the extension first: open it from the toolbar and paste your code from Profile.");
  const res = await fetch(`${s.server}${path}`, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${s.code}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `The CRM answered ${res.status}.`);
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
  if (kits.has(jobId)) return kits.get(jobId);
  const kit = await (await api(`/api/ext/kit?job=${encodeURIComponent(jobId)}`)).json();
  const pdf = await (await api(`/api/ext/cv?job=${encodeURIComponent(jobId)}`)).arrayBuffer();
  const entry = { kit, cv: { name: kit.cvName, base64: toBase64(pdf) } };
  kits.set(jobId, entry);
  return entry;
}

async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["match.js", "fill.js"] });
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ["panel.js"] });
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
    await api("/api/ext/applied", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job: run.jobId }) });
    await setRun(tabId, { ...run, done: true });
    await panel(tabId, { job: run.job, step: "success", tone: "good", message: auto ? "Application sent. It's saved in your CRM as applied, and counts toward your goals." : "Saved in your CRM as applied." });
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

  let entry;
  try {
    entry = await kitFor(run.jobId);
  } catch (e) {
    await panel(tabId, { job: run.job, step: "connect", tone: "bad", message: e.message });
    return;
  }
  run.job = { title: entry.kit.job.title, company: entry.kit.job.company };

  // Job boards that ban automation: the helper waits for you to press their Apply.
  if (BOARD_HOSTS.test(new URL(tab.url).hostname)) {
    await setRun(tabId, run);
    return panel(tabId, {
      job: run.job,
      step: "nothing",
      message: "This is the job on a board that does not allow helpers to click for you. Press its Apply button (not Easy Apply). The company's form fills itself when it opens.",
    });
  }

  const frames = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => window.__salesCrmDetect && window.__salesCrmDetect() });
  const seen = frames.map((f) => f.result).filter(Boolean);
  const fields = seen.reduce((n, d) => n + d.fields, 0);
  const top = frames.find((f) => f.frameId === 0)?.result || {};

  if (fields < 2 && seen.some((d) => d.success)) {
    if (run.filled > 0) return markApplied(tabId, run, true);
    await setRun(tabId, run);
    return panel(tabId, { job: run.job, step: "nothing", maybeApplied: true, message: "This looks like a thank-you page. If you sent the application, mark it as applied." });
  }

  if (fields >= 2) {
    await panel(tabId, { job: run.job, step: "finding", message: "Filling the form…" });
    const runs = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: (k, c) => window.__salesCrmFill && window.__salesCrmFill(k, c), args: [entry.kit, run.cvSent ? null : entry.cv] });
    const reports = runs.map((r) => r.result).filter(Boolean);
    const filled = reports.flatMap((r) => r.filled.map((f) => f.label));
    const resume = reports.some((r) => r.resume);
    run = { ...run, filled: run.filled + filled.length, cvSent: run.cvSent || resume };
    await setRun(tabId, run);
    return panel(tabId, {
      job: run.job,
      step: "filled",
      message: filled.length
        ? `Filled ${filled.length} ${filled.length === 1 ? "box" : "boxes"}, outlined in blue. Read the form, fix anything, then press Submit or Next. The next page fills itself.`
        : "Everything here is already filled. Read it, then press Submit or Next.",
      filled,
      check: [...new Set(reports.flatMap((r) => r.check))],
      needs: [...new Set(reports.flatMap((r) => r.needs))],
    });
  }

  if (top.apply && run.hops < MAX_HOPS) {
    run = { ...run, hops: run.hops + 1 };
    await setRun(tabId, run);
    await panel(tabId, { job: run.job, step: "opening", message: `This is the job listing. Pressing “${top.apply}” to reach the form…` });
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: () => window.__salesCrmGoApply && window.__salesCrmGoApply() });
    return;
  }

  await setRun(tabId, run);
  return panel(tabId, {
    job: run.job,
    step: "nothing",
    message: "No form on this page yet. If the site asks you to sign in or press a button, do that. The form fills itself when it appears.",
  });
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

chrome.tabs.onRemoved.addListener((tabId) => dropRun(tabId));

async function start(jobId, openerTabId) {
  const { kit } = await kitFor(jobId);
  if (!kit.job.applyUrl) throw new Error("This job has no application link. Open it in the CRM to apply by email.");
  // The address comes from the CRM's record of the job, never from the page that asked.
  const tab = await chrome.tabs.create({ url: kit.job.applyUrl, openerTabId });
  await setRun(tab.id, { jobId, hops: 0, filled: 0, cvSent: false, done: false, job: { title: kit.job.title, company: kit.job.company } });
  // A fast page can finish loading before the line above; look once anyway.
  schedule(tab.id, 1500);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = msg.tabId ?? sender.tab?.id;
  (async () => {
    if (msg.type === "start") {
      if (!/^[0-9a-f-]{36}$/i.test(msg.jobId || "")) throw new Error("That job id is not valid.");
      await start(msg.jobId, sender.tab?.id);
    } else if (msg.type === "popup-fill") {
      // From the toolbar popup: help on the page you are on, for the job it matches.
      const s = await settings();
      if (!s) throw new Error("Connect first.");
      const tab = await chrome.tabs.get(tabId);
      const kit = await (await api(`/api/ext/kit?url=${encodeURIComponent(tab.url || "")}`)).json();
      const run = (await getRun(tabId)) || { hops: 0, filled: 0, cvSent: false, done: false };
      await setRun(tabId, { ...run, jobId: kit.job.id, done: false, job: { title: kit.job.title, company: kit.job.company } });
      await step(tabId, { force: true });
    } else if (msg.type === "page-changed") {
      schedule(tabId, 300);
    } else if (msg.type === "fill-now") {
      await step(tabId, { force: true });
    } else if (msg.type === "mark-applied") {
      const run = await getRun(tabId);
      if (run) await markApplied(tabId, run, false);
    } else if (msg.type === "stop") {
      await dropRun(tabId);
      await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: () => window.__salesCrmPanel && window.__salesCrmPanel.remove() }).catch(() => {});
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
