"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RequestFormModal } from "./RequestFormModal";

// The "Request time off" entry point — opens the shared create/edit modal in
// create mode. (Edit mode is opened from each row in MyRequests.)
export function RequestComposer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="md">
        <Plus className="h-4 w-4" />
        Request time off
      </Button>

      <RequestFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
