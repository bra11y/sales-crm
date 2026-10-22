// The job id inside an ATS link: Greenhouse "/jobs/4012345", Lever and Ashby UUIDs.
export function jobKey(pageUrl: string): string | null {
  try {
    const parts = new URL(pageUrl).pathname.split("/").filter((p) => /\d/.test(p) && p.length >= 5 && /^[A-Za-z0-9-]+$/.test(p));
    const gh = new URL(pageUrl).searchParams.get("gh_jid");
    return gh && /^\d+$/.test(gh) ? gh : (parts.pop() ?? null);
  } catch {
    return null;
  }
}
