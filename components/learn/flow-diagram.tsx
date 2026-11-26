"use client";

import { useEffect, useId, useRef, useState } from "react";

// Mermaid (MIT, github.com/mermaid-js/mermaid) draws the flow of a note's ideas. The same steps are
// listed below it, so the diagram is never the only way to read them.
const clean = (s: string) => s.replace(/["`<>{}[\]()|#;]/g, " ").replace(/\s+/g, " ").trim();

export function flowSource(steps: string[]): string {
  const nodes = steps.map((s, i) => `  s${i}["${clean(s)}"]`);
  const links = steps.slice(1).map((_, i) => `  s${i} --> s${i + 1}`);
  return ["flowchart TD", ...nodes, ...links].join("\n");
}

export default function FlowDiagram({ steps, title }: { steps: string[]; title: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            darkMode: true,
            background: "#1f1f1f",
            primaryColor: "#2a2a2a",
            primaryTextColor: "#f5f5f5",
            primaryBorderColor: "#6b6b6b",
            lineColor: "#a4a4a4",
            fontFamily: "inherit",
            fontSize: "14px",
          },
          flowchart: { curve: "basis", nodeSpacing: 24, rankSpacing: 28 },
        });
        const { svg } = await mermaid.render(`flow-${id}`, flowSource(steps));
        if (gone || !box.current) return;
        box.current.innerHTML = svg;
        const el = box.current.querySelector("svg");
        el?.setAttribute("aria-hidden", "true");
        el?.setAttribute("focusable", "false");
        el?.style.setProperty("max-width", "100%");
      })
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
    };
  }, [id, steps]);

  return (
    <figure className="flex flex-col gap-3">
      {!failed && <div ref={box} className="flex min-h-40 justify-center overflow-x-auto rounded-2xl bg-white/[0.04] p-4 outline outline-1 -outline-offset-1 outline-white/[0.06]" />}
      <figcaption className="flex flex-col gap-2">
        <span className="sr-only">Flowchart of {title}, as a list of steps:</span>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-[14px] leading-normal">
          {steps.map((s, i) => (
            <li key={`${i}-${s}`}>{s}</li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
