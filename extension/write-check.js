// The writing check. Runs only when you ask (toolbar popup or Alt+Shift+W), on the text box
// you are typing in. Nothing is read in the background and nothing leaves your computer:
// the slop rules run here, and grammar uses Chrome's built-in proofreader when it has one.

(function () {
  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.sheet { --bg: #ffffff; --text: #1c1c1e; --soft: #55555a; --line: rgba(60,60,67,0.2); --accent: #0060df; --good: #1a7f37; --warn: #8a5300;
  position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; width: min(24rem, calc(100vw - 32px)); max-height: min(36rem, calc(100vh - 32px)); overflow: auto;
  font: 0.9375rem/1.45 system-ui, -apple-system, sans-serif; color: var(--text); background: var(--bg); border-radius: 16px; border: 1px solid var(--line);
  box-shadow: 0 18px 50px rgba(0,0,0,0.28); padding: 14px 16px 16px; }
@media (prefers-color-scheme: dark) { .sheet { --bg: #1c1c1e; --text: #f5f5f7; --soft: #b0b0b6; --line: rgba(255,255,255,0.16); --accent: #4da3ff; --good: #30d158; --warn: #ffd60a; } }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
h2 { margin: 0; font-size: 1.0625rem; font-weight: 600; }
h2:focus { outline: none; }
h3 { margin: 14px 0 6px; font-size: 0.8125rem; font-weight: 600; color: var(--soft); letter-spacing: 0.02em; }
ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
p { margin: 6px 0 0; }
.soft { color: var(--soft); font-size: 0.8125rem; }
.good { color: var(--good); font-weight: 600; }
.fix { margin-top: 4px; }
del { color: var(--soft); }
ins { text-decoration: none; font-weight: 600; }
button { all: unset; box-sizing: border-box; cursor: pointer; min-height: 32px; padding: 0 10px; border-radius: 8px; font-weight: 600; font-size: 0.8125rem; background: var(--line); color: var(--text); display: inline-grid; place-items: center; }
button.close { width: 36px; min-height: 36px; padding: 0; border-radius: 50%; font-size: 1.1rem; background: transparent; }
button:hover { background: var(--line); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
`;

  const editable = (el) => el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|email|url)?$/.test(el.type || "")) || el.isContentEditable);
  const fieldOf = () => {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    if (el && el.tagName === "IFRAME") return null;
    if (editable(el)) return el.isContentEditable ? el.closest("[contenteditable]:not([contenteditable=false])") || el : el;
    return window.__crmLastField && document.contains(window.__crmLastField) ? window.__crmLastField : null;
  };
  const textOf = (el) => (el.isContentEditable ? el.innerText : el.value) || "";

  async function grammar(text) {
    const P = globalThis.Proofreader;
    if (!P) return { note: "Grammar: your Chrome has no built-in proofreader yet. The writing rules below still ran." };
    try {
      const a = await P.availability({ expectedInputLanguages: ["en"] });
      if (a === "unavailable") return { note: "Grammar: Chrome's proofreader can't run on this computer." };
      const p = await P.create({ expectedInputLanguages: ["en"] });
      const r = await p.proofread(text);
      if (p.destroy) p.destroy();
      return { corrections: r.corrections || [], corrected: r.correctedInput || text };
    } catch (e) {
      return { note: `Grammar: the proofreader did not run (${(e && e.message) || "unknown error"}).` };
    }
  }

  function setText(el, value) {
    if (el.isContentEditable) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function close() {
    const host = document.getElementById("__crm-write-check");
    if (host) host.remove();
    if (window.__crmWriteField && document.contains(window.__crmWriteField)) window.__crmWriteField.focus();
  }

  async function run() {
    close();
    const field = fieldOf();
    const host = document.createElement("div");
    host.id = "__crm-write-check";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><section class="sheet" role="region" aria-labelledby="t"><div class="head"><h2 id="t" tabindex="-1">Writing check</h2><button class="close" type="button" aria-label="Close the writing check">×</button></div><div id="out" aria-live="polite"><p class="soft">Checking…</p></div></section>`;
    document.documentElement.append(host);
    const out = root.getElementById("out");
    root.querySelector(".close").addEventListener("click", close);
    root.addEventListener("keydown", (e) => e.key === "Escape" && close());
    root.getElementById("t").focus();
    if (!field) {
      out.innerHTML = `<p>Click into the text box you are writing in, then run the check again.</p>`;
      return;
    }
    window.__crmWriteField = field;
    const text = textOf(field).trim();
    if (text.split(/\s+/).length < 8) {
      out.innerHTML = `<p>Write a few sentences first. The box has ${text ? "only a few words" : "no text"}.</p>`;
      return;
    }
    const E = window.ApplyEngine;
    const kind = /^(hi|hello|dear)\b/im.test(text) ? "<!-- kind: letter -->\n\n" : "";
    const rules = E ? E.lint(kind + text).filter((w) => !/bracket|bullets have no number|is only \d+ words/.test(w)) : [];
    const g = await grammar(text);

    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    let html = "";
    const fixes = (g.corrections || []).slice(0, 15);
    html += `<h3>Grammar and spelling</h3>`;
    if (g.note) html += `<p class="soft">${esc(g.note)}</p>`;
    else if (!fixes.length) html += `<p class="good">No grammar or spelling fixes.</p>`;
    else
      html += `<ul>${fixes
        .map((c) => `<li><del>${esc(text.slice(c.startIndex, c.endIndex))}</del> → <ins>${esc(c.correction)}</ins>${c.explanation ? `<div class="soft">${esc(c.explanation)}</div>` : ""}</li>`)
        .join("")}</ul>`;
    html += `<h3>Sounds human, reads easily</h3>`;
    html += rules.length ? `<ul>${rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : `<p class="good">No machine-sounding patterns found.</p>`;
    const words = text.split(/\s+/).length;
    html += `<p class="soft">${words} words.${kind && words > 200 ? " Emails of about 100 words get more replies." : ""}</p>`;
    html += `<div class="row">${fixes.length && !field.isContentEditable ? `<button type="button" id="apply">Apply grammar fixes</button>` : ""}${fixes.length ? `<button type="button" id="copy">Copy fixed text</button>` : ""}<button type="button" id="again">Check again</button></div>`;
    out.innerHTML = html;
    const btn = (id, fn) => root.getElementById(id) && root.getElementById(id).addEventListener("click", fn);
    btn("apply", () => {
      if (setText(field, g.corrected)) {
        out.insertAdjacentHTML("beforeend", `<p class="good">Grammar fixes applied to the box.</p>`);
        root.getElementById("apply").remove();
      }
    });
    btn("copy", async () => {
      try {
        await navigator.clipboard.writeText(g.corrected);
        out.insertAdjacentHTML("beforeend", `<p class="good">Fixed text copied.</p>`);
      } catch {
        out.insertAdjacentHTML("beforeend", `<p>Copy did not work here. Select the text by hand.</p>`);
      }
    });
    btn("again", run);
  }

  // The popup takes focus from the page, so the last box you typed in is remembered.
  if (!window.__crmWriteWatch) {
    window.__crmWriteWatch = true;
    document.addEventListener("focusin", (e) => editable(e.target) && (window.__crmLastField = e.target), true);
  }
  window.__crmWriteCheck = run;
})();
