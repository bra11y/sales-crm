"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { parseChat, stillOpen } from "@/lib/import/whatsapp";
import { readZipText } from "@/lib/import/unzip";

type Result = { scholarships: { found: number; added: number }; jobs: { found: number; added: number; fit: number } };

// The chat is read here on your device. Only the posts go to the CRM, never names or numbers.
export default function ChatImport() {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<Result | null>(null);

  async function read(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setDone(null);
    setStatus(`Reading ${file.name}…`);
    try {
      const text = /\.zip$/i.test(file.name) || file.type.includes("zip") ? await readZipText(await file.arrayBuffer(), (n) => /(^|\/)_?chat\.txt$|\.txt$/i.test(n)) : await file.text();
      if (!text) throw new Error("No chat was found in that file. Export the chat again from WhatsApp: open the group, tap its name, then Export Chat.");
      const today = new Date().toISOString().slice(0, 10);
      const posts = parseChat(text).filter((p) => stillOpen(p, today));
      if (!posts.length) throw new Error("No open job or scholarship posts were found in that chat.");
      setStatus(`Found ${posts.length} open posts. Saving…`);
      // Scholarships need only their details; jobs keep some text so they can be scored.
      const slim = posts.map((p) => ({ ...p, text: p.kind === "job" ? p.text.slice(0, 1500) : "" }));
      const res = await fetch("/api/import/whatsapp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ posts: slim }) });
      const data = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok || !data.scholarships) throw new Error(data.error || "The import did not finish. Try again.");
      setDone(data as Result);
      setStatus(`Done. ${data.scholarships.added} new scholarships and ${data.jobs!.added} new jobs. ${data.jobs!.fit} of the jobs fit what you are looking for.`);
      router.refresh();
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "The import did not finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="import" aria-labelledby={`${id}-h`} className="flex scroll-mt-6 flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
      <h2 id={`${id}-h`} className="text-[20px] font-semibold tracking-[-0.015em]">
        Import a WhatsApp group
      </h2>
      <p className="text-soft leading-normal">
        In WhatsApp, open the group, tap its name, then Export Chat (without media is fine). Pick the .zip or .txt here. It is read on your device, and only the job and scholarship posts are saved,
        never who sent them. Import again any time: posts you already have are skipped.
      </p>
      <label htmlFor={`${id}-file`} className="text-[15px] font-medium">
        Exported chat
      </label>
      <input
        id={`${id}-file`}
        type="file"
        accept=".zip,.txt,application/zip,text/plain"
        aria-busy={busy}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => {
          read(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="text-soft file:bg-secondary file:text-foreground focus-visible:ring-ring file:border-line-strong min-h-11 w-full rounded-lg text-[15px] outline-none file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:px-4 file:text-[15px] focus-visible:ring-2"
      />
      <p role="status" aria-live="polite" className="text-soft empty:hidden">
        {status}
      </p>
      {done && done.jobs.fit > 0 && (
        <a href="/jobs" className="text-foreground self-start underline underline-offset-2">
          See the {done.jobs.fit} jobs that fit on your Jobs board
        </a>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
