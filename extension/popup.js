// The popup: connect once with a code from Profile, then "Fill this form" on any
// application page. Results list what was filled and what you must check.

const $ = (id) => document.getElementById(id);
let settings = null;
let kit = null;

function say(text) {
  $("error").textContent = "";
  $("status").textContent = text;
}
function fail(text) {
  $("status").textContent = "";
  $("error").textContent = text;
}
function busy(button, on, label) {
  button.setAttribute("aria-disabled", on ? "true" : "false");
  if (label) button.textContent = label;
}

async function api(path, init = {}) {
  const res = await fetch(`${settings.server}${path}`, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${settings.code}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `The CRM answered ${res.status}.`);
  }
  return res;
}

function show(view) {
  $("connect").hidden = view !== "connect";
  $("ready").hidden = view !== "ready";
  $("disconnect").hidden = view !== "ready";
}

function list(id, items, render) {
  const ul = $(id);
  ul.replaceChildren(...items.map((item) => {
    const li = document.createElement("li");
    render(li, item);
    return li;
  }));
  ul.hidden = !items.length;
  const title = $(`${id}-title`);
  if (title) title.hidden = !items.length;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadKit() {
  const tab = await currentTab();
  say("Getting your answers for this job…");
  try {
    kit = await (await api(`/api/ext/kit?url=${encodeURIComponent(tab?.url || "")}`)).json();
  } catch (e) {
    kit = null;
    $("job-title").textContent = "No job yet";
    $("job-company").textContent = "";
    $("job-match").textContent = "";
    busy($("fill"), true);
    fail(e.message);
    return;
  }
  $("job-title").textContent = kit.job.title;
  $("job-company").textContent = kit.job.company;
  $("job-match").textContent = kit.job.matchedBy === "page" ? "Matched to this page." : "The last job you pressed Apply on in the CRM. Wrong job? Open the right one there and press Apply.";
  busy($("fill"), false);
  say("");
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function fill() {
  if (!kit || $("fill").getAttribute("aria-disabled") === "true") return;
  busy($("fill"), true, "Filling…");
  try {
    const tab = await currentTab();
    const pdf = await (await api(`/api/ext/cv?job=${kit.job.id}`)).arrayBuffer();
    const cv = { name: kit.cvName, base64: toBase64(pdf) };
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["match.js", "fill.js"] });
    const runs = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: (k, c) => window.__salesCrmFill && window.__salesCrmFill(k, c), args: [kit, cv] });
    const reports = runs.map((r) => r.result).filter(Boolean);
    const filled = reports.flatMap((r) => r.filled);
    const check = [...new Set(reports.flatMap((r) => r.check))];
    const needs = [...new Set(reports.flatMap((r) => r.needs))];
    const resume = reports.some((r) => r.resume);

    $("result").hidden = false;
    list("filled", filled.length ? filled : [{ label: "Nothing was filled", what: "This page may not be the application form yet. Open the form, then try again." }], (li, f) => {
      li.textContent = f.label;
      const small = document.createElement("small");
      small.textContent = f.what;
      li.append(small);
    });
    list("check", [...(resume ? [] : ["CV: no upload box was found. Attach it yourself."]), ...check], (li, c) => (li.textContent = c));
    list("needs", needs, (li, n) => (li.textContent = n));
    say(`Filled ${filled.length} ${filled.length === 1 ? "box" : "boxes"}, outlined in blue. Read the form, then press Submit on the page.`);
  } catch (e) {
    fail(e.message.includes("Cannot access") ? "Chrome blocked this page. Click inside the form once, then open the extension again." : e.message);
  } finally {
    busy($("fill"), false, "Fill this form");
  }
}

async function markApplied() {
  if (!kit) return;
  busy($("applied"), true);
  try {
    await api("/api/ext/applied", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job: kit.job.id }) });
    say("Marked as applied and saved in your CRM.");
  } catch (e) {
    fail(e.message);
  } finally {
    busy($("applied"), false);
  }
}

$("connect-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const server = $("server").value.trim().replace(/\/$/, "");
  const code = $("code").value.trim();
  if (!/^https:\/\/|^http:\/\/localhost/.test(server)) return fail("The CRM address must start with https://");
  if (!/^scx_/.test(code)) {
    $("code").setAttribute("aria-invalid", "true");
    $("code").focus();
    return fail("That isn't a connection code. It starts with scx_. Make one in Profile.");
  }
  settings = { server, code };
  await chrome.storage.local.set({ settings });
  $("code").value = "";
  init();
});

$("fill").addEventListener("click", fill);
$("applied").addEventListener("click", markApplied);
$("disconnect").addEventListener("click", async () => {
  await chrome.storage.local.remove("settings");
  settings = null;
  kit = null;
  say("Disconnected.");
  init();
});

async function init() {
  ({ settings } = await chrome.storage.local.get("settings"));
  $("open-crm").href = `${settings?.server || "https://sales-crm-virid-ten.vercel.app"}/jobs`;
  if (!settings) {
    show("connect");
    return;
  }
  show("ready");
  await loadKit();
}

init();
