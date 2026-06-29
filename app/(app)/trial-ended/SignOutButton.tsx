"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

// Minimal sign-out for the locked trial-ended shell. The normal topbar (which
// carries sign-out) isn't rendered while the workspace is gated, so this gives a
// gated user — especially a non-owner who can't subscribe — a way to leave.
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="mt-4 inline-flex items-center justify-center gap-2 text-xs font-medium text-ink-400 hover:text-ink disabled:opacity-60"
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </button>
  );
}
