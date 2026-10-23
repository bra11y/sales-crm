// The in-page panel. It stays on the page while you move through the application,
// shows each step, and has the one button you need next. Styles live in a shadow
// root so the job site cannot change them, and they cannot change the job site.

(function () {
  if (window.__salesCrmPanel) return;

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.sheet {
  --bg: rgba(255,255,255,0.82); --solid: #ffffff; --text: #1c1c1e; --soft: #5b5b60; --line: rgba(60,60,67,0.18);
  --accent: #0060df; --accent-text: #fff; --good: #1a7f37; --warn: #8a5300; --danger: #c4121c;
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(22rem, calc(100vw - 32px));
  max-height: min(34rem, calc(100vh - 32px)); overflow: auto;
  font: 0.9375rem/1.4 system-ui, -apple-system, "SF Pro Text", sans-serif; color: var(--text);
  background: var(--bg); -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: blur(24px) saturate(180%);
  border-radius: 18px; border: 0.5px solid rgba(255,255,255,0.5);
  box-shadow: 0 18px 50px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.12);
  transform-origin: bottom right; animation: rise 320ms cubic-bezier(0.2, 0.9, 0.3, 1);
}
@media (prefers-color-scheme: dark) {
  .sheet { --bg: rgba(30,30,32,0.8); --solid: #1c1c1e; --text: #f5f5f7; --soft: #a1a1a6; --line: rgba(84,84,88,0.55);
    --accent: #0a84ff; --accent-text: #000; --good: #30d158; --warn: #ffd60a; --danger: #ff6961; border-color: rgba(255,255,255,0.12); }
}
@media (prefers-reduced-transparency: reduce) { .sheet { background: var(--solid); backdrop-filter: none; -webkit-backdrop-filter: none; } }
@media (prefers-contrast: more) { .sheet { background: var(--solid); border: 1px solid currentColor; --soft: var(--text); } }
@keyframes rise { from { opacity: 0; transform: translateY(12px) scale(0.96); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .sheet { animation: fade 200ms ease; } @keyframes fade { from { opacity: 0; } } }
.head { display: flex; align-items: flex-start; gap: 8px; padding: 14px 10px 6px 16px; }
.titles { flex: 1; min-width: 0; }
.eyebrow { margin: 0; font-size: 0.75rem; font-weight: 600; color: var(--soft); letter-spacing: 0.02em; }
h2 { margin: 2px 0 0; font-size: 1.0625rem; line-height: 1.25; font-weight: 600; letter-spacing: -0.01em; }
.company { margin: 0; font-size: 0.8125rem; color: var(--soft); }
.icon { all: unset; cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; color: var(--soft); font-size: 1.1rem; }
.icon:hover { background: var(--line); color: var(--text); }
.icon:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.body { padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
ol.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
ol.steps li { display: flex; gap: 10px; align-items: center; min-height: 30px; font-size: 0.875rem; color: var(--soft); }
ol.steps li .dot { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 0.6875rem; font-weight: 700; border: 1.5px solid var(--line); flex: none; }
ol.steps li[data-state="done"] { color: var(--text); }
ol.steps li[data-state="done"] .dot { background: var(--good); border-color: var(--good); color: #fff; }
ol.steps li[data-state="now"] { color: var(--text); font-weight: 600; }
ol.steps li[data-state="now"] .dot { border-color: var(--accent); color: var(--accent); }
.status { margin: 0; font-size: 0.875rem; line-height: 1.45; }
.status[data-tone="good"] { color: var(--good); font-weight: 600; }
.status[data-tone="bad"] { color: var(--danger); }
details { font-size: 0.8125rem; }
summary { cursor: pointer; color: var(--soft); min-height: 32px; display: flex; align-items: center; }
details ul { margin: 4px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
.warn { color: var(--warn); }
.actions { display: flex; flex-direction: column; gap: 8px; }
button.primary, button.secondary { all: unset; box-sizing: border-box; cursor: pointer; text-align: center; min-height: 44px; border-radius: 12px; font-weight: 600; font-size: 0.9375rem; padding: 0 14px; display: grid; place-items: center; transition: transform 100ms ease-out; }
button.primary { background: var(--accent); color: var(--accent-text); }
button.secondary { background: var(--line); color: var(--text); }
button.primary:active, button.secondary:active { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) { button.primary:active, button.secondary:active { transform: none; opacity: 0.8; } }
.foot { margin: 0; font-size: 0.75rem; color: var(--soft); }
.mini { all: unset; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; cursor: pointer; padding: 10px 14px; border-radius: 999px;
  font: 600 0.875rem system-ui, -apple-system, sans-serif; color: #fff; background: #0060df; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
[hidden] { display: none !important; }
.mini:focus-visible { outline: 2px solid #fff; outline-offset: -4px; }
`;

  const STEPS = ["Find the form", "Fill it in", "You check it and press Submit", "Saved as applied"];
  const STEP_OF = { finding: 0, opening: 0, nothing: 0, connect: 0, error: 0, filled: 2, success: 4 };

  const host = document.createElement("div");
  host.id = "sales-crm-panel";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${CSS}</style><section class="sheet" role="region" aria-label="Sales CRM application helper"></section><button type="button" class="mini" hidden>Sales CRM</button>`;
  const sheet = root.querySelector(".sheet");
  const mini = root.querySelector(".mini");
  document.documentElement.append(host);

  const send = (type) => chrome.runtime.sendMessage({ type });
  const el = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "text") n.textContent = v;
      else if (k === "on") n.addEventListener("click", v);
      else n.setAttribute(k, v);
    }
    n.append(...kids);
    return n;
  };
  const list = (title, items, cls) => (items && items.length ? el("details", {}, [el("summary", { text: `${title} (${items.length})` }), el("ul", cls ? { class: cls } : {}, items.map((i) => el("li", { text: i })))]) : "");

  function minimize(on) {
    sheet.hidden = on;
    mini.hidden = !on;
    (on ? mini : sheet.querySelector("button")).focus();
  }
  mini.addEventListener("click", () => minimize(false));
  sheet.addEventListener("keydown", (e) => e.key === "Escape" && minimize(true));

  function render(s) {
    const at = STEP_OF[s.step] ?? 1;
    const buttons = [];
    if (s.step === "filled") {
      buttons.push(el("button", { type: "button", class: "primary", text: "I pressed Submit: mark as applied", on: () => send("mark-applied") }));
      buttons.push(el("button", { type: "button", class: "secondary", text: "Fill this page again", on: () => send("fill-now") }));
    } else if (s.step === "nothing" || s.step === "error") {
      buttons.push(el("button", { type: "button", class: "primary", text: "Fill this page", on: () => send("fill-now") }));
      if (s.maybeApplied) buttons.push(el("button", { type: "button", class: "secondary", text: "I applied: mark as applied", on: () => send("mark-applied") }));
    } else if (s.step === "success") {
      buttons.push(el("button", { type: "button", class: "secondary", text: "Close", on: () => send("stop") }));
    }

    sheet.replaceChildren(
      el("div", { class: "head" }, [
        el("div", { class: "titles" }, [
          el("p", { class: "eyebrow", text: "SALES CRM" }),
          el("h2", { text: s.job?.title || "Applying" }),
          s.job?.company ? el("p", { class: "company", text: s.job.company }) : "",
        ]),
        el("button", { type: "button", class: "icon", "aria-label": "Minimise the helper", text: "–", on: () => minimize(true) }),
        el("button", { type: "button", class: "icon", "aria-label": "Stop helping with this application", text: "×", on: () => send("stop") }),
      ]),
      el("div", { class: "body" }, [
        el(
          "ol",
          { class: "steps", "aria-label": "Steps" },
          STEPS.map((label, i) => {
            const state = i < at || (s.step === "success" && i <= at) ? "done" : i === at ? "now" : "todo";
            return el("li", { "data-state": state, ...(state === "now" ? { "aria-current": "step" } : {}) }, [el("span", { class: "dot", "aria-hidden": "true", text: state === "done" ? "✓" : String(i + 1) }), el("span", { text: label })]);
          }),
        ),
        el("p", { class: "status", role: "status", "aria-live": "polite", "data-tone": s.tone || "", text: s.message || "" }),
        list("Filled", s.filled),
        list("Check these yourself", s.check, "warn"),
        list("Add once in your Profile", s.needs),
        buttons.length ? el("div", { class: "actions" }, buttons) : "",
        el("p", { class: "foot", text: "You press Submit. The helper never does." }),
      ]),
    );
  }

  // Single-page forms change without loading a new page (a new step, or the thank-you
  // message). When the number of boxes changes, ask the helper to look again.
  const count = () => document.querySelectorAll("input:not([type=hidden]), textarea, select").length;
  let last = count();
  let wait = 0;
  new MutationObserver(() => {
    clearTimeout(wait);
    wait = setTimeout(() => {
      const now = count();
      if (now !== last && window.__salesCrmPanel) {
        last = now;
        send("page-changed");
      }
    }, 1500);
  }).observe(document.body, { childList: true, subtree: true });

  window.__salesCrmPanel = {
    show(state) {
      if (!host.isConnected) document.documentElement.append(host);
      render(state);
    },
    remove() {
      host.remove();
      window.__salesCrmPanel = null;
    },
  };
})();
