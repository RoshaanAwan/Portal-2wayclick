"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Tiny client island so the public (server-rendered) shared invoice page can
// offer a "Download / Print" action without becoming a client component itself.
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Download className="h-4 w-4" />
      Download / Print
    </Button>
  );
}
