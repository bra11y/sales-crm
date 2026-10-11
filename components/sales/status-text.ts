const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

export function formatDay(iso: string | null) {
  return iso ? dateFormat.format(new Date(iso)) : "—";
}

export function receivingStatus(last: string | undefined, now: Date) {
  if (!last) return { word: "No events yet", detail: "Nothing has arrived from this app." };
  const days = Math.floor((now.getTime() - Date.parse(last)) / DAY);
  if (days <= 30) {
    return { word: "Receiving", detail: days === 0 ? "Last event today." : `Last event ${days} day${days === 1 ? "" : "s"} ago.` };
  }
  return { word: "Quiet", detail: `Last event on ${formatDay(last)}.` };
}
