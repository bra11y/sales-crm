"use client";

import Button from "@/components/_ui/button";

export default function CrmError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-start gap-4 p-6">
      <h1>Something went wrong loading the CRM</h1>
      <p className="text-subtle">Your data is safe. Try again, and if it keeps happening, check that the database is running.</p>
      <Button variant="secondary" size="md" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
