// Finds the address a job post asks you to send your application to.
// Most addresses in a post are for privacy, security or interview adjustments.
// Those are never used: an address counts only when its sentence says to apply.

export type Contact = { email: string; sentence: string };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const APPLY = /\b(apply|applying|application|applications|send (?:us |me )?(?:your |a )?(?:cv|resume|résumé|portfolio|application)|email (?:us|me|your)|submit (?:your )?(?:cv|resume|application)|reach out|get in touch|interested\?)\b/i;
const NOT_APPLY = /\b(accommodat\w*|disabilit\w*|adjustments?|privacy|gdpr|personal data|data protection|security|vulnerabilit\w*|fraud|scam|phishing|report|complaint|unsubscribe|support for customers|press|media inquiries|assistance|questions?|help with|trouble|technical issues?)\b/i;
const BAD_LOCAL = /^(no-?reply|do-?not-?reply|privacy|security|dpo|gdpr|legal|abuse|accommodations?|recruitingaccommodations|accessibleinterviewing|support|help|billing|press|media|webmaster|postmaster|info-?privacy)$/i;
const BAD_DOMAIN = /(^|\.)(example\.(com|org)|sentry\.io|wixpress\.com|domain\.com|email\.com)$/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function usable(raw: string): string | null {
  const email = raw.replace(/\.$/, "").toLowerCase();
  const [local, domain] = email.split("@");
  if (BAD_LOCAL.test(local) || BAD_DOMAIN.test(domain) || /\.(png|jpe?g|gif|svg|webp)$/.test(domain)) return null;
  return email;
}

export function findContactEmail(description: string): Contact | null {
  const parts = sentences(description);
  for (const [i, sentence] of parts.entries()) {
    if (NOT_APPLY.test(sentence) || !APPLY.test(sentence)) continue;
    const found = sentence.match(EMAIL);
    for (const raw of found ?? []) {
      const email = usable(raw);
      if (email) return { email, sentence: sentence.slice(0, 300) };
    }
    // "To apply, send an email to" with the address on the next line by itself.
    if (found || !/\b(to|at|via|on)\s*:?$/i.test(sentence)) continue;
    const next = parts[i + 1] ?? "";
    const alone = next.match(/^<?([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})>?\.?$/);
    const email = alone && usable(alone[1]);
    if (email) return { email, sentence: `${sentence} ${email}`.slice(0, 300) };
  }
  return null;
}

// "with the email title [Full-Stack Developer @ Fluence]" or "Subject: Frontend role - your name".
// The exact subject line a post asks for, which many employers use to filter their inbox.
export function findRequiredSubject(description: string, title?: string): string | null {
  // "using the Job Title as the subject": the subject is the job's own title.
  if (title && /\b(?:the\s+)?(?:job\s+title|position(?:\s+applied\s+for)?|role(?:\s+applied\s+for)?)\s+as\s+(?:the\s+)?(?:e-?mail\s+)?subject\b/i.test(description)) return title.trim();
  const quoted = description.match(/\b(?:e-?mail|mail|message)?\s*(?:title|subject(?:\s+line)?)\s*(?:of|as|to be|should be|must be|must read|reading|:)?\s*[[“"'‘]([^\]”"'’\n]{3,150})[\]”"'’]/i);
  const plain = description.match(/\bsubject(?:\s+line)?\s*:\s*([^\n]{3,150})/i);
  // A quoted subject is kept exactly; a plain one loses the sentence's full stop.
  const subject = quoted ? quoted[1].trim() : (plain?.[1] ?? "").trim().replace(/[.\s]+$/, "");
  // A subject that asks you to fill something in, like "[Your name]", is written by you.
  if (!subject || (/\b(your|you)\b/i.test(subject) && !quoted)) return null;
  return subject;
}

export function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim()) && value.length <= 200;
}
