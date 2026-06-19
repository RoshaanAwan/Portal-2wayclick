"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Check, X, Loader2 } from "lucide-react";

type State = "idle" | "approving" | "approved" | "error";

/**
 * Approve / deny controls on the phone's link-approval page. Approving calls the
 * authenticated approve endpoint; the waiting device (which is polling) then
 * claims its session. Denying just walks away — the ticket simply expires.
 */
export function ApproveActions({
  token,
  alreadyApproved,
}: {
  token: string;
  alreadyApproved: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>(alreadyApproved ? "approved" : "idle");
  const [error, setError] = useState("");

  async function approve() {
    setState("approving");
    setError("");
    try {
      const res = await fetch("/api/auth/qr/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not approve");
      }
      setState("approved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve");
      setState("error");
    }
  }

  if (state === "approved") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-4 text-center">
        <CheckCircle2 className="h-7 w-7 text-success" />
        <p className="text-sm font-semibold text-ink">Device approved</p>
        <p className="text-xs text-ink-500">
          You can return to the other device — it&apos;s signing in now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <button
        onClick={approve}
        disabled={state === "approving"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {state === "approving" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        Approve this device
      </button>
      <button
        onClick={() => router.push("/dashboard")}
        disabled={state === "approving"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-500 transition hover:border-line-strong hover:text-ink disabled:opacity-60"
      >
        <X className="h-4 w-4" />
        Not me / cancel
      </button>
      {error && <p className="text-center text-xs text-danger-ink">{error}</p>}
    </div>
  );
}
