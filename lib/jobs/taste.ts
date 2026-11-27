// What your own choices say: words in the titles of jobs you applied to or saved count up,
// words in the titles of jobs you dismissed count down. New jobs whose titles share those words
// move up or down the list, so the list follows what you actually pick, not only your Profile.

export type Taste = Record<string, number>;

const STOP = new Set(["and", "the", "for", "with", "remote", "job", "role", "full", "time", "part", "contract", "hybrid", "onsite", "worldwide", "global", "team", "new", "of", "in", "at"]);
const LIKED = ["saved", "applied", "replied", "interview", "offer", "no_reply", "rejected"];

export function titleWords(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)];
}

// A word needs two jobs behind it, so one odd pick does not move the list.
export function learnTaste(jobs: { title: string; status: string }[]): Taste {
  const seen: Record<string, { up: number; down: number }> = {};
  for (const j of jobs) {
    const up = LIKED.includes(j.status);
    if (!up && j.status !== "dismissed") continue;
    for (const w of titleWords(j.title)) {
      const s = (seen[w] ??= { up: 0, down: 0 });
      if (up) s.up++;
      else s.down++;
    }
  }
  const taste: Taste = {};
  for (const [w, s] of Object.entries(seen)) {
    if (s.up + s.down < 2) continue;
    const weight = Math.max(-8, Math.min(8, (s.up - s.down * 2) * 2));
    if (weight) taste[w] = weight;
  }
  return taste;
}

export function tasteScore(title: string, taste: Taste | undefined): { points: number; up: string[]; down: string[] } {
  if (!taste) return { points: 0, up: [], down: [] };
  const words = titleWords(title).filter((w) => taste[w]);
  const points = Math.max(-15, Math.min(15, words.reduce((n, w) => n + taste[w], 0)));
  return { points, up: words.filter((w) => taste[w] > 0), down: words.filter((w) => taste[w] < 0) };
}

type Db = { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { in: (c: string, v: string[]) => { limit: (n: number) => PromiseLike<{ data: { title: string; status: string }[] | null }> } } } } };

export async function loadTaste(db: Db, userId: string): Promise<Taste> {
  const { data } = await db
    .from("job_posts")
    .select("title, status")
    .eq("user_id", userId)
    .in("status", [...LIKED, "dismissed"])
    .limit(1000);
  return learnTaste(data ?? []);
}
