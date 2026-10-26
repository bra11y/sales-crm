import type { Metadata } from "next";
import { Page, PageHead } from "@/components/workspace/parts";
import { STUDY } from "@/lib/grow/tools";

export const metadata: Metadata = { title: "Study and interview prep · Sales CRM", robots: { index: false } };

const CODE = "rounded-xl bg-black/40 p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all";

export default function StudyPage() {
  const t = STUDY;
  return (
    <Page>
      <PageHead title="Study and interview prep" intro={`${t.what} ${t.use}`} />

      <section aria-labelledby="facts" className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-5">
        <h2 id="facts" className="text-[20px] font-semibold tracking-[-0.015em]">
          {t.name}
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[15px] sm:grid-cols-4">
          {[
            ["Stars", t.stars],
            ["Last update", t.updated],
            ["Licence", t.licence],
            ["Open issues", String(t.issues)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-soft text-[13px]">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-soft text-[14px] leading-normal">
          Checked against your install rules on 26 October 2026. It runs on your own computer, and your books stay there.{" "}
          <a href={`https://github.com/${t.repo}`} target="_blank" rel="noopener" className="text-foreground underline underline-offset-2">
            Read the project page<span className="sr-only"> (opens in a new tab)</span>
          </a>{" "}
          before you install it.
        </p>
      </section>

      <section aria-labelledby="setup" className="flex flex-col gap-4">
        <h2 id="setup" className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          Set it up
        </h2>
        <ol className="flex list-decimal flex-col gap-4 pl-6 leading-normal marker:font-semibold">
          <li className="flex flex-col gap-2">
            <span>The safest way runs it in Docker, kept apart from the rest of your computer. With Docker running, paste this in Terminal:</span>
            <pre className={CODE}>{`docker run --rm --name deeptutor \\\n  -p 127.0.0.1:3782:3782 \\\n  -v deeptutor-data:/app/data \\\n  ghcr.io/hkuds/deeptutor:latest`}</pre>
          </li>
          <li>
            Open <span className="font-mono">http://127.0.0.1:3782</span> in your browser.
          </li>
          <li>
            In Settings, then Providers, add an AI. To keep it free, use the same free provider the CRM uses, or a model on your own computer with Ollama. Type the key there yourself. Never paste keys
            into a chat.
          </li>
          <li>Add your books and notes to the Knowledge Center.</li>
        </ol>
      </section>

      <section aria-labelledby="use" className="flex flex-col gap-3">
        <h2 id="use" className="px-1 text-[20px] font-semibold tracking-[-0.015em]">
          Ways to use it
        </h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            ["Before an interview", "Add the job post and your interview books. Ask for 10 questions they are likely to ask, then practise your answers in Quiz mode."],
            ["For a certificate", "Add the study guide. Use Mastery Path to work through it, and Quiz to test yourself each week."],
            ["For a scholarship essay", "Add the scholarship's rules and past winners' stories. Use Research to find what they value, then write the essay yourself."],
            ["For a new skill", "Add a course or book. Course Study turns it into lessons. Add the skill as a step under Career goals."],
          ].map(([h, p]) => (
            <li key={h} className="flex flex-col gap-1 rounded-xl bg-white/[0.04] px-4 py-3">
              <h3 className="font-medium">{h}</h3>
              <p className="text-soft text-[14px] leading-normal">{p}</p>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
