// Decides what goes in each box of a job application form. Plain rules, no AI.
// Used by the Chrome extension in the page, and by tests in Node.

(function (root) {
  // A field's "text" is its label, name, id, placeholder and aria-label, joined.
  const FIELDS = [
    ["firstName", /\b(first|given|fore)[ _-]?name\b|^first$|fname/],
    ["lastName", /\b(last|family|sur)[ _-]?name\b|^last$|lname|surname/],
    ["email", /e-?mail/],
    ["phone", /phone|mobile|tel\b|telephone|cell/],
    ["linkedin", /linked ?in/],
    ["github", /github/],
    ["portfolio", /portfolio|personal (web)?site|website|your site|\burl\b|link to your work|work samples?/],
    ["city", /\bcity\b|town/],
    ["country", /\bcountry\b/],
    ["location", /location|where are you (based|located)|current address|based in|address/],
    ["fullName", /full[ _-]?name|^name\b|your name|legal name|\bname$/],
  ];

  const AUTOCOMPLETE = { "given-name": "firstName", "family-name": "lastName", name: "fullName", email: "email", tel: "phone", "address-level2": "city", "country-name": "country", country: "country", url: "portfolio" };

  function classify(text, autocomplete, type) {
    if (autocomplete && AUTOCOMPLETE[autocomplete]) return AUTOCOMPLETE[autocomplete];
    if (type === "email") return "email";
    if (type === "tel") return "phone";
    const t = (text || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!t || /password|captcha|search/.test(t)) return null;
    // Your Profile says where you live, not your passport: leave these for you.
    if (/passport|citizen|nationalit/.test(t)) return null;
    // Long labels are questions, not contact fields ("What's the name of a product you love?").
    if (t.split(" ").length > 9) return null;
    // "Company name" or "Referrer name" is someone else's name, not yours.
    const other = /compan|employer|school|universit|referr|referen|manager|recruiter|emergency|pronoun/.test(t);
    for (const [key, re] of FIELDS) if (re.test(t) && !(other && /name/.test(key.toLowerCase()))) return key;
    return null;
  }

  // Generated answers the server sends, picked by what the question asks.
  const ASKS = [
    ["cover", /cover letter|letter of (motivation|interest)|motivation letter/],
    ["why", /why (do you want|are you interested|would you like|this (role|company|job))|why .{0,40}(us|join|company|team)\b|what (excites|interests|attracts) you|motivat/],
    ["proof", /project|proud|accomplishment|achievement|example of (your )?work|something you('ve| have) (built|made|shipped)|tell us about (a time|your work)|relevant experience|experience with/],
    ["links", /portfolio|work samples?|links? to (your )?(work|projects)|github|case stud/],
    ["hear", /how did you (hear|find|learn)|where did you (hear|find|see)|referr(al|ed) (source|by)|source of application/],
    ["extra", /anything else|additional (information|info|comments)|is there anything/],
  ];

  // Returns { answer, from } or null. Your saved answers win over generated ones.
  function answerFor(question, kit) {
    const q = (question || "").toLowerCase().replace(/\s+/g, " ");
    if (!q.trim()) return null;
    for (const a of kit.answers || []) {
      if (!a.answer) continue;
      const words = a.words && a.words.length ? a.words : [a.question.toLowerCase()];
      if (words.some((w) => w && q.includes(w.toLowerCase()))) return { answer: a.answer, from: "Your saved answer: " + a.question };
    }
    for (const [key, re] of ASKS) {
      const answer = kit.generated && kit.generated[key];
      if (answer && re.test(q)) return { answer, from: key };
    }
    return null;
  }

  // Which saved question a form question needs, when you have not filled it yet.
  function missingAnswer(question, kit) {
    const q = (question || "").toLowerCase();
    return (kit.answers || []).find((a) => !a.answer && (a.words || []).some((w) => q.includes(w.toLowerCase()))) || null;
  }

  function isResumeInput(text, accept) {
    const t = (text || "").toLowerCase();
    if (/cover/.test(t)) return false;
    return /resume|résumé|\bcv\b|curriculum/.test(t) || (/pdf/.test(accept || "") && !/photo|image|avatar/.test(t));
  }

  // Of several upload boxes, the one named Resume or CV wins over any box that takes a PDF.
  function pickResume(candidates) {
    const named = candidates.find((c) => !/cover|autofill|parse/i.test(c.text) && /resume|résumé|\bcv\b|curriculum/i.test(c.text));
    if (named) return named;
    return candidates.find((c) => !/autofill|parse/i.test(c.text) && isResumeInput(c.text, c.accept)) || null;
  }

  const API = { classify, answerFor, missingAnswer, isResumeInput, pickResume };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SalesCrmMatch = API;
})(this);
