"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, LogOut } from "lucide-react";

// Persistent banner shown while a platform admin is impersonating a tenant user.
// "Exit" ends the impersonation session and returns to the login screen (the
// admin re-authenticates as themselves).
export function ImpersonationBanner({ userName }: { userName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-warn px-4 py-2 text-sm font-medium text-warn-ink">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span>
        Impersonating <strong>{userName}</strong>
      </span>
      <button
        onClick={exit}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-warn-ink/10 px-2 py-0.5 text-xs font-semibold hover:bg-warn-ink/20"
      >
        <LogOut className="h-3.5 w-3.5" /> Exit
      </button>
    </div>
  );
}
