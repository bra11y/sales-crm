// Fetches one public web page to check. Only https sites on public addresses: no local or
// private network addresses, so the server can't be pointed at itself.

import { lookup } from "node:dns/promises";

const PRIVATE = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)|^::1$|^f[cd]|^fe80:/i;

export function siteUrl(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    u.protocol = "https:";
    if (!u.hostname.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(":") || /localhost$/i.test(u.hostname) || u.username || u.password) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

export async function fetchPage(u: URL): Promise<{ ok: true; html: string; url: string } | { ok: false; error: string }> {
  let url = u;
  for (let hop = 0; hop < 4; hop++) {
    const addr = await lookup(url.hostname).catch(() => null);
    if (!addr || PRIVATE.test(addr.address)) return { ok: false, error: "That address can't be checked." };
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (accessibility check; Sales CRM)", accept: "text/html" }, signal: AbortSignal.timeout(15_000) }).catch(
      () => null,
    );
    if (!res) return { ok: false, error: "The site did not answer in 15 seconds." };
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = siteUrl(new URL(res.headers.get("location")!, url).toString());
      if (!next) return { ok: false, error: "The site redirects somewhere that can't be checked." };
      url = next;
      continue;
    }
    if (!res.ok) return { ok: false, error: `The site answered ${res.status}.` };
    if (!/html/i.test(res.headers.get("content-type") ?? "")) return { ok: false, error: "That address is not a web page." };
    const html = (await res.text()).slice(0, 3_000_000);
    return { ok: true, html, url: url.toString() };
  }
  return { ok: false, error: "The site redirects too many times." };
}
