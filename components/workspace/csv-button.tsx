"use client";

import Button from "@/components/_ui/button";

// Downloads rows the server already prepared, as a CSV file.
export default function CsvButton({ csv, name, label = "Download CSV" }: { csv: string; name: string; label?: string }) {
  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <Button variant="secondary" size="md" className="h-11 px-4" onClick={download}>
      {label}
    </Button>
  );
}
