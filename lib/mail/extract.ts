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

export function findContactEmail(description: string): Contact | null {
  for (const sentence of sentences(description)) {
    const found = sentence.match(EMAIL);
    if (!found || NOT_APPLY.test(sentence) || !APPLY.test(sentence)) continue;
    for (const raw of found) {
      const email = raw.replace(/\.$/, "").toLowerCase();
      const [local, domain] = email.split("@");
      if (BAD_LOCAL.test(local) || BAD_DOMAIN.test(domain) || /\.(png|jpe?g|gif|svg|webp)$/.test(domain)) continue;
      return { email, sentence: sentence.slice(0, 300) };
    }
  }
  return null;
}

export function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim()) && value.length <= 200;
}
