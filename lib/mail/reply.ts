// Reads an incoming email and decides if it answers one of our applications,
// and what stage it suggests. Plain keyword rules: no AI, no cost.

export type Stage = "interview" | "closed" | "replied";
export type Sent = { id: string; messageId: string; toEmail: string };
export type Incoming = { messageId: string; from: string; subject: string; text: string; inReplyTo?: string; references?: string[]; autoSubmitted?: string; receivedAt?: string };

const AUTO = /\b(out of (the )?office|automatic reply|auto(-|matic )?reply|autoreply|on vacation|away from (my|the) (desk|office)|delivery status notification|undeliverable|mail delivery (failed|subsystem))\b/i;
const INTERVIEW = /\b(interview|schedule|scheduling|call|chat|calendly|next steps?|availability|available (to|for)|meet|move forward with you|assessment|take-home|technical test)\b/i;
const CLOSED = /\b(unfortunately|not (be )?moving forward|other candidates|decided to (pursue|move forward with) other|position (has been|is) (filled|closed)|no longer (open|available|hiring)|not a (fit|match)|regret to inform|will not be proceeding)\b/i;

export function isAutoReply(m: Pick<Incoming, "subject" | "text" | "autoSubmitted">): boolean {
  if (m.autoSubmitted && m.autoSubmitted.toLowerCase() !== "no") return true;
  return AUTO.test(m.subject) || AUTO.test(m.text.slice(0, 400));
}

export function suggestStage(subject: string, text: string): Stage {
  const body = `${subject}\n${text.slice(0, 3000)}`;
  if (CLOSED.test(body)) return "closed";
  if (INTERVIEW.test(body)) return "interview";
  return "replied";
}

const bare = (id: string) => id.trim().replace(/^<|>$/g, "").toLowerCase();
const domainOf = (email: string) => email.split("@").pop()?.toLowerCase() ?? "";

// Thread headers first. The sender's domain is the backup, for replies sent as a new email.
export function matchReply(m: Incoming, sent: Sent[]): Sent | null {
  const refs = new Set([m.inReplyTo ?? "", ...(m.references ?? [])].filter(Boolean).map(bare));
  const byThread = sent.find((s) => refs.has(bare(s.messageId)));
  if (byThread) return byThread;
  const from = domainOf(m.from);
  if (!from || /^(gmail|googlemail|yahoo|outlook|hotmail|icloud|proton|protonmail)\.(com|me)$/.test(from)) {
    return sent.find((s) => s.toEmail.toLowerCase() === m.from.toLowerCase()) ?? null;
  }
  return sent.find((s) => domainOf(s.toEmail) === from) ?? null;
}

export function snippet(text: string): string {
  const fresh = text.split(/\n(?:On .{5,120}wrote:|-{2,} ?Original Message|From: )/)[0];
  return fresh.replace(/^>.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 500);
}
