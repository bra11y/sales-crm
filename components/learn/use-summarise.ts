"use client";

import { useCallback, useState } from "react";
import { finishSummary, planSummary, summarisePart } from "@/app/(crm)/notes/actions";

// Writes a note's summary in steps: one request per part of a long video or book, then the
// summary itself. Each step is short, and the page says where it is.
export function useSummarise(noteId: string, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("Getting ready to write the summary…");
    const plan = await planSummary(noteId);
    if (!plan.ok) {
      setBusy(false);
      setStatus("");
      return setError(plan.error);
    }
    if (plan.parts > 1) {
      for (let i = 0; i < plan.parts; i++) {
        setStatus(`Reading part ${i + 1} of ${plan.parts}…`);
        const r = await summarisePart(noteId, i);
        if (!r.ok) {
          setBusy(false);
          setStatus("");
          return setError(`${r.error} Press “Write the summary” to try again.`);
        }
      }
    }
    setStatus("Writing the summary, questions and post drafts…");
    const done = await finishSummary(noteId);
    setBusy(false);
    if (!done.ok) {
      setStatus("");
      return setError(`${done.error} Press “Write the summary” to try again.`);
    }
    setStatus("The summary is ready.");
    onDone();
  }, [busy, noteId, onDone]);

  return { run, busy, status, error };
}
