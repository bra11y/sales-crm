type TagTone = "green" | "blue" | "neutral";

export const STATUS_LABEL = { new: "To review", saved: "Saved", applied: "Applied", dismissed: "Not for me" } as const;
export type Status = keyof typeof STATUS_LABEL;

export const WHERE_LABEL: Record<string, string> = {
  worldwide: "Worldwide",
  region: "Your region",
  local: "In your city",
  visa: "Visa sponsor",
  unknown: "Check location",
  restricted: "Not open to you",
};

export const BAND: Record<string, { label: string; tone: TagTone }> = {
  strong: { label: "Strong", tone: "green" },
  good: { label: "Good", tone: "blue" },
  maybe: { label: "Maybe", tone: "neutral" },
};

const DAY = 86_400_000;
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "Date unknown";
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months > 1 ? "s" : ""} ago` : `Over a year ago`;
}

export function payText(monthly: number | null) {
  return monthly === null ? "Not listed" : `About $${monthly.toLocaleString("en-US")} a month`;
}
