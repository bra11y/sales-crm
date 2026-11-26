"use client";

import { useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import { refreshMarketNow } from "@/app/(crm)/market/actions";

export default function RefreshMarket() {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="primary"
        size="md"
        className="h-10 rounded-xl px-4"
        aria-disabled={pending}
        onClick={() =>
          !pending &&
          start(async () => {
            setProblem("");
            setStatus("Reading the CBN and the news. This takes about 30 seconds…");
            const r = await refreshMarketNow();
            setStatus(r.ok ? "Today's figures are in." : "");
            if (!r.ok) setProblem(r.error);
          })
        }
      >
        {pending ? "Reading…" : "Read today's figures"}
      </Button>
      <p role="status" aria-live="polite" className="text-soft text-[13px] empty:hidden">
        {status}
      </p>
      {problem && (
        <p role="alert" className="text-danger text-[13px]">
          {problem}
        </p>
      )}
    </div>
  );
}
