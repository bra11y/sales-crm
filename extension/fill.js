// Runs inside the job application page. Fills empty boxes from the kit,
// attaches the CV, outlines what it filled, and reports back.
// It never presses Submit: you check the form and send it yourself.

(function () {
  const M = window.SalesCrmMatch;

  function text(node) {
    return node
      ? (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim()
      : "";
  }

  function labelOf(el) {
    const parts = [];
    if (el.labels && el.labels.length)
      parts.push([...el.labels].map(text).join(" "));
    const by = el.getAttribute("aria-labelledby");
    if (by)
      parts.push(
        by
          .split(/\s+/)
          .map((id) => text(document.getElementById(id)))
          .join(" "),
      );
    if (!parts.join("").trim()) {
      // Lever, Ashby and others put the question in a nearby element, not a <label for>.
      let p = el.parentElement;
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
        const q = p.querySelector(
          "label, legend, .application-label, [class*='label'], [class*='question']",
        );
        if (q && !q.contains(el)) {
          parts.push(text(q));
          break;
        }
      }
    }
    // A label can arrive twice (label element and aria-labelledby): keep each phrase once.
    return [
      ...new Set(parts.map((x) => x.replace(/\*/g, "").trim()).filter(Boolean)),
    ].join(" ");
  }

  const hints = (el) =>
    [el.getAttribute("aria-label"), el.placeholder, el.name, el.id]
      .filter(Boolean)
      .join(" ")
      .replace(/[_\[\]-]+/g, " ");

  function usable(el) {
    if (el.disabled || el.readOnly || el.getAttribute("aria-hidden") === "true")
      return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return el.type !== "file"
      ? el.offsetParent !== null || el.getClientRects().length > 0
      : true;
  }

  function setValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    for (const type of ["input", "change", "blur"])
      el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function mark(el) {
    el.style.outline = "2px solid #0a84ff";
    el.style.outlineOffset = "2px";
    el.dataset.salesCrm = "filled";
  }

  function pickOption(select, wanted) {
    const w = wanted.toLowerCase();
    const opt =
      [...select.options].find((o) => o.text.toLowerCase().trim() === w) ||
      [...select.options].find((o) => o.text.toLowerCase().includes(w));
    return opt ? opt.value : null;
  }

  function fromBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Search-as-you-type lists (Country, City): type, wait for the list, pick the match.
  async function pickFromList(el, value) {
    el.focus();
    setValue(el, value);
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    for (let i = 0; i < 8; i++) {
      await wait(150);
      const listId =
        el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
      const scope = (listId && document.getElementById(listId)) || document;
      const options = [...scope.querySelectorAll("[role='option']")];
      const v = value.toLowerCase();
      const hit =
        options.find((o) => text(o).toLowerCase() === v) ||
        options.find((o) => text(o).toLowerCase().startsWith(v)) ||
        options.find((o) => text(o).toLowerCase().includes(v));
      if (hit) {
        hit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        hit.click();
        return true;
      }
    }
    return false;
  }

  // Greenhouse hides the cover letter box behind an "Enter manually" button.
  async function openTypedCoverLetter() {
    for (const b of document.querySelectorAll("button")) {
      if (!/enter manually/i.test(text(b))) continue;
      // Walk up until the block names its field; take it only if that is the cover letter.
      for (
        let p = b.parentElement, i = 0;
        p && i < 5;
        p = p.parentElement, i++
      ) {
        const t = text(p).toLowerCase();
        if (/resume|cv\b/.test(t) && !/cover letter/.test(t)) break;
        if (/cover letter/.test(t)) {
          b.click();
          await wait(250);
          return;
        }
      }
    }
  }

  window.__salesCrmFill = async function (kit, cv) {
    const report = {
      filled: [],
      check: [],
      needs: [],
      resume: false,
      frame: location.host,
    };
    if (!M) return report;
    const fields = kit.fields || {};
    const unpicked = [];
    if (kit.generated && kit.generated.cover) await openTypedCoverLetter();

    // The CV goes into one upload box: the one named Resume or CV.
    const files = [...document.querySelectorAll("input[type='file']")]
      .filter((el) => !el.disabled && !el.files.length)
      .map((el) => ({ el, text: `${labelOf(el)} ${hints(el)}`.trim(), accept: el.accept }));
    const target = cv && M.pickResume(files);
    if (target) {
      try {
        const file = new File([fromBase64(cv.base64)], cv.name, { type: "application/pdf" });
        const dt = new DataTransfer();
        dt.items.add(file);
        target.el.files = dt.files;
        target.el.dispatchEvent(new Event("input", { bubbles: true }));
        target.el.dispatchEvent(new Event("change", { bubbles: true }));
        report.resume = true;
        report.filled.push({ label: "CV / resume", what: cv.name });
        await wait(300);
      } catch {
        unpicked.push("CV upload: attach the PDF yourself.");
      }
    }

    // Forms redraw after a pick (Country changes the phone box), so scan again
    // until nothing new fills. Only the last scan's "check" and "needs" count.
    for (let round = 0; round < 3; round++) {
      const before = report.filled.length;
      report.check = [];
      report.needs = [];
      for (const el of document.querySelectorAll("input, textarea, select")) {
        if (el.dataset.salesCrm === "filled" || !usable(el)) continue;
        const type = (el.type || "").toLowerCase();
        if (
          [
            "hidden",
            "submit",
            "button",
            "checkbox",
            "radio",
            "password",
            "search",
            "image",
            "reset",
          ].includes(type)
        )
          continue;
        const label = labelOf(el);
        const both = `${label} ${hints(el)}`.trim();

        if (type === "file") continue;
        if (el.value && el.value.trim()) continue;

        const key = M.classify(
          label || hints(el),
          el.getAttribute("autocomplete"),
          type,
        );
        if (key && fields[key]) {
          if (
            el.getAttribute("role") === "combobox" ||
            el.getAttribute("aria-autocomplete")
          ) {
            const picked = await pickFromList(el, fields[key]);
            mark(el);
            report.filled.push({ label: label || key, what: key });
            if (!picked)
              unpicked.push(
                `${label || key}: pick ${fields[key]} from the list.`,
              );
            continue;
          }
          if (el instanceof HTMLSelectElement) {
            const v = pickOption(el, fields[key]);
            if (v === null) continue;
            setValue(el, v);
          } else setValue(el, fields[key]);
          mark(el);
          report.filled.push({ label: label || key, what: key });
          continue;
        }
        if (el instanceof HTMLSelectElement || !label) continue;

        const hit = M.answerFor(both, kit);
        // A one-line box (like "GitHub URL") never gets a multi-line answer.
        if (hit && !(el instanceof HTMLTextAreaElement) && hit.answer.includes("\n")) continue;
        if (hit) {
          setValue(el, hit.answer);
          mark(el);
          report.filled.push({ label: label.slice(0, 80), what: hit.from });
          continue;
        }
        const missing = M.missingAnswer(label, kit) || M.missingAnswer(both, kit);
        if (missing) report.needs.push(missing.question);
        else if (el.required || el.getAttribute("aria-required") === "true")
          report.check.push(label.slice(0, 100));
      }
      if (report.filled.length === before) break;
      await wait(250);
    }
    report.check = [...new Set([...unpicked, ...report.check])];
    report.needs = [...new Set(report.needs)];
    return report;
  };

  // ---------- following the funnel ----------

  const SKIP_TYPES = ["hidden", "submit", "button", "checkbox", "radio", "password", "search", "image", "reset"];

  function fillableCount() {
    return [...document.querySelectorAll("input, textarea, select")].filter((el) => {
      const type = (el.type || "").toLowerCase();
      if (SKIP_TYPES.includes(type)) return false;
      return type === "file" ? !el.disabled : usable(el);
    }).length;
  }

  // What this page is: a form to fill, the thank-you page, or a listing with an Apply button.
  window.__salesCrmDetect = function () {
    const fields = fillableCount();
    let best = null;
    if (fields < 2 && M) {
      for (const el of document.querySelectorAll("a[href], button, [role='button']")) {
        if (!usable(el)) continue;
        // Never press a button that would send a form.
        if (el.form && (el.type || "").toLowerCase() === "submit") continue;
        const label = text(el) || el.getAttribute("aria-label") || "";
        const score = M.applyScore(label, el.href || "");
        if (score > (best ? best.score : 0)) best = { el, score, label };
      }
    }
    window.__salesCrmApplyTarget = best ? best.el : null;
    return {
      fields,
      success: fields < 2 && Boolean(M && M.isSuccess(text(document.body).slice(0, 20000))),
      apply: best ? best.label.slice(0, 60) : null,
      top: window === window.top,
    };
  };

  // Opens the form from a listing. Links open in this same tab, so the helper can follow.
  window.__salesCrmGoApply = function () {
    const el = window.__salesCrmApplyTarget;
    if (!el) return false;
    if (el.tagName === "A" && /^https?:/.test(el.href)) location.href = el.href;
    else el.click();
    return true;
  };
})();
