// When an email may go out: weekdays 08:00 to 18:00 in the employer's time zone,
// at most DAILY_LIMIT a day, GAP_SECONDS apart. Follow-ups go 5 and 10 days later.

export const DAILY_LIMIT = 40;
export const GAP_SECONDS = 15;
export const FOLLOW_UP_DAYS = 5;
export const HOME_ZONE = "Africa/Lagos";

const ZONES: [RegExp, string][] = [
  [/\b(san francisco|california|seattle|portland|los angeles|pst|pacific|vancouver)\b/i, "America/Los_Angeles"],
  [/\b(denver|mountain|mst)\b/i, "America/Denver"],
  [/\b(chicago|austin|texas|central|cst)\b/i, "America/Chicago"],
  [/\b(toronto|canada|montreal|ottawa)\b/i, "America/Toronto"],
  [/\b(usa?|united states|us-only|americas?|new york|boston|est|north america)\b/i, "America/New_York"],
  [/\b(brazil|são paulo|sao paulo|latam|latin america|argentina)\b/i, "America/Sao_Paulo"],
  [/\b(uk|united kingdom|london|england|ireland|dublin|scotland|portugal|lisbon)\b/i, "Europe/London"],
  [/\b(germany|berlin|munich|france|paris|spain|madrid|netherlands|amsterdam|italy|poland|sweden|denmark|norway|austria|switzerland|belgium|czech|europe|emea|eu|cet)\b/i, "Europe/Berlin"],
  [/\b(greece|romania|finland|ukraine|bulgaria|estonia|lithuania|latvia)\b/i, "Europe/Helsinki"],
  [/\b(israel|tel aviv)\b/i, "Asia/Jerusalem"],
  [/\b(uae|dubai)\b/i, "Asia/Dubai"],
  [/\b(india|bangalore|bengaluru)\b/i, "Asia/Kolkata"],
  [/\b(singapore|philippines|malaysia|apac|asia)\b/i, "Asia/Singapore"],
  [/\b(australia|sydney|melbourne)\b/i, "Australia/Sydney"],
  [/\b(kenya|nairobi)\b/i, "Africa/Nairobi"],
  [/\b(south africa|cape town|johannesburg)\b/i, "Africa/Johannesburg"],
];

export function guessZone(location: string): string {
  for (const [re, zone] of ZONES) if (re.test(location)) return zone;
  return HOME_ZONE;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(at: Date, zone: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekday: WEEKDAY[p.weekday] };
}

// The UTC moment when the clock in `zone` shows this date and time.
function zonedTime(year: number, month: number, day: number, hour: number, minute: number, zone: string): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), zone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - shown;
  }
  return new Date(guess);
}

export function inWindow(at: Date, zone: string): boolean {
  const p = localParts(at, zone);
  return p.weekday >= 1 && p.weekday <= 5 && p.hour >= 8 && p.hour < 18;
}

// The first moment at or after `from` inside the send window.
export function nextWindow(from: Date, zone: string): Date {
  if (inWindow(from, zone)) return from;
  const p = localParts(from, zone);
  let day = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (p.hour >= 8) day = new Date(day.getTime() + 86_400_000);
  for (;;) {
    const wd = day.getUTCDay();
    if (wd >= 1 && wd <= 5) return zonedTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 8, 10, zone);
    day = new Date(day.getTime() + 86_400_000);
  }
}

export function followUpTimes(sentAt: Date, zone: string): [Date, Date] {
  const day = 86_400_000;
  return [nextWindow(new Date(sentAt.getTime() + FOLLOW_UP_DAYS * day), zone), nextWindow(new Date(sentAt.getTime() + 2 * FOLLOW_UP_DAYS * day), zone)];
}

export type Budget = { ok: true } | { ok: false; reason: "daily_limit" | "too_soon"; waitSeconds: number };

// `sentLastDay` are the send times in the 24 hours before `now`.
export function sendBudget(sentLastDay: Date[], now: Date): Budget {
  if (sentLastDay.length >= DAILY_LIMIT) {
    const oldest = Math.min(...sentLastDay.map((d) => d.getTime()));
    return { ok: false, reason: "daily_limit", waitSeconds: Math.max(60, Math.ceil((oldest + 86_400_000 - now.getTime()) / 1000)) };
  }
  const last = Math.max(0, ...sentLastDay.map((d) => d.getTime()));
  const wait = Math.ceil((last + GAP_SECONDS * 1000 - now.getTime()) / 1000);
  return wait > 0 ? { ok: false, reason: "too_soon", waitSeconds: wait } : { ok: true };
}

export function zoneTime(at: Date, zone: string): string {
  const city = zone.split("/").pop()!.replace(/_/g, " ");
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return `${when} ${city} time`;
}
